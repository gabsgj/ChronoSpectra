from __future__ import annotations

import asyncio
import contextlib
import json
import os
from tempfile import NamedTemporaryFile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from data.cache.data_cache import DataCache
from routes.api_models import (
    APIErrorResponse,
    ColabArtifactImportResponse,
    FeatureAblationImportResponse,
    FeatureAblationEntryResponse,
    FeatureAblationReportResponse,
    ModelMetricsSummary,
    TrainingReportCollectionResponse,
    TrainingReportDetailResponse,
    TrainingEpochMetricsResponse,
    TrainingReportEntryResponse,
    TrainingRuntimeResponse,
    TrainingStartResponse,
)
from routes.utils import load_json_file, raise_structured_http_error, require_stock
from training.colab_artifact_importer import import_colab_artifact_bundle
from training.feature_ablation import build_feature_ablation_entries, run_feature_ablation
from training.feature_ablation_importer import import_feature_ablation_bundle
from training.feature_ablation_store import (
    FEATURE_ABLATION_REPORT_DIR,
    load_feature_ablation_payload,
    persist_feature_ablation_payload,
    resolve_feature_ablation_report_path,
)
from training.feature_channels import resolve_feature_channels
from training.runtime_state import (
    TrainingAlreadyRunningError,
    TrainingConfigurationError,
    build_progress_payload,
    get_training_events,
    get_training_state,
    start_training_run,
)

router = APIRouter(tags=["training"])
REPORT_STORE_DIR = Path(__file__).resolve().parents[1] / "models" / "model_store" / "reports"
TRAINING_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {"model": APIErrorResponse},
    404: {"model": APIErrorResponse},
    403: {"model": APIErrorResponse},
    409: {"model": APIErrorResponse},
    503: {"model": APIErrorResponse},
}


@router.post("/start", response_model=TrainingStartResponse, responses=TRAINING_ERROR_RESPONSES)
def start_training(
    request: Request,
    stock_id: str | None = Query(None),
) -> TrainingStartResponse:
    if stock_id is not None:
        require_stock(request, stock_id)
    try:
        runtime_state = start_training_run(request.app.state.config, stock_id=stock_id)
    except TrainingAlreadyRunningError as exc:
        raise_structured_http_error(
            409,
            "training_already_running",
            str(exc),
        )
    except TrainingConfigurationError as exc:
        raise_structured_http_error(422, "invalid_training_request", str(exc))
    except ValueError as exc:
        raise_structured_http_error(404, "unknown_stock", str(exc))
    return TrainingStartResponse(
        status="started",
        run_id=str(runtime_state["run_id"]),
        requested_stock_ids=list(runtime_state["requested_stock_ids"]),
        total_stocks=int(runtime_state["total_stocks"]),
        total_jobs=int(runtime_state.get("total_jobs", runtime_state["total_stocks"])),
        planned_modes=list(runtime_state.get("planned_modes", [])),
        started_at=str(runtime_state["started_at"]),
    )


@router.post(
    "/import-colab-artifacts",
    response_model=ColabArtifactImportResponse,
    responses=TRAINING_ERROR_RESPONSES,
)
async def import_colab_artifacts(request: Request) -> ColabArtifactImportResponse:
    app_env = _require_development_environment(request)
    upload_filename = request.headers.get("x-upload-filename", "colab_artifacts.zip").strip()
    if not upload_filename.lower().endswith(".zip"):
        raise_structured_http_error(
            422,
            "invalid_artifact_bundle",
            "Uploaded bundle must be a .zip file exported from Colab/Drive.",
        )

    temp_bundle_path: Path | None = None
    total_bytes = 0
    try:
        with NamedTemporaryFile(
            prefix="chronospectra-colab-upload-",
            suffix=".zip",
            delete=False,
        ) as temp_file:
            temp_bundle_path = Path(temp_file.name)
            async for chunk in request.stream():
                if not chunk:
                    continue
                total_bytes += len(chunk)
                temp_file.write(chunk)

        if temp_bundle_path is None or total_bytes == 0:
            raise_structured_http_error(
                422,
                "invalid_artifact_bundle",
                "Uploaded bundle is empty.",
            )

        try:
            import_result = import_colab_artifact_bundle(
                temp_bundle_path,
                request.app.state.config,
            )
        except ValueError as exc:
            raise_structured_http_error(
                422,
                "invalid_artifact_bundle",
                "Artifact import failed.",
                hint=str(exc),
            )

        cache_cleared = _clear_runtime_cache(request)
        return ColabArtifactImportResponse(
            status="completed",
            imported_at=import_result.imported_at,
            app_env=app_env,
            cache_cleared=cache_cleared,
            imported_modes=import_result.imported_modes,
            imported_stock_ids=import_result.imported_stock_ids,
            imported_reports=import_result.imported_reports,
            imported_checkpoints=import_result.imported_checkpoints,
            imported_scalers=import_result.imported_scalers,
            aggregate_report_path=import_result.aggregate_report_path,
            skipped_entries=import_result.skipped_entries,
        )
    finally:
        if temp_bundle_path is not None:
            with contextlib.suppress(OSError):
                os.unlink(temp_bundle_path)


