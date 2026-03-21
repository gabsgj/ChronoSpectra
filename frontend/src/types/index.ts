export type ThemeMode = 'dark' | 'light'
export type ModelMode =
  | 'per_stock'
  | 'unified'
  | 'unified_with_embeddings'
  | 'both'
export type VariantModelMode = Exclude<ModelMode, 'both'>
export type TransformName = 'stft' | 'cwt' | 'hht'

export interface MarketHours {
  timezone: string
  open: string
  close: string
}

export interface ExchangeConfig {
  suffix: string
  market_index_ticker: string
  currency_pair: string
  market_hours: MarketHours
  historical_data_provider: string
  live_data_provider: string
  live_data_provider_options: string[]
  _live_note: string
}

export interface StockModelConfig {
  retrain_interval_days: number
  prediction_horizon_days: number
  training_data_years: number
}

export interface StockConfig {
  id: string
  ticker: string
  display_name: string
  exchange: keyof AppConfig['exchanges']
  sector: string
  color: string
  enabled: boolean
  model: StockModelConfig
}

export interface SignalProcessingConfig {
  default_transform: TransformName
  available_transforms: TransformName[]
  stft: {
    window_length: number
    hop_size: number
    window_function: string
    n_fft: number
  }
  cwt: {
    wavelet: string
    scales: number
  }
  hht?: {
    max_imfs: number
    frequency_bins: number
  }
}

export interface TrainingConfig {
  split: {
    train: number
    val: number
    test: number
  }
  epochs: number
  batch_size: number
  learning_rate: number
  split_strategy: string
}

export interface RetrainingConfig {
  enabled: boolean
  check_interval_hours: number
  strategy: string
  drift_threshold_multiplier: number
  notify_on_completion: boolean
}

export interface LocalTrainingConfig {
  enabled: boolean
  auto_place_models: boolean
  _note: string
}

export interface RetrainOnStartupConfig {
  enabled: boolean
  _note: string
}

export interface AppConfig {
  app_name: string
  version: string
  model_mode: ModelMode
  local_training: LocalTrainingConfig
  retrain_on_startup: RetrainOnStartupConfig
  exchanges: Record<string, ExchangeConfig>
  stocks: StockConfig[]
  signal_processing: SignalProcessingConfig
  training: TrainingConfig
  retraining: RetrainingConfig
}

export interface ApiErrorDetail {
  error: string
  detail: string
  hint?: string
  artifact_path?: string
}

export interface ApiErrorResponse {
  detail: ApiErrorDetail
}

export interface TrackPoint {
  timestamp: string
  value: number
}

export interface SignalTrack {
  frequency: string
  points: TrackPoint[]
}

export interface MarketDataTracks {
  price: SignalTrack
  revenue: SignalTrack
  profit: SignalTrack
  index: SignalTrack
  usd_inr: SignalTrack
}

export interface MarketDataResponse {
  stock_id: string
  ticker: string
  tracks: MarketDataTracks
}

export interface FFTResponse {
  stock_id: string
  ticker: string
  frequency: number[]
  amplitude: number[]
  signal_timestamps: string[]
  normalized_signal: number[]
  dc_component_removed: boolean
}

export interface SpectrogramResponse {
  stock_id: string
  ticker: string
  transform: TransformName
  signal_timestamps: string[]
  raw_signal: number[]
  normalized_signal: number[]
  frequency_axis: number[]
  time_axis: number[]
  time_timestamps: string[]
  spectrogram: number[][]
}

export interface STFTFrame {
  frame_index: number
  frame_timestamp: string
  segment_start: number
  segment_end: number
  segment_timestamps: string[]
  segment: number[]
  normalized_segment: number[]
  fft_column: number[]
}

export interface STFTFramesResponse {
  stock_id: string
  ticker: string
  transform: string
  frequency_axis: number[]
  frames: STFTFrame[]
  count: number
}

export interface STFTParameters {
  window_length: number
  hop_size: number
  n_fft: number
}

export interface CWTParameters {
  wavelet: string
  scales: number
}

export interface HHTParameters {
  max_imfs: number
  frequency_bins: number
}

export interface SpectrogramRequestParams
  extends Partial<STFTParameters>,
    Partial<CWTParameters>,
    Partial<HHTParameters> {}

export interface MarketStatusResponse {
  exchange: string
  timezone: string
  checked_at: string
  market_open: boolean
  session_open_time: string
  session_close_time: string
  current_session_open_at: string
  current_session_close_at: string
  next_open_at: string
  seconds_until_open: number
  live_data_provider: string
}

export interface LiveMarketEvent {
  stock_id: string
  ticker: string
  exchange: string
  timestamp: string
  actual: number
  predicted: number
  prediction_mode: string
  prediction_as_of: string
  prediction_horizon_days: number
  prediction_target_at: string
  market_open: boolean
  next_open_at: string
  seconds_until_open: number
  live_data_provider: string
}

export interface LivePredictionPoint {
  timestamp: string
  actual: number
  predicted: number
  spread: number
  prediction_mode: string
  market_open: boolean
  prediction_horizon_days?: number | null
  prediction_target_at?: string | null
}

export interface LivePredictionMetrics {
  actual: number | null
  predicted: number | null
  spread: number | null
  directionLabel: string
  sampleCount: number
}

export type LiveConnectionState =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'closed'
  | 'error'

export type DailyRangeOption = '1M' | '3M' | '6M' | '1Y' | 'MAX'

