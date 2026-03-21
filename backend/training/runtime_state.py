from __future__ import annotations

import asyncio
import copy
import threading
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from config import find_stock
from data.cache.data_cache import DataCache
from models.model_registry import ModelRegistry
from retraining.retrain_worker import (
    RetrainWorker,
    SHARED_TRAINING_STOCK_ID,
    SharedTrainingWorker,
)

MANUAL_TRAINING_REASON = "manual_training"
_STATE_LOCK = threading.Lock()
_EVENT_RETENTION = 1000
_TRAINING_STATE: dict[str, Any] = {
    "run_id": None,
    "is_running": False,
    "started_at": None,
    "finished_at": None,
    "requested_stock_ids": [],
    "planned_modes": [],
    "job_labels": [],
    "active_stock_id": None,
    "active_mode": None,
    "active_job_label": None,
    "active_stage": None,
    "active_stage_detail": None,
    "active_stage_updated_at": None,
    "total_stocks": 0,
    "completed_stocks": 0,
    "total_jobs": 0,
    "completed_jobs": 0,
    "latest_event_id": 0,
    "events": [],
    "results": [],
}


@dataclass(frozen=True, slots=True)
class TrainingJob:
    label: str
    mode: str
    scope: str
    stock_config: dict[str, Any] | None = None

    @property
    def stock_id(self) -> str | None:
        if self.stock_config is None:
            return None
        return str(self.stock_config["id"])


class TrainingAlreadyRunningError(Exception):
    """Raised when a training run is already active."""


class TrainingConfigurationError(Exception):
    """Raised when the requested local-training plan is incompatible with the config."""


def start_training_run(
    app_config: dict[str, Any],
    stock_id: str | None = None,
) -> dict[str, Any]:
    stock_configs = _resolve_stock_configs(app_config, stock_id)
    training_jobs = _resolve_training_jobs(app_config, stock_configs, stock_id)
    total_stocks = sum(1 for job in training_jobs if job.scope == "per_stock")
    run_id = uuid.uuid4().hex
    started_at = _utc_now_iso()
    planned_modes = list(dict.fromkeys(job.mode for job in training_jobs))
    job_labels = [job.label for job in training_jobs]
    total_jobs = len(training_jobs)
    initial_state = {
        "run_id": run_id,
        "is_running": True,
        "started_at": started_at,
        "finished_at": None,
        "requested_stock_ids": [stock["id"] for stock in stock_configs],
        "planned_modes": planned_modes,
        "job_labels": job_labels,
        "active_stock_id": None,
        "active_mode": None,
        "active_job_label": None,
        "active_stage": None,
        "active_stage_detail": None,
        "active_stage_updated_at": None,
        "total_stocks": total_stocks,
        "completed_stocks": 0,
        "total_jobs": total_jobs,
        "completed_jobs": 0,
        "latest_event_id": 0,
        "events": [],
        "results": [],
    }
    with _STATE_LOCK:
        if bool(_TRAINING_STATE["is_running"]):
            raise TrainingAlreadyRunningError("A training job is already in progress.")
        _TRAINING_STATE.clear()
        _TRAINING_STATE.update(initial_state)
    _emit_event(
        "training_started",
        run_id=run_id,
        requested_stock_ids=initial_state["requested_stock_ids"],
        planned_modes=planned_modes,
        total_jobs=total_jobs,
        total_stocks=total_stocks,
    )
    worker_thread = threading.Thread(
        target=_run_training_job,
        args=(run_id, training_jobs, app_config),
        name=f"training-run-{run_id}",
        daemon=True,
    )
    worker_thread.start()
    return get_training_state()


def get_training_state() -> dict[str, Any]:
    with _STATE_LOCK:
        state_copy = copy.deepcopy(_TRAINING_STATE)
    state_copy.pop("events", None)
    return state_copy


def get_training_events(after_event_id: int = 0) -> list[dict[str, Any]]:
    with _STATE_LOCK:
        events = copy.deepcopy(_TRAINING_STATE["events"])
    return [event for event in events if int(event["event_id"]) > after_event_id]


def build_progress_payload() -> dict[str, Any]:
    with _STATE_LOCK:
        state_copy = copy.deepcopy(_TRAINING_STATE)
    events = state_copy.pop("events", [])
    state_copy["recent_events"] = events[-10:]
    return state_copy