@router.post(
    "/import-feature-ablation-artifacts",
    response_model=FeatureAblationImportResponse,
    responses=TRAINING_ERROR_RESPONSES,
)
async def import_feature_ablation_artifacts(request: Request) -> FeatureAblationImportResponse:
    app_env = _require_development_environment(request)
    upload_filename = request.headers.get(
        "x-upload-filename",
        "feature_ablation_artifacts.zip",
    ).strip()
    if not upload_filename.lower().endswith(".zip"):
        raise_structured_http_error(
            422,
            "invalid_feature_ablation_bundle",
            "Uploaded feature ablation bundle must be a .zip file exported from Colab/Drive.",
        )

    temp_bundle_path: Path | None = None
    total_bytes = 0
    try:
        with NamedTemporaryFile(
            prefix="chronospectra-feature-ablation-upload-",
            suffix=".zip",
            delete=False,
        ) as temp_file:
            temp_bundle_path = Path(temp_file.name)
            async for chunk in request.stream():
                if not chunk:
                    continue
                total_bytes += len(chunk)
                temp_file.write(chunk)

        if temp_bundle_path is None or total_bytes == 0:
            raise_structured_http_error(
                422,
                "invalid_feature_ablation_bundle",
                "Uploaded bundle is empty.",
            )

        try:
            import_result = import_feature_ablation_bundle(
                temp_bundle_path,
                request.app.state.config,
            )
        except ValueError as exc:
            raise_structured_http_error(
                422,
                "invalid_feature_ablation_bundle",
                "Feature ablation import failed.",
                hint=str(exc),
            )

        cache_cleared = _clear_runtime_cache(request)
        return FeatureAblationImportResponse(
            status="completed",
            imported_at=import_result.imported_at,
            app_env=app_env,
            cache_cleared=cache_cleared,
            imported_stock_ids=import_result.imported_stock_ids,
            imported_modes=import_result.imported_modes,
            imported_reports=import_result.imported_reports,
            aggregate_report_path=import_result.aggregate_report_path,
            skipped_entries=import_result.skipped_entries,
        )
    finally:
        if temp_bundle_path is not None:
            with contextlib.suppress(OSError):
                os.unlink(temp_bundle_path)


@router.get("/progress")
async def training_progress() -> StreamingResponse:
    async def event_generator():
        last_event_id = 0
        initial_payload = build_progress_payload()
        yield f"event: snapshot\ndata: {json.dumps(initial_payload)}\n\n"
        while True:
            new_events = get_training_events(last_event_id)
            if new_events:
                for event in new_events:
                    last_event_id = int(event["event_id"])
                    yield f"id: {last_event_id}\ndata: {json.dumps(event)}\n\n"
            current_state = get_training_state()
            if not current_state["is_running"] and not get_training_events(last_event_id):
                yield f"event: completed\ndata: {json.dumps(build_progress_payload())}\n\n"
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get(
    "/report",
    response_model=TrainingReportCollectionResponse,
    responses={404: {"model": APIErrorResponse}, 503: {"model": APIErrorResponse}},
)
def training_report(
    request: Request,
    stock_id: str | None = Query(None),
) -> TrainingReportCollectionResponse:
    if stock_id is not None:
        require_stock(request, stock_id)
    report_entries = load_training_report_entries(stock_id)
    if not report_entries:
        artifact_path = (
            str(REPORT_STORE_DIR / f"{stock_id}_training_report.json")
            if stock_id
            else str(REPORT_STORE_DIR)
        )
        raise_structured_http_error(
            503,
            "model_not_trained",
            "No training report artifacts are available yet.",
            hint="Trigger training or retraining to generate report artifacts first.",
            artifact_path=artifact_path,
        )
    runtime_state = get_training_state()
    return TrainingReportCollectionResponse(
        count=len(report_entries),
        reports=report_entries,
        runtime=TrainingRuntimeResponse(**runtime_state),
    )


