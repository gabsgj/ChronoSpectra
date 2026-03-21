from __future__ import annotations

import asyncio
import json
import pickle
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock, RLock
from time import perf_counter
from typing import Any, Callable

import torch

from data.cache.data_cache import DataCache
from models.base_model import MODEL_STORE_DIR, BaseModel
from models.model_registry import ModelRegistry
from models.per_stock_cnn import PerStockCNN
from models.unified_cnn import UnifiedCNN
from models.unified_cnn_with_embeddings import UnifiedCNNWithEmbeddings
from training.dataset_builder import DatasetBuilder
from training.evaluator import Evaluator
from training.train_loop import TrainLoop
from training.training_types import (
    DatasetBundle,
    EvaluationReport,
    ScalingMetadata,
    SpectrogramDataset,
    TrainingRunResult,
)

RETRAINING_DIR = Path(__file__).resolve().parent
RETRAIN_LOG_PATH = RETRAINING_DIR / "retrain_log.json"
PREDICTION_HISTORY_DIR = RETRAINING_DIR / "prediction_history"
REPORT_STORE_DIR = MODEL_STORE_DIR / "reports"
RETRAIN_REASON_MANUAL = "manual"
DEFAULT_CACHE_TTL_SECONDS = 300
EpochProgressCallback = Callable[[dict[str, Any]], None]
StatusProgressCallback = Callable[[dict[str, Any]], None]
SHARED_TRAINING_STOCK_ID = "ALL_STOCKS"
SUPPORTED_TRAINING_MODES = {"per_stock", "unified", "unified_with_embeddings"}

_FILE_LOCK = RLock()
_STATUS_LOCK = Lock()
_ACTIVE_JOBS: dict[str, dict[str, Any]] = {}
_LAST_COMPLETED_JOB: dict[str, Any] | None = None


@dataclass(slots=True)
class RetrainingArtifacts:
    mode: str
    checkpoint_path: Path
    report_path: Path
    scaler_paths: dict[str, str]
    evaluation_report: EvaluationReport
    training_run: TrainingRunResult
    dataset_summary: dict[str, Any]


class RetrainingError(Exception):
    """Base exception for retraining failures."""


class RetrainingAlreadyRunningError(RetrainingError):
    """Raised when a stock already has an active retraining job."""


class RetrainingExecutionError(RetrainingError):
    """Raised when a retraining job starts but does not complete successfully."""


def load_retraining_log() -> dict[str, Any]:
    payload = _read_json(RETRAIN_LOG_PATH, {"retrain_history": []})
    history = payload.get("retrain_history")
    if not isinstance(history, list):
        return {"retrain_history": []}
    return {"retrain_history": history}


def load_retraining_history() -> list[dict[str, Any]]:
    return list(load_retraining_log()["retrain_history"])


def get_retraining_status() -> dict[str, Any]:
    history = load_retraining_history()
    with _STATUS_LOCK:
        active_jobs = list(_ACTIVE_JOBS.values())
        last_completed = dict(_LAST_COMPLETED_JOB) if _LAST_COMPLETED_JOB is not None else None
    return {
        "active_jobs": active_jobs,
        "is_running": bool(active_jobs),
        "last_completed_job": last_completed,
        "history_count": len(history),
    }