export interface ModelMetricsSummary {
  generated_at: string | null
  baseline_mse: number | null
  best_val_loss: number | null
  mse: number | null
  rmse: number | null
  mae: number | null
  mape: number | null
  directional_accuracy: number | null
}

export interface ModelVariantResponse {
  mode: VariantModelMode
  available: boolean
  artifact_path: string
  report_path: string | null
  metrics: ModelMetricsSummary | null
  error: ApiErrorDetail | null
}

export interface ModelCompareResponse {
  stock_id: string
  configured_prediction_mode: ModelMode
  available_modes: VariantModelMode[]
  variants: ModelVariantResponse[]
  best_available_mode: VariantModelMode | null
}

export interface BacktestPoint {
  timestamp: string
  predicted_price: number
  actual_price: number
  reference_price: number
  absolute_error: number
  signed_error: number
  predicted_direction: string
  actual_direction: string
}

export interface ModelBacktestResponse {
  stock_id: string
  mode: VariantModelMode
  total_points: number
  returned_points: number
  report_path: string
  history_path: string
  metrics: ModelMetricsSummary
  points: BacktestPoint[]
}

export interface TrainingResult {
  stock_id: string
  status: string
  reason: string | null
  mode: VariantModelMode | null
  timestamp: string | null
  before_mse: number | null
  after_mse: number | null
  duration_seconds: number | null
  error: string | null
}

export interface TrainingRuntimeResponse {
  run_id: string | null
  is_running: boolean
  started_at: string | null
  finished_at: string | null
  requested_stock_ids: string[]
  planned_modes: VariantModelMode[]
  job_labels: string[]
  active_stock_id: string | null
  active_mode: VariantModelMode | null
  active_job_label: string | null
  active_stage: string | null
  active_stage_detail: string | null
  active_stage_updated_at: string | null
  total_stocks: number
  completed_stocks: number
  total_jobs: number | null
  completed_jobs: number | null
  latest_event_id: number
  results: TrainingResult[]
}

export interface TrainingReportEntryResponse {
  stock_id: string
  generated_at: string | null
  mode: VariantModelMode
  report_path: string
  history_length: number
  metrics: ModelMetricsSummary
}

export interface TrainingReportCollectionResponse {
  count: number
  reports: TrainingReportEntryResponse[]
  runtime: TrainingRuntimeResponse
}

export interface TrainingEpochMetrics {
  epoch: number
  train_loss: number
  val_loss: number
}

export interface TrainingReportDetailResponse {
  stock_id: string
  generated_at: string | null
  mode: VariantModelMode
  report_path: string
  history_length: number
  history: TrainingEpochMetrics[]
  metrics: ModelMetricsSummary
  dataset_summary: Record<string, unknown>
  artifacts: Record<string, unknown>
  prediction_horizon_days: number | null
  transform_name: string | null
  lookback_days: number | null
}

export interface RetrainingLogEntry {
  stock_id: string
  timestamp: string | null
  reason: string | null
  mode: VariantModelMode | null
  before_mse: number | null
  after_mse: number | null
  duration_seconds: number | null
  status: string
  error: string | null
  checkpoint_path: string | null
  report_path: string | null
  scaler_paths: Record<string, string> | null
  dataset_summary: Record<string, unknown> | null
}

export interface RetrainingLogCollectionResponse {
  retrain_history: RetrainingLogEntry[]
}

export interface DriftDiagnosticsResponse {
  stock_id: string
  window_days: number
  baseline_mse: number | null
  recent_mse: number | null
  threshold_multiplier: number
  threshold_mse: number | null
  drift_detected: boolean
}

export interface RetrainingStockStatusResponse {
  stock_id: string
  mode: VariantModelMode
  retrain_due: boolean
  drift: DriftDiagnosticsResponse
}

export interface SchedulerStatusResponse {
  enabled: boolean
  running: boolean
  available: boolean
  check_interval_hours: number | null
  last_check_started_at: string | null
  last_check_completed_at: string | null
  last_results: Array<Record<string, unknown>>
}

export interface RetrainingActiveJobResponse {
  stock_id: string
  reason: string
  mode: VariantModelMode
  started_at: string
}

export interface RetrainingRuntimeStatusResponse {
  active_jobs: RetrainingActiveJobResponse[]
  is_running: boolean
  last_completed_job: Record<string, unknown> | null
  history_count: number
}

export interface RetrainingStatusResponse {
  scheduler: SchedulerStatusResponse
  runtime: RetrainingRuntimeStatusResponse
  stocks: RetrainingStockStatusResponse[]
}

export interface RetrainingStartResponse {
  status: string
  run_id: string
  stock_id: string
  mode: VariantModelMode | null
  started_at: string
}

export interface RetrainingProgressEvent {
  event_id: number
  event: string
  timestamp: string
  run_id?: string
  stock_id?: string
  mode?: VariantModelMode
  epoch?: number
  train_loss?: number
  val_loss?: number
  status?: string
  after_mse?: number | null
  duration_seconds?: number | null
  finished_at?: string | null
}

export interface RetrainingProgressSnapshot {
  run_id: string | null
  is_running: boolean
  stock_id: string | null
  mode: VariantModelMode | null
  started_at: string | null
  finished_at: string | null
  latest_event_id: number
  recent_events: RetrainingProgressEvent[]
  result: TrainingResult | null
}