def _run_training_job(
    run_id: str,
    training_jobs: list[TrainingJob],
    app_config: dict[str, Any],
) -> None:
    cache = DataCache(default_ttl_seconds=300)
    shared_worker: SharedTrainingWorker | None = None
    total_stock_jobs = sum(1 for job in training_jobs if job.scope == "per_stock")
    stock_job_index = 0
    try:
        for index, job in enumerate(training_jobs, start=1):
            _set_active_job(job.stock_id, job.mode, job.label)
            _emit_event(
                "job_started",
                run_id=run_id,
                stock_id=job.stock_id or SHARED_TRAINING_STOCK_ID,
                job_scope=job.scope,
                job_label=job.label,
                mode=job.mode,
                job_index=index,
                total_jobs=len(training_jobs),
            )
            if job.stock_id is not None:
                stock_job_index += 1
                _emit_event(
                    "stock_started",
                    run_id=run_id,
                    stock_id=job.stock_id,
                    stock_index=stock_job_index,
                    total_stocks=total_stock_jobs,
                    mode=job.mode,
                    job_label=job.label,
                )
            try:
                if job.scope == "per_stock":
                    if job.stock_config is None:
                        raise ValueError("Per-stock training job is missing stock configuration.")
                    worker = RetrainWorker(job.stock_config, app_config, cache)
                    result = asyncio.run(
                        worker.retrain(
                            reason=MANUAL_TRAINING_REASON,
                            progress_callback=_build_epoch_callback(run_id, job),
                            status_callback=_build_status_callback(run_id, job),
                            mode_override=job.mode,
                        )
                    )
                else:
                    if shared_worker is None:
                        shared_worker = SharedTrainingWorker(app_config, cache)
                    result = asyncio.run(
                        shared_worker.train(
                            mode=job.mode,
                            reason=MANUAL_TRAINING_REASON,
                            progress_callback=_build_epoch_callback(run_id, job),
                            status_callback=_build_status_callback(run_id, job),
                        )
                    )
            except Exception as exc:
                result = {
                    "stock_id": job.stock_id or SHARED_TRAINING_STOCK_ID,
                    "status": "failed",
                    "reason": MANUAL_TRAINING_REASON,
                    "mode": job.mode,
                    "timestamp": _utc_now_iso(),
                    "error": str(exc),
                    "job_label": job.label,
                    "job_scope": job.scope,
                }
            _append_result(result)
            _increment_completed_job(job.scope)
            _emit_event(
                "job_completed",
                run_id=run_id,
                stock_id=result.get("stock_id", job.stock_id or SHARED_TRAINING_STOCK_ID),
                job_scope=job.scope,
                job_label=job.label,
                status=result.get("status"),
                mode=result.get("mode"),
                after_mse=result.get("after_mse"),
                duration_seconds=result.get("duration_seconds"),
                job_index=index,
                total_jobs=len(training_jobs),
            )
            if job.stock_id is not None:
                _emit_event(
                    "stock_completed",
                    run_id=run_id,
                    stock_id=job.stock_id,
                    status=result.get("status"),
                    mode=result.get("mode"),
                    after_mse=result.get("after_mse"),
                    duration_seconds=result.get("duration_seconds"),
                    job_label=job.label,
                )
    finally:
        _clear_active_job()
        _finish_run()
        completed_state = get_training_state()
        _emit_event(
            "training_completed",
            run_id=run_id,
            completed_jobs=completed_state["completed_jobs"],
            total_jobs=completed_state["total_jobs"],
            completed_stocks=completed_state["completed_stocks"],
            total_stocks=completed_state["total_stocks"],
        )


def _resolve_stock_configs(
    app_config: dict[str, Any],
    stock_id: str | None,
) -> list[dict[str, Any]]:
    if stock_id is None:
        return list(app_config["active_stocks"])
    stock = find_stock(app_config, stock_id)
    if stock is None:
        raise ValueError(f"Unknown stock '{stock_id}'.")
    return [stock]


def _resolve_training_jobs(
    app_config: dict[str, Any],
    stock_configs: list[dict[str, Any]],
    stock_id: str | None,
) -> list[TrainingJob]:
    registry = ModelRegistry(app_config)
    configured_modes = registry.configured_modes()

    if stock_id is not None:
        if "per_stock" not in configured_modes:
            raise TrainingConfigurationError(
                "Stock-specific local training is only available when per_stock mode is enabled. "
                "Shared modes must train against the full active stock universe."
            )
        return [
            TrainingJob(
                label=f"{stock['id']} / per_stock",
                mode="per_stock",
                scope="per_stock",
                stock_config=stock,
            )
            for stock in stock_configs
        ]

    training_jobs: list[TrainingJob] = []
    for mode in configured_modes:
        if mode == "per_stock":
            continue
        training_jobs.append(
            TrainingJob(
                label=f"All stocks / {mode}",
                mode=mode,
                scope="shared",
            )
        )
    if "per_stock" in configured_modes:
        training_jobs.extend(
            TrainingJob(
                label=f"{stock['id']} / per_stock",
                mode="per_stock",
                scope="per_stock",
                stock_config=stock,
            )
            for stock in stock_configs
        )
    if not training_jobs:
        raise TrainingConfigurationError(
            "No local training jobs could be planned from the current config."
        )
    return training_jobs