class RetrainWorker:
    def __init__(
        self,
        stock_config: dict[str, Any],
        app_config: dict[str, Any],
        cache: DataCache | None = None,
    ) -> None:
        self.stock = stock_config
        self.stock_id = stock_config["id"]
        self.config = app_config
        self.cache = cache or DataCache(default_ttl_seconds=DEFAULT_CACHE_TTL_SECONDS)
        self.model_registry = ModelRegistry(app_config)

    def resolve_training_mode(self, mode_override: str | None = None) -> str:
        if mode_override is not None:
            if mode_override not in SUPPORTED_TRAINING_MODES:
                supported = ", ".join(sorted(SUPPORTED_TRAINING_MODES))
                raise ValueError(
                    f"Unsupported training mode '{mode_override}'. Expected one of: {supported}."
                )
            configured_modes = self.model_registry.configured_modes()
            if mode_override not in configured_modes:
                configured = ", ".join(configured_modes)
                raise ValueError(
                    f"Mode '{mode_override}' is not enabled in the current config. "
                    f"Configured modes: {configured}."
                )
            return mode_override
        configured_modes = self.model_registry.configured_modes()
        if "per_stock" in configured_modes:
            return "per_stock"
        return self.model_registry.get_prediction_mode()

    def is_retrain_due(self) -> bool:
        last_success = self._latest_successful_retrain()
        if last_success is None:
            return True
        last_timestamp = _parse_timestamp(str(last_success["timestamp"]))
        interval_days = int(self.stock["model"]["retrain_interval_days"])
        return _utc_now() >= last_timestamp + timedelta(days=interval_days)

    async def retrain(
        self,
        reason: str,
        progress_callback: EpochProgressCallback | None = None,
        status_callback: StatusProgressCallback | None = None,
        mode_override: str | None = None,
    ) -> dict[str, Any]:
        resolved_mode = self.resolve_training_mode(mode_override)
        started_at = _utc_now_iso()
        if not _start_active_job(self.stock_id, reason, resolved_mode, started_at):
            raise RetrainingAlreadyRunningError(
                f"Retraining is already running for '{self.stock_id}'."
            )
        before_mse = self._load_baseline_mse()
        timer_started = perf_counter()
        try:
            artifacts = await asyncio.to_thread(
                self._run_sync_retraining,
                resolved_mode,
                started_at,
                progress_callback,
                status_callback,
            )
            log_entry = {
                "stock_id": self.stock_id,
                "timestamp": started_at,
                "reason": reason,
                "mode": resolved_mode,
                "before_mse": before_mse,
                "after_mse": artifacts.evaluation_report.mse,
                "duration_seconds": round(perf_counter() - timer_started, 3),
                "status": "success",
                "checkpoint_path": str(artifacts.checkpoint_path),
                "report_path": str(artifacts.report_path),
                "scaler_paths": artifacts.scaler_paths,
                "dataset_summary": artifacts.dataset_summary,
            }
        except Exception as exc:
            log_entry = {
                "stock_id": self.stock_id,
                "timestamp": started_at,
                "reason": reason,
                "mode": resolved_mode,
                "before_mse": before_mse,
                "after_mse": None,
                "duration_seconds": round(perf_counter() - timer_started, 3),
                "status": "failed",
                "error": str(exc),
            }
        append_retraining_log(log_entry)
        _finish_active_job(log_entry)
        if log_entry["status"] != "success":
            raise RetrainingExecutionError(log_entry.get("error", "Retraining failed."))
        return log_entry

    def report_path(self) -> Path:
        return REPORT_STORE_DIR / f"{self.stock_id}_training_report.json"

    def prediction_history_path(self) -> Path:
        return PREDICTION_HISTORY_DIR / f"{self.stock_id}.json"

    def _run_sync_retraining(
        self,
        mode: str,
        started_at: str,
        progress_callback: EpochProgressCallback | None = None,
        status_callback: StatusProgressCallback | None = None,
    ) -> RetrainingArtifacts:
        self._notify_status(
            status_callback,
            "building_dataset",
            f"Preparing {self.stock_id} samples for {mode}.",
        )
        builder = DatasetBuilder(self.config, self.cache)
        datasets = builder.build(mode, self.stock_id if mode == "per_stock" else None)
        self._notify_status(
            status_callback,
            "training",
            (
                f"Dataset ready with {len(datasets.train_dataset)} train, "
                f"{len(datasets.val_dataset)} validation, and "
                f"{len(datasets.test_dataset)} test samples."
            ),
        )
        model = self._build_model(mode)
        train_loop = TrainLoop(self.config)
        training_run = train_loop.train(
            model,
            datasets,
            mode,
            stock_id=self.stock_id if mode == "per_stock" else None,
            progress_callback=self._build_progress_callback(progress_callback, mode),
        )
        self._notify_status(
            status_callback,
            "evaluating",
            f"Evaluating {self.stock_id} on {len(self._evaluation_dataset(datasets, mode))} samples.",
        )
        trained_model = self._load_trained_model(mode, training_run.checkpoint_path)
        evaluation_dataset = self._evaluation_dataset(datasets, mode)
        evaluation_report = Evaluator().evaluate_model(
            trained_model,
            evaluation_dataset,
            datasets.scalers_by_stock,
            batch_size=int(self.config["training"]["batch_size"]),
        )
        self._notify_status(
            status_callback,
            "writing_artifacts",
            f"Writing checkpoint, scalers, and report for {self.stock_id}.",
        )
        scaler_paths = self._write_scalers(datasets.scalers_by_stock)
        report_path = self._write_training_report(
            mode,
            started_at,
            datasets,
            training_run,
            evaluation_report,
            scaler_paths,
        )
        self._write_prediction_history(mode, evaluation_report)
        self._notify_status(
            status_callback,
            "completed",
            f"Artifacts saved for {self.stock_id}.",
        )
        return RetrainingArtifacts(
            mode=mode,
            checkpoint_path=training_run.checkpoint_path,
            report_path=report_path,
            scaler_paths=scaler_paths,
            evaluation_report=evaluation_report,
            training_run=training_run,
            dataset_summary=self._dataset_summary(datasets, evaluation_dataset),
        )

    def _build_progress_callback(
        self,
        callback: EpochProgressCallback | None,
        mode: str,
    ):
        if callback is None:
            return None

        def on_epoch(epoch_metrics: Any) -> None:
            callback(
                {
                    "stock_id": self.stock_id,
                    "mode": mode,
                    "epoch": int(epoch_metrics.epoch),
                    "train_loss": float(epoch_metrics.train_loss),
                    "val_loss": float(epoch_metrics.val_loss),
                }
            )

        return on_epoch

    def _build_model(self, mode: str) -> BaseModel:
        if mode == "per_stock":
            return PerStockCNN()
        if mode == "unified":
            return UnifiedCNN()
        if mode == "unified_with_embeddings":
            return UnifiedCNNWithEmbeddings(num_stocks=len(self.config["active_stocks"]))
        raise ValueError(f"Unsupported retraining mode '{mode}'.")

    def _load_trained_model(self, mode: str, checkpoint_path: Path) -> BaseModel:
        model = self._build_model(mode)
        loaded_artifact = torch.load(checkpoint_path, map_location="cpu")
        if isinstance(loaded_artifact, dict) and "state_dict" in loaded_artifact:
            state_dict = loaded_artifact["state_dict"]
        else:
            state_dict = loaded_artifact
        if not isinstance(state_dict, dict):
            raise ValueError(f"Unsupported checkpoint format in '{checkpoint_path.name}'.")
        model.load_state_dict(state_dict)
        model.eval()
        return model

    def _evaluation_dataset(self, datasets: DatasetBundle, mode: str) -> SpectrogramDataset:
        if mode == "per_stock":
            return datasets.test_dataset
        filtered_samples = [
            sample for sample in datasets.test_dataset.samples if sample.stock_id == self.stock_id
        ]
        if not filtered_samples:
            raise ValueError(f"No evaluation samples found for '{self.stock_id}'.")
        return SpectrogramDataset(filtered_samples)

    def _write_scalers(self, scalers_by_stock: dict[str, ScalingMetadata]) -> dict[str, str]:
        scaler_paths: dict[str, str] = {}
        for stock_id, scaler in scalers_by_stock.items():
            scaler_path = self.model_registry.resolve_scaler_path(stock_id)
            scaler_path.parent.mkdir(parents=True, exist_ok=True)
            with scaler_path.open("wb") as handle:
                pickle.dump(scaler, handle)
            scaler_paths[stock_id] = str(scaler_path)
        return scaler_paths

    def _write_training_report(
        self,
        mode: str,
        started_at: str,
        datasets: DatasetBundle,
        training_run: TrainingRunResult,
        evaluation_report: EvaluationReport,
        scaler_paths: dict[str, str],
    ) -> Path:
        report_path = self.report_path()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_payload = {
            "stock_id": self.stock_id,
            "generated_at": started_at,
            "mode": mode,
            "baseline_mse": evaluation_report.mse,
            "best_val_loss": training_run.best_val_loss,
            "lookback_days": datasets.lookback_days,
            "prediction_horizon_days": datasets.prediction_horizon_days,
            "transform_name": datasets.transform_name,
            "dataset_summary": self._dataset_summary(
                datasets,
                self._evaluation_dataset(datasets, mode),
            ),
            "history": [asdict(epoch_metrics) for epoch_metrics in training_run.history],
            "metrics": evaluation_report.as_dict(),
            "artifacts": {
                "checkpoint_path": str(training_run.checkpoint_path),
                "report_path": str(report_path),
                "scaler_paths": scaler_paths,
            },
        }
        _write_json(report_path, report_payload)
        return report_path

    def _write_prediction_history(self, mode: str, evaluation_report: EvaluationReport) -> None:
        history_path = self.prediction_history_path()
        history_path.parent.mkdir(parents=True, exist_ok=True)
        payload = _read_json(history_path, {"stock_id": self.stock_id, "predictions": []})
        existing_predictions = payload.get("predictions")
        indexed_predictions: dict[str, dict[str, Any]] = {}
        if isinstance(existing_predictions, list):
            for record in existing_predictions:
                timestamp = record.get("timestamp")
                if isinstance(timestamp, str):
                    indexed_predictions[timestamp] = record
        for timestamp, predicted, actual, reference in zip(
            evaluation_report.timestamps,
            evaluation_report.predictions_raw,
            evaluation_report.targets_raw,
            evaluation_report.reference_prices_raw,
            strict=False,
        ):
            indexed_predictions[timestamp] = {
                "timestamp": timestamp,
                "predicted_price": float(predicted),
                "actual_price": float(actual),
                "reference_price": float(reference),
                "mode": mode,
                "recorded_at": _utc_now_iso(),
                "source": "retrain_evaluation",
            }
        predictions = sorted(indexed_predictions.values(), key=lambda record: record["timestamp"])
        _write_json(
            history_path,
            {
                "stock_id": self.stock_id,
                "predictions": predictions,
            },
        )

    def _dataset_summary(
        self,
        datasets: DatasetBundle,
        evaluation_dataset: SpectrogramDataset,
    ) -> dict[str, Any]:
        summary = datasets.verification_summary()
        summary.update(
            {
                "evaluation_count": len(evaluation_dataset),
                "input_shape": list(datasets.train_dataset.input_shape),
            }
        )
        return summary

    def _load_baseline_mse(self) -> float | None:
        report = _read_json(self.report_path(), {})
        baseline = report.get("baseline_mse")
        if isinstance(baseline, (int, float)):
            return float(baseline)
        metrics = report.get("metrics")
        if isinstance(metrics, dict):
            mse = metrics.get("mse")
            if isinstance(mse, (int, float)):
                return float(mse)
        return None

    def _notify_status(
        self,
        callback: StatusProgressCallback | None,
        stage: str,
        detail: str,
    ) -> None:
        if callback is None:
            return
        callback(
            {
                "stock_id": self.stock_id,
                "stage": stage,
                "detail": detail,
            }
        )

    def _latest_successful_retrain(self) -> dict[str, Any] | None:
        for entry in reversed(load_retraining_history()):
            if entry.get("stock_id") == self.stock_id and entry.get("status") == "success":
                return entry
        return None