@router.get(
    "/report-detail/{stock_id}",
    response_model=TrainingReportDetailResponse,
    responses={404: {"model": APIErrorResponse}, 503: {"model": APIErrorResponse}},
)
def training_report_detail(
    stock_id: str,
    request: Request,
) -> TrainingReportDetailResponse:
    require_stock(request, stock_id)
    report_path = REPORT_STORE_DIR / f"{stock_id}_training_report.json"
    payload = load_json_file(report_path)
    if not payload:
        raise_structured_http_error(
            503,
            "model_not_trained",
            f"No training report artifact is available yet for '{stock_id}'.",
            hint="Trigger training or retraining to generate the report artifact first.",
            artifact_path=str(report_path),
        )
    history_payload = payload.get("history", [])
    history: list[TrainingEpochMetricsResponse] = []
    if isinstance(history_payload, list):
        for item in history_payload:
            if not isinstance(item, dict):
                continue
            epoch = item.get("epoch")
            train_loss = item.get("train_loss")
            val_loss = item.get("val_loss")
            if not isinstance(epoch, int):
                continue
            if not isinstance(train_loss, (int, float)):
                continue
            if not isinstance(val_loss, (int, float)):
                continue
            history.append(
                TrainingEpochMetricsResponse(
                    epoch=epoch,
                    train_loss=float(train_loss),
                    val_loss=float(val_loss),
                )
            )
    return TrainingReportDetailResponse(
        stock_id=str(payload.get("stock_id", stock_id)),
        generated_at=payload.get("generated_at"),
        mode=str(payload.get("mode", "per_stock")),
        report_path=str(report_path),
        history_length=len(history),
        history=history,
        metrics=_build_metrics_summary(payload),
        dataset_summary=_safe_dict(payload.get("dataset_summary")),
        artifacts=_safe_dict(payload.get("artifacts")),
        prediction_horizon_days=_as_int(payload.get("prediction_horizon_days")),
        transform_name=_as_str(payload.get("transform_name")),
        lookback_days=_as_int(payload.get("lookback_days")),
        feature_channels=_safe_str_list(payload.get("feature_channels")),
    )


@router.get(
    "/feature-ablation/{stock_id}",
    response_model=FeatureAblationReportResponse,
    responses={404: {"model": APIErrorResponse}, 422: {"model": APIErrorResponse}, 503: {"model": APIErrorResponse}},
)
def get_feature_ablation_report(
    stock_id: str,
    request: Request,
    mode: str | None = Query(None),
) -> FeatureAblationReportResponse:
    stock = require_stock(request, stock_id)
    resolved_mode = _resolve_feature_ablation_mode(mode)
    payload = load_feature_ablation_payload(stock["id"], resolved_mode)
    if not payload:
        report_path = resolve_feature_ablation_report_path(stock["id"], resolved_mode)
        raise_structured_http_error(
            503,
            "feature_ablation_not_ready",
            f"No saved feature ablation report is available yet for '{stock['id']}' in '{resolved_mode}' mode.",
            hint=(
                "Import a feature ablation bundle or run ablation from the UI. "
                "A fresh run retrains baseline and channel-drop variants, so it can take several minutes."
            ),
            artifact_path=str(report_path),
        )
    _validate_feature_ablation_payload(payload, request.app.state.config)
    return _build_feature_ablation_response(payload)


@router.post(
    "/feature-ablation/{stock_id}",
    response_model=FeatureAblationReportResponse,
    responses=TRAINING_ERROR_RESPONSES,
)
def feature_ablation_report(
    stock_id: str,
    request: Request,
    mode: str | None = Query(None),
    epochs: int | None = Query(None, ge=1, le=500),
) -> FeatureAblationReportResponse:
    stock = require_stock(request, stock_id)
    resolved_mode = _resolve_feature_ablation_mode(mode)
    try:
        ablation_results = run_feature_ablation(
            app_config=request.app.state.config,
            stock_id=stock["id"],
            mode=resolved_mode,
            epochs_override=epochs,
        )
    except ValueError as exc:
        raise_structured_http_error(422, "invalid_ablation_request", str(exc))
    except Exception as exc:
        raise_structured_http_error(
            503,
            "ablation_failed",
            "Feature ablation run failed.",
            hint=str(exc),
        )

    try:
        entries = build_feature_ablation_entries(ablation_results)
    except ValueError as exc:
        raise_structured_http_error(
            503,
            "ablation_failed",
            str(exc),
        )

    payload = persist_feature_ablation_payload(
        stock_id=stock["id"],
        mode=resolved_mode,
        configured_channels=resolve_feature_channels(request.app.state.config),
        transform_name=str(request.app.state.config["signal_processing"]["default_transform"]),
        entries=entries,
    )
    return _build_feature_ablation_response(payload)


