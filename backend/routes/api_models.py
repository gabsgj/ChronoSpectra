from __future__ import annotations

from typing import Any

from pydantic import BaseModel, RootModel


class APIErrorResponse(BaseModel):
    error: str
    detail: str
    hint: str | None = None
    artifact_path: str | None = None


class ModelMetricsSummary(BaseModel):
    generated_at: str | None = None
    baseline_mse: float | None = None
    best_val_loss: float | None = None
    mse: float | None = None
    rmse: float | None = None
    mae: float | None = None
    mape: float | None = None
    directional_accuracy: float | None = None


class PredictionResponse(BaseModel):
    stock_id: str
    ticker: str
    configured_mode: str
    resolved_mode: str
    checkpoint_path: str
    scaler_path: str
    transform_name: str
    prediction_horizon_days: int
    as_of_timestamp: str
    prediction_target_at: str
    latest_close: float
    predicted_price: float
    predicted_price_normalized: float
    signal_window_length: int


class ModelVariantResponse(BaseModel):
    mode: str
    available: bool
    artifact_path: str
    report_path: str | None = None
    metrics: ModelMetricsSummary | None = None
    error: APIErrorResponse | None = None


class ModelCompareResponse(BaseModel):
    stock_id: str
    configured_prediction_mode: str
    available_modes: list[str]
    variants: list[ModelVariantResponse]
    best_available_mode: str | None = None


class BacktestPointResponse(BaseModel):
    timestamp: str
    predicted_price: float
    actual_price: float
    reference_price: float
    absolute_error: float
    signed_error: float
    predicted_direction: str
    actual_direction: str


class ModelBacktestResponse(BaseModel):
    stock_id: str
    mode: str
    total_points: int
    returned_points: int
    report_path: str
    history_path: str
    metrics: ModelMetricsSummary
    points: list[BacktestPointResponse]


class TrainingResultResponse(BaseModel):
    stock_id: str
    status: str
    reason: str | None = None
    mode: str | None = None
    timestamp: str | None = None
    before_mse: float | None = None
    after_mse: float | None = None
    duration_seconds: float | None = None
    error: str | None = None


class TrainingStartResponse(BaseModel):
    status: str
    run_id: str
    requested_stock_ids: list[str]
    total_stocks: int
    total_jobs: int | None = None
    planned_modes: list[str] = []
    started_at: str


class TrainingRuntimeResponse(BaseModel):
    run_id: str | None = None
    is_running: bool
    started_at: str | None = None
    finished_at: str | None = None
    requested_stock_ids: list[str]
    planned_modes: list[str] = []
    job_labels: list[str] = []
    active_stock_id: str | None = None
    active_mode: str | None = None
    active_job_label: str | None = None
    active_stage: str | None = None
    active_stage_detail: str | None = None
    active_stage_updated_at: str | None = None
    total_stocks: int
    completed_stocks: int
    total_jobs: int | None = None
    completed_jobs: int | None = None
    latest_event_id: int
    results: list[TrainingResultResponse]


class TrainingReportEntryResponse(BaseModel):
    stock_id: str
    generated_at: str | None = None
    mode: str
    report_path: str
    history_length: int
    metrics: ModelMetricsSummary


class TrainingReportCollectionResponse(BaseModel):
    count: int
    reports: list[TrainingReportEntryResponse]
    runtime: TrainingRuntimeResponse


class TrainingEpochMetricsResponse(BaseModel):
    epoch: int
    train_loss: float
    val_loss: float


class TrainingReportDetailResponse(BaseModel):
    stock_id: str
    generated_at: str | None = None
    mode: str
    report_path: str
    history_length: int
    history: list[TrainingEpochMetricsResponse]
    metrics: ModelMetricsSummary
    dataset_summary: dict[str, Any]
    artifacts: dict[str, Any]
    prediction_horizon_days: int | None = None
    transform_name: str | None = None
    lookback_days: int | None = None


class FeatureAblationEntryResponse(BaseModel):
    label: str
    channels: list[str]
    removed_channel: str | None = None
    mse: float
    rmse: float
    mae: float
    mape: float
    directional_accuracy: float
    delta_mse: float | None = None
    delta_rmse: float | None = None
    delta_mae: float | None = None
    delta_mape: float | None = None
    delta_directional_accuracy: float | None = None


class FeatureAblationReportResponse(BaseModel):
    stock_id: str
    mode: str
    configured_channels: list[str]
    transform_name: str
    entries: list[FeatureAblationEntryResponse]