class SharedTrainingWorker:
    def __init__(
        self,
        app_config: dict[str, Any],
        cache: DataCache | None = None,
    ) -> None:
        self.config = app_config
        self.cache = cache or DataCache(default_ttl_seconds=DEFAULT_CACHE_TTL_SECONDS)
        self.model_registry = ModelRegistry(app_config)
        self.stock_ids = [stock["id"] for stock in app_config["active_stocks"]]

    async def train(
        self,
        mode: str,
        reason: str,
        progress_callback: EpochProgressCallback | None = None,
        status_callback: StatusProgressCallback | None = None,
    ) -> dict[str, Any]:
        resolved_mode = self._validate_shared_mode(mode)
        started_at = _utc_now_iso()
        before_mse = self._load_baseline_mse(resolved_mode)
        timer_started = perf_counter()
        try:
            artifacts = await asyncio.to_thread(
                self._run_sync_training,
                resolved_mode,
                started_at,
                progress_callback,
                status_callback,
            )
            result = {
                "stock_id": SHARED_TRAINING_STOCK_ID,
                "timestamp": started_at,
                "reason": reason,
                "mode": resolved_mode,
                "before_mse": before_mse,
                "after_mse": artifacts.evaluation_report.mse,
                "duration_seconds": round(perf_counter() - timer_started, 3),
                "status": "success",
                "checkpoint_path": str(artifacts.checkpoint_path),
                "report_path": str(artifacts.report_path),
                "scaler_paths": artifacts.scaler_paths,
                "dataset_summary": artifacts.dataset_summary,
            }
        except Exception as exc:
            result = {
                "stock_id": SHARED_TRAINING_STOCK_ID,
                "timestamp": started_at,
                "reason": reason,
                "mode": resolved_mode,
                "before_mse": before_mse,
                "after_mse": None,
                "duration_seconds": round(perf_counter() - timer_started, 3),
                "status": "failed",
                "error": str(exc),
            }
        append_retraining_log(result)
        if result["status"] != "success":
            raise RetrainingExecutionError(result.get("error", "Training failed."))
        return result

    def _validate_shared_mode(self, mode: str) -> str:
        resolved_mode = mode.lower()
        if resolved_mode not in {"unified", "unified_with_embeddings"}:
            raise ValueError(
                "Shared training supports only 'unified' and 'unified_with_embeddings'."
            )
        configured_modes = self.model_registry.configured_modes()
        if resolved_mode not in configured_modes:
            configured = ", ".join(configured_modes)
            raise ValueError(
                f"Mode '{resolved_mode}' is not enabled in the current config. "
                f"Configured modes: {configured}."
            )
        return resolved_mode

    def _run_sync_training(
        self,
        mode: str,
        started_at: str,
        progress_callback: EpochProgressCallback | None = None,
        status_callback: StatusProgressCallback | None = None,
    ) -> RetrainingArtifacts:
        self._notify_status(
            status_callback,
            mode,
            "building_dataset",
            f"Collecting all active stocks for shared mode {mode}.",
        )
        builder = DatasetBuilder(self.config, self.cache)
        datasets = builder.build(mode)
        self._notify_status(
            status_callback,
            mode,
            "training",
            (
                f"Dataset ready with {len(datasets.train_dataset)} train, "
                f"{len(datasets.val_dataset)} validation, and "
                f"{len(datasets.test_dataset)} test samples across {len(self.stock_ids)} stocks."
            ),
        )
        model = self._build_model(mode)
        training_run = TrainLoop(self.config).train(
            model,
            datasets,
            mode,
            progress_callback=self._build_progress_callback(progress_callback, mode),
        )
        self._notify_status(
            status_callback,
            mode,
            "evaluating",
            f"Evaluating shared mode {mode} on {len(datasets.test_dataset)} samples.",
        )
        trained_model = self._load_trained_model(mode, training_run.checkpoint_path)
        evaluation_dataset = datasets.test_dataset
        evaluation_report = Evaluator().evaluate_model(
            trained_model,
            evaluation_dataset,
            datasets.scalers_by_stock,
            batch_size=int(self.config["training"]["batch_size"]),
        )
        self._notify_status(
            status_callback,
            mode,
            "writing_artifacts",
            f"Writing shared checkpoint, scalers, and report for {mode}.",
        )
        scaler_paths = self._write_scalers(datasets.scalers_by_stock)
        report_path = self._write_training_report(
            mode,
            started_at,
            datasets,
            training_run,
            evaluation_report,
            scaler_paths,
        )
        self._notify_status(
            status_callback,
            mode,
            "completed",
            f"Artifacts saved for shared mode {mode}.",
        )
        return RetrainingArtifacts(
            mode=mode,
            checkpoint_path=training_run.checkpoint_path,
            report_path=report_path,
            scaler_paths=scaler_paths,
            evaluation_report=evaluation_report,
            training_run=training_run,
            dataset_summary=self._dataset_summary(datasets, evaluation_dataset),
        )

    def _build_progress_callback(
        self,
        callback: EpochProgressCallback | None,
        mode: str,
    ):
        if callback is None:
            return None

        def on_epoch(epoch_metrics: Any) -> None:
            callback(
                {
                    "stock_id": SHARED_TRAINING_STOCK_ID,
                    "mode": mode,
                    "epoch": int(epoch_metrics.epoch),
                    "train_loss": float(epoch_metrics.train_loss),
                    "val_loss": float(epoch_metrics.val_loss),
                }
            )

        return on_epoch

    def _build_model(self, mode: str) -> BaseModel:
        if mode == "unified":
            return UnifiedCNN()
        if mode == "unified_with_embeddings":
            return UnifiedCNNWithEmbeddings(num_stocks=len(self.stock_ids))
        raise ValueError(f"Unsupported shared training mode '{mode}'.")

    def _load_trained_model(self, mode: str, checkpoint_path: Path) -> BaseModel:
        model = self._build_model(mode)
        loaded_artifact = torch.load(checkpoint_path, map_location="cpu")
        if isinstance(loaded_artifact, dict) and "state_dict" in loaded_artifact:
            state_dict = loaded_artifact["state_dict"]
        else:
            state_dict = loaded_artifact
        if not isinstance(state_dict, dict):
            raise ValueError(f"Unsupported checkpoint format in '{checkpoint_path.name}'.")
        model.load_state_dict(state_dict)
        model.eval()
        return model

    def _write_scalers(self, scalers_by_stock: dict[str, ScalingMetadata]) -> dict[str, str]:
        scaler_paths: dict[str, str] = {}
        for stock_id, scaler in scalers_by_stock.items():
            scaler_path = self.model_registry.resolve_scaler_path(stock_id)
            scaler_path.parent.mkdir(parents=True, exist_ok=True)
            with scaler_path.open("wb") as handle:
                pickle.dump(scaler, handle)
            scaler_paths[stock_id] = str(scaler_path)
        return scaler_paths

    def _write_training_report(
        self,
        mode: str,
        started_at: str,
        datasets: DatasetBundle,
        training_run: TrainingRunResult,
        evaluation_report: EvaluationReport,
        scaler_paths: dict[str, str],
    ) -> Path:
        report_path = self._report_path(mode)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_payload = {
            "stock_id": SHARED_TRAINING_STOCK_ID,
            "generated_at": started_at,
            "mode": mode,
            "baseline_mse": evaluation_report.mse,
            "best_val_loss": training_run.best_val_loss,
            "lookback_days": datasets.lookback_days,
            "prediction_horizon_days": datasets.prediction_horizon_days,
            "transform_name": datasets.transform_name,
            "dataset_summary": self._dataset_summary(datasets, datasets.test_dataset),
            "history": [asdict(epoch_metrics) for epoch_metrics in training_run.history],
            "metrics": evaluation_report.as_dict(),
            "artifacts": {
                "checkpoint_path": str(training_run.checkpoint_path),
                "report_path": str(report_path),
                "scaler_paths": scaler_paths,
            },
        }
        _write_json(report_path, report_payload)
        return report_path

    def _dataset_summary(
        self,
        datasets: DatasetBundle,
        evaluation_dataset: SpectrogramDataset,
    ) -> dict[str, Any]:
        summary = datasets.verification_summary()
        summary.update(
            {
                "evaluation_count": len(evaluation_dataset),
                "evaluation_scope": "all_active_stocks",
                "input_shape": list(datasets.train_dataset.input_shape),
                "stock_count": len(self.stock_ids),
                "stock_ids": list(self.stock_ids),
            }
        )
        return summary

    def _load_baseline_mse(self, mode: str) -> float | None:
        report = _read_json(self._report_path(mode), {})
        baseline = report.get("baseline_mse")
        if isinstance(baseline, (int, float)):
            return float(baseline)
        metrics = report.get("metrics")
        if isinstance(metrics, dict):
            mse = metrics.get("mse")
            if isinstance(mse, (int, float)):
                return float(mse)
        return None

    def _report_path(self, mode: str) -> Path:
        if mode == "unified":
            return REPORT_STORE_DIR / "unified_training_report.json"
        if mode == "unified_with_embeddings":
            return REPORT_STORE_DIR / "unified_with_embeddings_training_report.json"
        raise ValueError(f"Unsupported shared training mode '{mode}'.")

    def _notify_status(
        self,
        callback: StatusProgressCallback | None,
        mode: str,
        stage: str,
        detail: str,
    ) -> None:
        if callback is None:
            return
        callback(
            {
                "stock_id": SHARED_TRAINING_STOCK_ID,
                "mode": mode,
                "stage": stage,
                "detail": detail,
            }
        )


