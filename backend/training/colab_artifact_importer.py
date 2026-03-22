from __future__ import annotations

import json
import shutil
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from typing import Any

import torch

from models.base_model import MODEL_STORE_DIR
from training.feature_channels import resolve_feature_channels

REPORTS_DIR_NAME = "reports"
SCALERS_DIR_NAME = "scalers"
SUPPORTED_IMPORT_MODES = {"per_stock", "unified", "unified_with_embeddings"}


@dataclass(slots=True)
class ColabArtifactImportResult:
    imported_at: str
    imported_modes: list[str]
    imported_stock_ids: list[str]
    imported_reports: list[str]
    imported_checkpoints: list[str]
    imported_scalers: list[str]
    aggregate_report_path: str | None
    skipped_entries: list[str]


def import_colab_artifact_bundle(
    bundle_path: Path,
    app_config: dict[str, Any],
    model_store_dir: Path | None = None,
) -> ColabArtifactImportResult:
    source_bundle_path = bundle_path.expanduser().resolve()
    if not source_bundle_path.exists():
        raise ValueError(f"Artifact bundle '{source_bundle_path.name}' does not exist.")
    if not zipfile.is_zipfile(source_bundle_path):
        raise ValueError("Uploaded file is not a valid zip archive.")

    imported_at = _utc_now_iso()
    resolved_model_store_dir = (model_store_dir or MODEL_STORE_DIR).resolve()
    reports_dir = resolved_model_store_dir / REPORTS_DIR_NAME
    scalers_dir = resolved_model_store_dir / SCALERS_DIR_NAME
    per_stock_dir = resolved_model_store_dir / "per_stock"
    unified_dir = resolved_model_store_dir / "unified"
    configured_channels = resolve_feature_channels(app_config)
    active_stock_ids = {str(stock_id) for stock_id in app_config.get("stock_ids", [])}

    reports_dir.mkdir(parents=True, exist_ok=True)
    scalers_dir.mkdir(parents=True, exist_ok=True)
    per_stock_dir.mkdir(parents=True, exist_ok=True)
    unified_dir.mkdir(parents=True, exist_ok=True)

    with TemporaryDirectory(prefix="chronospectra-colab-import-") as temp_dir:
        extracted_root = Path(temp_dir)
        _safe_extract_zip(source_bundle_path, extracted_root)

        aggregate_report_source = _find_aggregate_report(extracted_root)
        if aggregate_report_source is None:
            raise ValueError("Bundle is missing the notebook-generated 'training_report.json'.")

        report_entries = _load_aggregate_report_entries(aggregate_report_source)
        scaler_paths_by_stock = _import_scalers(extracted_root, scalers_dir)

        imported_reports: list[str] = []
        imported_checkpoints: list[str] = []
        imported_scalers = sorted(str(path) for path in scaler_paths_by_stock.values())
        imported_modes: set[str] = set()
        imported_stock_ids: set[str] = set()
        skipped_entries: list[str] = []

        for raw_entry in report_entries:
            mode = str(raw_entry.get("mode", "")).strip().lower()
            if mode not in SUPPORTED_IMPORT_MODES:
                skipped_entries.append(f"Skipped unsupported mode '{mode or 'unknown'}'.")
                continue

            entry_channels = _resolve_entry_channels(raw_entry, configured_channels)
            if entry_channels != configured_channels:
                raise ValueError(
                    "Artifact feature channels do not match the current app config. "
                    f"Bundle channels: {entry_channels}. Config channels: {configured_channels}."
                )

            checkpoint_source = _resolve_checkpoint_source(raw_entry, extracted_root)
            state_dict = _load_state_dict(checkpoint_source)
            _validate_checkpoint(
                state_dict,
                mode,
                configured_channels,
                expected_stock_count=len(active_stock_ids),
                checkpoint_name=checkpoint_source.name,
            )

            if mode == "per_stock":
                stock_id = _infer_stock_id(raw_entry, checkpoint_source)
                if stock_id not in active_stock_ids:
                    skipped_entries.append(
                        f"Skipped per-stock artifact for '{stock_id}' because it is not active in stocks.json."
                    )
                    continue
                if stock_id not in scaler_paths_by_stock:
                    raise ValueError(
                        f"Scaler artifact for '{stock_id}' is missing from the uploaded bundle."
                    )
                checkpoint_destination = per_stock_dir / f"{stock_id}_model.pth"
                report_destination = reports_dir / f"{stock_id}_training_report.json"
                report_payload = _build_report_payload(
                    entry=raw_entry,
                    imported_at=imported_at,
                    stock_id=stock_id,
                    mode=mode,
                    checkpoint_path=checkpoint_destination,
                    report_path=report_destination,
                    scaler_paths={stock_id: str(scaler_paths_by_stock[stock_id])},
                    transform_name=str(app_config["signal_processing"]["default_transform"]),
                    feature_channels=configured_channels,
                )
                imported_stock_ids.add(stock_id)
            elif mode == "unified":
                _require_scalers_for_active_stocks(scaler_paths_by_stock, active_stock_ids)
                checkpoint_destination = unified_dir / "unified_model.pth"
                report_destination = reports_dir / "unified_training_report.json"
                report_payload = _build_report_payload(
                    entry=raw_entry,
                    imported_at=imported_at,
                    stock_id="ALL_STOCKS",
                    mode=mode,
                    checkpoint_path=checkpoint_destination,
                    report_path=report_destination,
                    scaler_paths=_stringify_paths(scaler_paths_by_stock),
                    transform_name=str(app_config["signal_processing"]["default_transform"]),
                    feature_channels=configured_channels,
                )
                imported_stock_ids.update(active_stock_ids)
            else:
                _require_scalers_for_active_stocks(scaler_paths_by_stock, active_stock_ids)
                checkpoint_destination = unified_dir / "unified_with_embeddings_model.pth"
                report_destination = reports_dir / "unified_with_embeddings_training_report.json"
                report_payload = _build_report_payload(
                    entry=raw_entry,
                    imported_at=imported_at,
                    stock_id="ALL_STOCKS",
                    mode=mode,
                    checkpoint_path=checkpoint_destination,
                    report_path=report_destination,
                    scaler_paths=_stringify_paths(scaler_paths_by_stock),
                    transform_name=str(app_config["signal_processing"]["default_transform"]),
                    feature_channels=configured_channels,
                )
                imported_stock_ids.update(active_stock_ids)

            shutil.copy2(checkpoint_source, checkpoint_destination)
            report_destination.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")
            imported_checkpoints.append(str(checkpoint_destination))
            imported_reports.append(str(report_destination))
            imported_modes.add(mode)

        if not imported_reports:
            raise ValueError(
                "No compatible artifacts were imported from the bundle for the current stocks.json."
            )

        aggregate_report_destination = reports_dir / "training_report.json"
        shutil.copy2(aggregate_report_source, aggregate_report_destination)

    return ColabArtifactImportResult(
        imported_at=imported_at,
        imported_modes=sorted(imported_modes),
        imported_stock_ids=sorted(imported_stock_ids),
        imported_reports=sorted(imported_reports),
        imported_checkpoints=sorted(imported_checkpoints),
        imported_scalers=imported_scalers,
        aggregate_report_path=str(aggregate_report_destination),
        skipped_entries=skipped_entries,
    )


