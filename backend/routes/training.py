from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from routes.api_models import (
    APIErrorResponse,
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
from training.feature_ablation import run_feature_ablation
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
    )


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
    resolved_mode = (mode or "per_stock").lower()
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

    baseline = next((result for result in ablation_results if result.removed_channel is None), None)
    if baseline is None:
        raise_structured_http_error(
            503,
            "ablation_failed",
            "Baseline ablation result is missing.",
        )

    entries: list[FeatureAblationEntryResponse] = []
    baseline_metrics = baseline.metrics
    for result in ablation_results:
        metrics = result.metrics
        is_baseline = result.removed_channel is None
        entries.append(
            FeatureAblationEntryResponse(
                label=result.label,
                channels=result.channels,
                removed_channel=result.removed_channel,
                mse=metrics.mse,
                rmse=metrics.rmse,
                mae=metrics.mae,
                mape=metrics.mape,
                directional_accuracy=metrics.directional_accuracy,
                delta_mse=None if is_baseline else metrics.mse - baseline_metrics.mse,
                delta_rmse=None if is_baseline else metrics.rmse - baseline_metrics.rmse,
                delta_mae=None if is_baseline else metrics.mae - baseline_metrics.mae,
                delta_mape=None if is_baseline else metrics.mape - baseline_metrics.mape,
                delta_directional_accuracy=(
                    None
                    if is_baseline
                    else metrics.directional_accuracy - baseline_metrics.directional_accuracy
                ),
            )
        )

    return FeatureAblationReportResponse(
        stock_id=stock["id"],
        mode=resolved_mode,
        configured_channels=resolve_feature_channels(request.app.state.config),
        transform_name=str(request.app.state.config["signal_processing"]["default_transform"]),
        entries=entries,
    )


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