def append_retraining_log(entry: dict[str, Any]) -> None:
    with _FILE_LOCK:
        payload = load_retraining_log()
        payload["retrain_history"].append(entry)
        _write_json(RETRAIN_LOG_PATH, payload)


def _start_active_job(stock_id: str, reason: str, mode: str, started_at: str) -> bool:
    with _STATUS_LOCK:
        if stock_id in _ACTIVE_JOBS:
            return False
        _ACTIVE_JOBS[stock_id] = {
            "stock_id": stock_id,
            "reason": reason,
            "mode": mode,
            "started_at": started_at,
        }
        return True


def _finish_active_job(log_entry: dict[str, Any]) -> None:
    global _LAST_COMPLETED_JOB
    with _STATUS_LOCK:
        _ACTIVE_JOBS.pop(str(log_entry["stock_id"]), None)
        _LAST_COMPLETED_JOB = dict(log_entry)


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _utc_now_iso() -> str:
    return _utc_now().isoformat().replace("+00:00", "Z")


def _parse_timestamp(value: str) -> datetime:
    normalized_value = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized_value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _read_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return dict(default)
    with _FILE_LOCK:
        raw_text = path.read_text(encoding="utf-8").strip()
    if not raw_text:
        return dict(default)
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError:
        return dict(default)
    if not isinstance(payload, dict):
        return dict(default)
    return payload


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with _FILE_LOCK:
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