def _build_epoch_callback(run_id: str, job: TrainingJob):
    def callback(payload: dict[str, Any]) -> None:
        epoch = payload.get("epoch")
        train_loss = payload.get("train_loss")
        val_loss = payload.get("val_loss")
        detail_parts = []
        if isinstance(epoch, int):
            detail_parts.append(f"Epoch {epoch}")
        if isinstance(train_loss, (int, float)):
            detail_parts.append(f"train {float(train_loss):.4f}")
        if isinstance(val_loss, (int, float)):
            detail_parts.append(f"val {float(val_loss):.4f}")
        _set_active_stage(
            "training",
            " | ".join(detail_parts) if detail_parts else None,
        )
        _emit_event(
            "epoch",
            run_id=run_id,
            stock_id=payload.get("stock_id", job.stock_id or SHARED_TRAINING_STOCK_ID),
            mode=job.mode,
            job_label=job.label,
            job_scope=job.scope,
            epoch=payload.get("epoch"),
            train_loss=payload.get("train_loss"),
            val_loss=payload.get("val_loss"),
        )

    return callback


def _build_status_callback(run_id: str, job: TrainingJob):
    def callback(payload: dict[str, Any]) -> None:
        stage = payload.get("stage")
        detail = payload.get("detail")
        if isinstance(stage, str):
            _set_active_stage(stage, detail if isinstance(detail, str) else None)
        _emit_event(
            "job_stage",
            run_id=run_id,
            stock_id=payload.get("stock_id", job.stock_id or SHARED_TRAINING_STOCK_ID),
            mode=job.mode,
            job_label=job.label,
            job_scope=job.scope,
            stage=stage,
            detail=detail,
        )

    return callback


def _emit_event(event_name: str, **payload: Any) -> None:
    with _STATE_LOCK:
        next_event_id = int(_TRAINING_STATE["latest_event_id"]) + 1
        _TRAINING_STATE["latest_event_id"] = next_event_id
        event = {
            "event_id": next_event_id,
            "event": event_name,
            "timestamp": _utc_now_iso(),
            **payload,
        }
        _TRAINING_STATE["events"].append(event)
        _TRAINING_STATE["events"] = _TRAINING_STATE["events"][-_EVENT_RETENTION:]


def _append_result(result: dict[str, Any]) -> None:
    with _STATE_LOCK:
        _TRAINING_STATE["results"].append(_sanitize_result(result))


def _increment_completed_job(job_scope: str) -> None:
    with _STATE_LOCK:
        next_completed = int(_TRAINING_STATE["completed_jobs"]) + 1
        _TRAINING_STATE["completed_jobs"] = next_completed
        if job_scope == "per_stock":
            _TRAINING_STATE["completed_stocks"] = int(_TRAINING_STATE["completed_stocks"]) + 1


def _set_active_job(stock_id: str | None, mode: str, label: str) -> None:
    with _STATE_LOCK:
        _TRAINING_STATE["active_stock_id"] = stock_id
        _TRAINING_STATE["active_mode"] = mode
        _TRAINING_STATE["active_job_label"] = label
        _TRAINING_STATE["active_stage"] = "queued"
        _TRAINING_STATE["active_stage_detail"] = "Waiting for worker startup."
        _TRAINING_STATE["active_stage_updated_at"] = _utc_now_iso()


def _set_active_stage(stage: str, detail: str | None = None) -> None:
    with _STATE_LOCK:
        _TRAINING_STATE["active_stage"] = stage
        _TRAINING_STATE["active_stage_detail"] = detail
        _TRAINING_STATE["active_stage_updated_at"] = _utc_now_iso()


def _clear_active_job() -> None:
    with _STATE_LOCK:
        _TRAINING_STATE["active_stock_id"] = None
        _TRAINING_STATE["active_mode"] = None
        _TRAINING_STATE["active_job_label"] = None
        _TRAINING_STATE["active_stage"] = None
        _TRAINING_STATE["active_stage_detail"] = None
        _TRAINING_STATE["active_stage_updated_at"] = None


def _finish_run() -> None:
    with _STATE_LOCK:
        _TRAINING_STATE["is_running"] = False
        _TRAINING_STATE["finished_at"] = _utc_now_iso()


def _sanitize_result(result: dict[str, Any]) -> dict[str, Any]:
    safe_keys = {
        "stock_id",
        "status",
        "reason",
        "mode",
        "timestamp",
        "before_mse",
        "after_mse",
        "duration_seconds",
        "error",
        "job_label",
        "job_scope",
    }
    return {key: value for key, value in result.items() if key in safe_keys}


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