def _safe_extract_zip(bundle_path: Path, destination_dir: Path) -> None:
    with zipfile.ZipFile(bundle_path) as archive:
        for member in archive.infolist():
            member_path = PurePosixPath(member.filename)
            if not member.filename or member_path.is_absolute() or ".." in member_path.parts:
                raise ValueError("Zip archive contains an unsafe file path.")
            destination_path = destination_dir.joinpath(*member_path.parts).resolve()
            if destination_dir.resolve() not in destination_path.parents and destination_path != destination_dir.resolve():
                raise ValueError("Zip archive contains a path outside the extraction directory.")
            if member.is_dir():
                destination_path.mkdir(parents=True, exist_ok=True)
                continue
            destination_path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source_handle, destination_path.open("wb") as destination_handle:
                shutil.copyfileobj(source_handle, destination_handle)


def _find_aggregate_report(extracted_root: Path) -> Path | None:
    candidates = sorted(
        path
        for path in extracted_root.rglob("training_report.json")
        if path.is_file() and not path.name.endswith("_training_report.json")
    )
    if not candidates:
        return None
    return candidates[0]


def _load_aggregate_report_entries(report_path: Path) -> list[dict[str, Any]]:
    try:
        payload = json.loads(report_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Aggregate training report is not valid JSON.") from exc
    if isinstance(payload, list):
        entries = payload
    elif isinstance(payload, dict):
        entries = [payload]
    else:
        raise ValueError("Aggregate training report must contain a JSON list of entries.")
    normalized_entries: list[dict[str, Any]] = []
    for entry in entries:
        if isinstance(entry, dict):
            normalized_entries.append(entry)
    if not normalized_entries:
        raise ValueError("Aggregate training report does not contain any usable entries.")
    return normalized_entries


def _import_scalers(extracted_root: Path, destination_dir: Path) -> dict[str, Path]:
    imported_paths: dict[str, Path] = {}
    for scaler_source in sorted(extracted_root.rglob("*_scaler.pkl")):
        stock_id = scaler_source.stem.removesuffix("_scaler").upper()
        destination_path = destination_dir / scaler_source.name
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(scaler_source, destination_path)
        imported_paths[stock_id] = destination_path
    return imported_paths


def _resolve_entry_channels(
    entry: dict[str, Any],
    configured_channels: list[str],
) -> list[str]:
    raw_channels = entry.get("feature_channels")
    if not isinstance(raw_channels, list):
        return list(configured_channels)
    normalized_channels = [str(channel).strip().lower() for channel in raw_channels if isinstance(channel, str)]
    return normalized_channels or list(configured_channels)


def _resolve_checkpoint_source(entry: dict[str, Any], extracted_root: Path) -> Path:
    checkpoint_value = entry.get("checkpoint_path")
    if isinstance(checkpoint_value, str) and checkpoint_value.strip():
        checkpoint_candidate = Path(checkpoint_value.strip())
        if checkpoint_candidate.is_absolute() and checkpoint_candidate.exists():
            return checkpoint_candidate
        relative_candidate = extracted_root / checkpoint_candidate
        if relative_candidate.exists():
            return relative_candidate
        basename_matches = list(extracted_root.rglob(checkpoint_candidate.name))
        if basename_matches:
            return basename_matches[0]
    raise ValueError("Training report entry is missing a checkpoint that exists inside the bundle.")


def _load_state_dict(checkpoint_path: Path) -> dict[str, torch.Tensor]:
    loaded_artifact = torch.load(checkpoint_path, map_location="cpu")
    if isinstance(loaded_artifact, dict) and "state_dict" in loaded_artifact:
        nested_state_dict = loaded_artifact["state_dict"]
        if isinstance(nested_state_dict, dict):
            return nested_state_dict
    if isinstance(loaded_artifact, dict):
        return loaded_artifact
    raise ValueError(f"Unsupported checkpoint format in '{checkpoint_path.name}'.")


def _validate_checkpoint(
    state_dict: dict[str, torch.Tensor],
    mode: str,
    feature_channels: list[str],
    expected_stock_count: int,
    checkpoint_name: str,
) -> None:
    feature_weight = state_dict.get("features.0.weight")
    if not isinstance(feature_weight, torch.Tensor) or feature_weight.ndim < 2:
        raise ValueError(f"Checkpoint '{checkpoint_name}' is missing the first convolution weights.")
    input_channels = int(feature_weight.shape[1])
    if input_channels != len(feature_channels):
        raise ValueError(
            f"Checkpoint '{checkpoint_name}' expects {input_channels} input channel(s), "
            f"but the app is configured for {len(feature_channels)} channel(s): {feature_channels}."
        )
    if mode == "unified_with_embeddings":
        embedding_weight = state_dict.get("stock_embedding.weight")
        if not isinstance(embedding_weight, torch.Tensor) or embedding_weight.ndim < 1:
            raise ValueError(
                f"Checkpoint '{checkpoint_name}' is missing the stock embedding weights."
            )
        stock_count = int(embedding_weight.shape[0])
        if stock_count != expected_stock_count:
            raise ValueError(
                f"Checkpoint '{checkpoint_name}' was trained for {stock_count} stock embedding(s), "
                f"but the app currently has {expected_stock_count} active stock(s)."
            )


def _infer_stock_id(entry: dict[str, Any], checkpoint_path: Path) -> str:
    explicit_stock_id = entry.get("stock_id")
    if isinstance(explicit_stock_id, str) and explicit_stock_id.strip():
        return explicit_stock_id.strip().upper()
    stem = checkpoint_path.stem
    if stem.endswith("_model"):
        return stem.removesuffix("_model").upper()
    raise ValueError(
        f"Could not infer a stock ID from checkpoint '{checkpoint_path.name}'."
    )


def _require_scalers_for_active_stocks(
    scaler_paths_by_stock: dict[str, Path],
    active_stock_ids: set[str],
) -> None:
    missing_scalers = sorted(active_stock_ids - set(scaler_paths_by_stock))
    if missing_scalers:
        raise ValueError(
            "Bundle is missing scaler artifacts for: "
            f"{', '.join(missing_scalers)}."
        )


def _stringify_paths(paths_by_stock: dict[str, Path]) -> dict[str, str]:
    return {
        stock_id: str(path)
        for stock_id, path in sorted(paths_by_stock.items(), key=lambda item: item[0])
    }


def _build_report_payload(
    *,
    entry: dict[str, Any],
    imported_at: str,
    stock_id: str,
    mode: str,
    checkpoint_path: Path,
    report_path: Path,
    scaler_paths: dict[str, str],
    transform_name: str,
    feature_channels: list[str],
) -> dict[str, Any]:
    metrics = entry.get("metrics") if isinstance(entry.get("metrics"), dict) else {}
    history = entry.get("history") if isinstance(entry.get("history"), list) else []
    dataset_summary = (
        entry.get("dataset_summary")
        if isinstance(entry.get("dataset_summary"), dict)
        else {}
    )
    best_val_loss = _extract_best_val_loss(history)
    baseline_mse = metrics.get("mse") if isinstance(metrics.get("mse"), (int, float)) else None
    return {
        "stock_id": stock_id,
        "generated_at": imported_at,
        "mode": mode,
        "baseline_mse": float(baseline_mse) if baseline_mse is not None else None,
        "best_val_loss": best_val_loss,
        "lookback_days": _as_int(entry.get("lookback_days")),
        "prediction_horizon_days": _as_int(entry.get("prediction_horizon_days")),
        "transform_name": transform_name,
        "feature_channels": list(feature_channels),
        "dataset_summary": dict(dataset_summary),
        "history": list(history),
        "metrics": dict(metrics),
        "artifacts": {
            "checkpoint_path": str(checkpoint_path),
            "report_path": str(report_path),
            "scaler_paths": dict(scaler_paths),
        },
    }


def _extract_best_val_loss(history: list[Any]) -> float | None:
    val_losses = [
        float(item["val_loss"])
        for item in history
        if isinstance(item, dict) and isinstance(item.get("val_loss"), (int, float))
    ]
    if not val_losses:
        return None
    return min(val_losses)


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
