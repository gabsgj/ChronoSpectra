from __future__ import annotations

import math
import pickle
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import torch
from fastapi import APIRouter, Query, Request

from data.cache.data_cache import DataCache
from models.model_registry import ModelLoadResult, ModelRegistry
from routes.api_models import (
    APIErrorResponse,
    BacktestPointResponse,
    ModelBacktestResponse,
    ModelCompareResponse,
    ModelMetricsSummary,
    ModelVariantResponse,
    PredictionResponse,
)
from routes.utils import load_json_file, raise_structured_http_error, require_stock
from signal_processing.price_signal_loader import PriceSignalLoader
from signal_processing.transforms import get_transform
from training.training_types import ScalingMetadata

router = APIRouter(tags=["model"])
REPORT_STORE_DIR = Path(__file__).resolve().parents[1] / "models" / "model_store" / "reports"
PREDICTION_HISTORY_DIR = Path(__file__).resolve().parents[1] / "retraining" / "prediction_history"
MODEL_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    404: {"model": APIErrorResponse},
    422: {"model": APIErrorResponse},
    503: {"model": APIErrorResponse},
}


@router.post(
    "/predict/{stock_id}",
    response_model=PredictionResponse,
    responses=MODEL_ERROR_RESPONSES,
)
def predict(stock_id: str, request: Request) -> PredictionResponse:
    stock = require_stock(request, stock_id)
    registry = ModelRegistry(request.app.state.config)
    configured_mode = registry.get_prediction_mode()
    load_result = resolve_prediction_load_result(registry, stock_id)
    if not load_result.is_available or load_result.model is None:
        raise_model_not_trained_error(stock_id, load_result)
    scaler = load_scaler_or_error(registry, stock_id)
    latest_window = build_latest_input_window(
        stock,
        request.app.state.config,
        request.app.state.data_cache,
    )
    prediction_tensor = run_model_prediction(
        load_result,
        registry,
        stock_id,
        latest_window["inputs"],
    )
    predicted_normalized = float(prediction_tensor.squeeze().item())
    predicted_price = float(scaler.denormalize(np.array([predicted_normalized], dtype=float))[0])
    prediction_horizon_days = int(stock["model"]["prediction_horizon_days"])
    exchange_config = request.app.state.config["exchanges"][stock["exchange"]]
    return PredictionResponse(
        stock_id=stock["id"],
        ticker=latest_window["ticker"],
        configured_mode=configured_mode,
        resolved_mode=load_result.mode,
        checkpoint_path=str(load_result.artifact_path),
        scaler_path=str(registry.resolve_scaler_path(stock_id)),
        transform_name=latest_window["transform_name"],
        prediction_horizon_days=prediction_horizon_days,
        as_of_timestamp=latest_window["as_of_timestamp"],
        prediction_target_at=resolve_prediction_target_at(
            latest_window["as_of_timestamp"],
            prediction_horizon_days,
            str(exchange_config["market_hours"]["timezone"]),
            str(exchange_config["market_hours"]["close"]),
        ),
        latest_close=float(latest_window["latest_close"]),
        predicted_price=predicted_price,
        predicted_price_normalized=predicted_normalized,
        signal_window_length=int(latest_window["signal_window_length"]),
    )


@router.get(
    "/compare/{stock_id}",
    response_model=ModelCompareResponse,
    responses=MODEL_ERROR_RESPONSES,
)
def compare(stock_id: str, request: Request) -> ModelCompareResponse:
    stock = require_stock(request, stock_id)
    registry = ModelRegistry(request.app.state.config)
    configured_prediction_mode = registry.get_prediction_mode()
    variants: list[ModelVariantResponse] = []
    best_mode: str | None = None
    best_mse: float | None = None
    for mode in registry.configured_modes():
        load_result = registry.load_model(mode, stock["id"])
        report_payload = load_report_payload(mode, stock["id"])
        metrics_summary = build_metrics_summary(report_payload)
        variant_error = None
        if not load_result.is_available:
            error_payload = load_result.error or registry.build_model_not_trained_response()
            variant_error = APIErrorResponse(
                error=str(error_payload["error"]),
                detail=(
                    f"Model weights for '{stock['id']}' are not available for mode '{mode}'."
                ),
                hint=error_payload.get("hint"),
                artifact_path=str(load_result.artifact_path),
            )
        if metrics_summary.mse is not None and (best_mse is None or metrics_summary.mse < best_mse):
            best_mse = metrics_summary.mse
            best_mode = mode
        variants.append(
            ModelVariantResponse(
                mode=mode,
                available=load_result.is_available,
                artifact_path=str(load_result.artifact_path),
                report_path=str(resolve_report_path(mode, stock["id"])) if report_payload else None,
                metrics=metrics_summary if report_payload else None,
                error=variant_error,
            )
        )
    available_modes = [variant.mode for variant in variants if variant.available]
    if not available_modes:
        raise_model_not_trained_error(stock["id"], registry.load_prediction_model(stock["id"]))
    return ModelCompareResponse(
        stock_id=stock["id"],
        configured_prediction_mode=configured_prediction_mode,
        available_modes=available_modes,
        variants=variants,
        best_available_mode=best_mode,
    )