class MarketStatusResponse(BaseModel):
    exchange: str
    timezone: str
    checked_at: str
    market_open: bool
    session_open_time: str
    session_close_time: str
    current_session_open_at: str
    current_session_close_at: str
    next_open_at: str
    seconds_until_open: int
    live_data_provider: str


class HealthResponse(BaseModel):
    status: str


class ConfigResponse(RootModel[dict[str, Any]]):
    pass


class OHLCVPointResponse(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class StatementPointResponse(BaseModel):
    timestamp: str
    value_crores: float


class FundamentalsSeriesResponse(BaseModel):
    revenue: list[StatementPointResponse]
    profit: list[StatementPointResponse]


class StockFetchResponse(BaseModel):
    stock_id: str
    ticker: str
    historical_ohlcv: list[OHLCVPointResponse]
    fundamentals: FundamentalsSeriesResponse


class StockFetchCollectionResponse(BaseModel):
    data: list[StockFetchResponse]
    count: int


class TrackPointResponse(BaseModel):
    timestamp: str
    value: float


class SignalTrackResponse(BaseModel):
    frequency: str
    points: list[TrackPointResponse]


class MarketTracksResponse(BaseModel):
    price: SignalTrackResponse
    revenue: SignalTrackResponse
    profit: SignalTrackResponse
    index: SignalTrackResponse
    usd_inr: SignalTrackResponse


class MarketDataResponse(BaseModel):
    stock_id: str
    ticker: str
    tracks: MarketTracksResponse


class FFTResponse(BaseModel):
    stock_id: str
    ticker: str
    frequency: list[float]
    amplitude: list[float]
    signal_timestamps: list[str]
    normalized_signal: list[float]
    dc_component_removed: bool


class SpectrogramResponse(BaseModel):
    stock_id: str
    ticker: str
    transform: str
    signal_timestamps: list[str]
    raw_signal: list[float]
    normalized_signal: list[float]
    frequency_axis: list[float]
    time_axis: list[float]
    time_timestamps: list[str]
    spectrogram: list[list[float]]


class STFTFrameResponse(BaseModel):
    frame_index: int
    frame_timestamp: str
    segment_start: int
    segment_end: int
    segment_timestamps: list[str]
    segment: list[float]
    normalized_segment: list[float]
    fft_column: list[float]


class STFTFramesResponse(BaseModel):
    stock_id: str
    ticker: str
    transform: str
    frequency_axis: list[float]
    frames: list[STFTFrameResponse]
    count: int


class RetrainingLogEntryResponse(BaseModel):
    stock_id: str
    timestamp: str | None = None
    reason: str | None = None
    mode: str | None = None
    before_mse: float | None = None
    after_mse: float | None = None
    duration_seconds: float | None = None
    status: str
    error: str | None = None
    checkpoint_path: str | None = None
    report_path: str | None = None
    scaler_paths: dict[str, str] | None = None
    dataset_summary: dict[str, Any] | None = None


class RetrainingTriggerResponse(BaseModel):
    status: str
    result: RetrainingLogEntryResponse


class RetrainingStartResponse(BaseModel):
    status: str
    run_id: str
    stock_id: str
    mode: str | None = None
    started_at: str


class RetrainingTriggerAllResponse(BaseModel):
    status: str
    results: list[RetrainingLogEntryResponse]


class DriftDiagnosticsResponse(BaseModel):
    stock_id: str
    window_days: int
    baseline_mse: float | None = None
    recent_mse: float | None = None
    threshold_multiplier: float
    threshold_mse: float | None = None
    drift_detected: bool


class RetrainingStockStatusResponse(BaseModel):
    stock_id: str
    mode: str
    retrain_due: bool
    drift: DriftDiagnosticsResponse


class SchedulerStatusResponse(BaseModel):
    enabled: bool
    running: bool
    available: bool
    check_interval_hours: int | None = None
    last_check_started_at: str | None = None
    last_check_completed_at: str | None = None
    last_results: list[dict[str, Any]]


class RetrainingActiveJobResponse(BaseModel):
    stock_id: str
    reason: str
    mode: str
    started_at: str


class RetrainingRuntimeStatusResponse(BaseModel):
    active_jobs: list[RetrainingActiveJobResponse]
    is_running: bool
    last_completed_job: dict[str, Any] | None = None
    history_count: int


class RetrainingStatusResponse(BaseModel):
    scheduler: SchedulerStatusResponse
    runtime: RetrainingRuntimeStatusResponse
    stocks: list[RetrainingStockStatusResponse]


class RetrainingLogCollectionResponse(BaseModel):
    retrain_history: list[RetrainingLogEntryResponse]