def load_training_report_entries(stock_id: str | None = None) -> list[TrainingReportEntryResponse]:
    if stock_id is not None:
        candidate_paths = [REPORT_STORE_DIR / f"{stock_id}_training_report.json"]
    else:
        candidate_paths = sorted(REPORT_STORE_DIR.glob("*_training_report.json"))
    entries: list[TrainingReportEntryResponse] = []
    for path in candidate_paths:
        payload = load_json_file(path)
        if not payload:
            continue
        entries.append(
            TrainingReportEntryResponse(
                stock_id=str(payload.get("stock_id", path.stem.removesuffix("_training_report"))),
                generated_at=payload.get("generated_at"),
                mode=str(payload.get("mode", "per_stock")),
                report_path=str(path),
                history_length=len(payload.get("history", [])),
                metrics=_build_metrics_summary(payload),
            )
        )
    return entries


def _resolve_feature_ablation_mode(mode: str | None) -> str:
    resolved_mode = (mode or "per_stock").strip().lower()
    supported_modes = {"per_stock", "unified", "unified_with_embeddings"}
    if resolved_mode not in supported_modes:
        raise_structured_http_error(
            422,
            "invalid_ablation_request",
            f"Unsupported ablation mode '{mode}'.",
            hint=f"Use one of: {', '.join(sorted(supported_modes))}.",
        )
    return resolved_mode


def _validate_feature_ablation_payload(
    payload: dict[str, Any],
    app_config: dict[str, Any],
) -> None:
    configured_channels = resolve_feature_channels(app_config)
    payload_channels = _safe_str_list(payload.get("configured_channels"))
    if payload_channels != configured_channels:
        raise_structured_http_error(
            503,
            "incompatible_feature_ablation_report",
            "Saved feature ablation report channels do not match the current app config.",
            hint=(
                f"Saved channels: {payload_channels}. "
                f"Current config channels: {configured_channels}. Re-run or re-import the report."
            ),
            artifact_path=str(payload.get("report_path") or FEATURE_ABLATION_REPORT_DIR),
        )


def _build_feature_ablation_response(
    payload: dict[str, Any],
) -> FeatureAblationReportResponse:
    entries_payload = payload.get("entries", [])
    entries: list[FeatureAblationEntryResponse] = []
    if isinstance(entries_payload, list):
        for item in entries_payload:
            if not isinstance(item, dict):
                continue
            try:
                entries.append(FeatureAblationEntryResponse(**item))
            except Exception:
                continue

    return FeatureAblationReportResponse(
        stock_id=str(payload.get("stock_id", "")),
        mode=str(payload.get("mode", "per_stock")),
        generated_at=_as_str(payload.get("generated_at")),
        report_path=_as_str(payload.get("report_path")),
        configured_channels=_safe_str_list(payload.get("configured_channels")),
        transform_name=str(payload.get("transform_name", "stft")),
        entries=entries,
    )


def _build_metrics_summary(payload: dict[str, Any]) -> ModelMetricsSummary:
    metrics = payload.get("metrics", {})
    return ModelMetricsSummary(
        generated_at=payload.get("generated_at"),
        baseline_mse=_as_float(payload.get("baseline_mse")),
        best_val_loss=_as_float(payload.get("best_val_loss")),
        mse=_as_float(metrics.get("mse")) if isinstance(metrics, dict) else None,
        rmse=_as_float(metrics.get("rmse")) if isinstance(metrics, dict) else None,
        mae=_as_float(metrics.get("mae")) if isinstance(metrics, dict) else None,
        mape=_as_float(metrics.get("mape")) if isinstance(metrics, dict) else None,
        directional_accuracy=_as_float(metrics.get("directional_accuracy"))
        if isinstance(metrics, dict)
        else None,
    )


def _as_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def _as_str(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    return None


def _safe_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _safe_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, str)]


def _require_development_environment(request: Request) -> str:
    app_env = str(getattr(request.app.state, "environment", {}).get("APP_ENV", "")).strip().lower()
    if app_env != "development":
        raise_structured_http_error(
            403,
            "development_only",
            "Colab artifact import is available only when APP_ENV is development.",
        )
    return app_env


def _clear_runtime_cache(request: Request) -> bool:
    cache = getattr(request.app.state, "data_cache", None)
    if isinstance(cache, DataCache):
        cache.clear()
        return True
    return False