@router.get(
    "/backtest/{stock_id}",
    response_model=ModelBacktestResponse,
    responses=MODEL_ERROR_RESPONSES,
)
def backtest(
    stock_id: str,
    request: Request,
    limit: int = Query(50, ge=1, le=500),
) -> ModelBacktestResponse:
    stock = require_stock(request, stock_id)
    report_payload = load_report_payload("per_stock", stock["id"])
    history_payload = load_prediction_history_payload(stock["id"])
    if not report_payload or not history_payload.get("predictions"):
        raise_structured_http_error(
            503,
            "model_not_trained",
            f"No backtest artifacts are available yet for '{stock['id']}'.",
            hint=(
                "Trigger retraining or run the training notebook to generate "
                "report and prediction history artifacts."
            ),
            artifact_path=str(resolve_report_path("per_stock", stock["id"])),
        )
    metrics_summary = build_metrics_summary(report_payload)
    raw_points = list(history_payload["predictions"])
    selected_points = raw_points[-limit:]
    return ModelBacktestResponse(
        stock_id=stock["id"],
        mode=str(report_payload.get("mode", "per_stock")),
        total_points=len(raw_points),
        returned_points=len(selected_points),
        report_path=str(resolve_report_path("per_stock", stock["id"])),
        history_path=str(resolve_history_path(stock["id"])),
        metrics=metrics_summary,
        points=[serialize_backtest_point(point) for point in selected_points],
    )


def resolve_prediction_load_result(registry: ModelRegistry, stock_id: str) -> ModelLoadResult:
    configured_result = registry.load_prediction_model(stock_id)
    if configured_result.is_available:
        return configured_result
    if configured_result.mode != "per_stock":
        fallback_result = registry.load_model("per_stock", stock_id)
        if fallback_result.is_available:
            return fallback_result
    return configured_result


def build_latest_input_window(
    stock: dict[str, Any],
    app_config: dict[str, Any],
    cache: DataCache,
) -> dict[str, Any]:
    loader = PriceSignalLoader(app_config, cache)
    try:
        signal = loader.load(stock)
    except ValueError as exc:
        raise_structured_http_error(
            503,
            "data_unavailable",
            f"Prediction inputs for '{stock['id']}' are currently unavailable.",
            hint=str(exc),
        )
    transform_name = str(app_config["signal_processing"]["default_transform"]).lower()
    transform = get_transform(transform_name, app_config)
    lookback_days = resolve_lookback_days(app_config)
    if len(signal.normalized_values) < lookback_days:
        raise_structured_http_error(
            422,
            "insufficient_history",
            (
                "Not enough price history is available to build a prediction "
                f"window for '{stock['id']}'."
            ),
        )
    window = signal.normalized_values[-lookback_days:]
    spectrogram, _, _ = transform.transform(window)
    return {
        "inputs": np.expand_dims(np.asarray(spectrogram, dtype=np.float32), axis=(0, 1)),
        "ticker": signal.ticker,
        "transform_name": transform_name,
        "latest_close": float(signal.raw_values[-1]),
        "as_of_timestamp": signal.timestamps[-1],
        "signal_window_length": lookback_days,
    }


def run_model_prediction(
    load_result: ModelLoadResult,
    registry: ModelRegistry,
    stock_id: str,
    inputs: np.ndarray,
) -> torch.Tensor:
    if load_result.model is None:
        raise ValueError("Model must be available before prediction.")
    input_tensor = torch.from_numpy(inputs).float()
    with torch.no_grad():
        if load_result.mode == "unified_with_embeddings":
            stock_index = torch.tensor([registry.resolve_stock_index(stock_id)], dtype=torch.long)
            return load_result.model.predict(input_tensor, stock_index)
        return load_result.model.predict(input_tensor)


def load_scaler_or_error(registry: ModelRegistry, stock_id: str) -> ScalingMetadata:
    scaler_path = registry.resolve_scaler_path(stock_id)
    if not scaler_path.exists():
        raise_structured_http_error(
            503,
            "scaler_not_found",
            f"Scaler artifact for '{stock_id}' is missing.",
            hint=(
                "Trigger retraining or run the training notebook to create the "
                "scaler artifact."
            ),
            artifact_path=str(scaler_path),
        )
    with scaler_path.open("rb") as handle:
        loaded_scaler = pickle.load(handle)
    if not isinstance(loaded_scaler, ScalingMetadata):
        raise_structured_http_error(
            503,
            "invalid_scaler_artifact",
            f"Scaler artifact for '{stock_id}' could not be parsed.",
            artifact_path=str(scaler_path),
        )
    return loaded_scaler


def resolve_lookback_days(app_config: dict[str, Any]) -> int:
    stft_config = app_config["signal_processing"]["stft"]
    return max(
        int(stft_config["window_length"]) * 4,
        int(stft_config["n_fft"]),
    )


def load_report_payload(mode: str, stock_id: str) -> dict[str, Any]:
    return load_json_file(resolve_report_path(mode, stock_id))


def resolve_report_path(mode: str, stock_id: str) -> Path:
    if mode == "per_stock":
        return REPORT_STORE_DIR / f"{stock_id}_training_report.json"
    if mode == "unified":
        return REPORT_STORE_DIR / "unified_training_report.json"
    return REPORT_STORE_DIR / "unified_with_embeddings_training_report.json"


def load_prediction_history_payload(stock_id: str) -> dict[str, Any]:
    return load_json_file(resolve_history_path(stock_id))


def resolve_history_path(stock_id: str) -> Path:
    return PREDICTION_HISTORY_DIR / f"{stock_id}.json"


def build_metrics_summary(report_payload: dict[str, Any]) -> ModelMetricsSummary:
    metrics = report_payload.get("metrics", {}) if isinstance(report_payload, dict) else {}
    return ModelMetricsSummary(
        generated_at=(
            report_payload.get("generated_at") if isinstance(report_payload, dict) else None
        ),
        baseline_mse=(
            _as_float(report_payload.get("baseline_mse"))
            if isinstance(report_payload, dict)
            else None
        ),
        best_val_loss=(
            _as_float(report_payload.get("best_val_loss"))
            if isinstance(report_payload, dict)
            else None
        ),
        mse=_as_float(metrics.get("mse")) if isinstance(metrics, dict) else None,
        rmse=_as_float(metrics.get("rmse")) if isinstance(metrics, dict) else None,
        mae=_as_float(metrics.get("mae")) if isinstance(metrics, dict) else None,
        mape=_as_float(metrics.get("mape")) if isinstance(metrics, dict) else None,
        directional_accuracy=(
            _as_float(metrics.get("directional_accuracy"))
            if isinstance(metrics, dict)
            else None
        ),
    )


def serialize_backtest_point(point: dict[str, Any]) -> BacktestPointResponse:
    predicted_price = float(point["predicted_price"])
    actual_price = float(point["actual_price"])
    reference_price = float(point["reference_price"])
    signed_error = predicted_price - actual_price
    return BacktestPointResponse(
        timestamp=str(point["timestamp"]),
        predicted_price=predicted_price,
        actual_price=actual_price,
        reference_price=reference_price,
        absolute_error=abs(signed_error),
        signed_error=signed_error,
        predicted_direction=direction_label(predicted_price - reference_price),
        actual_direction=direction_label(actual_price - reference_price),
    )


def direction_label(delta: float) -> str:
    if math.isclose(delta, 0.0, abs_tol=1e-9):
        return "flat"
    return "up" if delta > 0 else "down"


def resolve_prediction_target_at(
    as_of_timestamp: str,
    prediction_horizon_days: int,
    timezone_name: str,
    close_time_value: str,
) -> str:
    from zoneinfo import ZoneInfo

    timezone = ZoneInfo(timezone_name)
    close_time = time.fromisoformat(close_time_value)
    as_of_datetime = datetime.fromisoformat(as_of_timestamp)
    if as_of_datetime.tzinfo is None:
        as_of_datetime = as_of_datetime.replace(tzinfo=timezone)
    current_date = as_of_datetime.astimezone(timezone).date()
    remaining_sessions = max(prediction_horizon_days, 1)

    while remaining_sessions > 0:
        current_date += timedelta(days=1)
        if current_date.weekday() < 5:
            remaining_sessions -= 1

    target_datetime = datetime.combine(current_date, close_time, tzinfo=timezone)
    return target_datetime.isoformat()


def raise_model_not_trained_error(stock_id: str, load_result: ModelLoadResult) -> None:
    error_payload = load_result.error or {"error": "model_not_trained", "hint": None}
    raise_structured_http_error(
        503,
        str(error_payload["error"]),
        f"Prediction model for '{stock_id}' is not trained yet.",
        hint=error_payload.get("hint"),
        artifact_path=str(load_result.artifact_path),
    )


def _as_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None
