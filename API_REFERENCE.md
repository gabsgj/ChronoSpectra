# FinSpectra API Reference

This document summarizes the backend API surface implemented in `backend/routes/`.

## Base URLs

- Backend base URL: `http://localhost:8000`
- Interactive docs: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

Compatibility aliases:

- legacy callers can use hidden `/api/*` equivalents
- the main documented paths below are the canonical ones

Examples:

- `/health` and `/api/health`
- `/data/market-data/RELIANCE` and `/api/data/market-data/RELIANCE`

## Response Conventions

### Standard Error Shape

Most structured errors follow this shape:

```json
{
  "error": "model_not_trained",
  "detail": "Prediction model for 'RELIANCE' is not trained yet.",
  "hint": "Run the Colab notebook and place .pth in model_store/",
  "artifact_path": "..."
}
```

Common status codes:

| Code | Meaning |
|---|---|
| `200` | success |
| `404` | unknown stock or exchange |
| `409` | training or retraining already running |
| `422` | invalid signal parameters or invalid query values |
| `503` | required data/model artifacts are unavailable |

## Root Endpoints

### `GET /health`

Purpose:

- simple health check

Response:

```json
{
  "status": "ok"
}
```

### `GET /config`

Purpose:

- returns the loaded application configuration

Notes:

- includes the normalized config state the app is using
- useful for frontend bootstrapping and debugging

## Data Endpoints

### `GET /data/fetch/{stock_id}`

Purpose:

- fetches raw historical OHLCV and fundamentals for one stock

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | yes | configured stock ID such as `RELIANCE` |

Response includes:

- `stock_id`
- `ticker`
- `historical_ohlcv`
- `fundamentals.revenue`
- `fundamentals.profit`

Common failures:

- `404` unknown stock
- `503` provider data unavailable

### `GET /data/fetch-all`

Purpose:

- fetches the raw payload for all enabled stocks

Response includes:

- `data`
- `count`

### `GET /data/market-data/{stock_id}`

Purpose:

- fetches the aligned chart-ready payload used by the frontend

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | yes | configured stock ID |

Response tracks:

- `price`
- `revenue`
- `profit`
- `index`
- `usd_inr`

Notes:

- `price`, `index`, and `usd_inr` are daily
- `revenue` and `profit` stay quarterly

## Signal Endpoints

### `GET /signal/fft/{stock_id}`

Purpose:

- returns the FFT spectrum for the stock signal

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | yes | configured stock ID |

Response includes:

- `frequency`
- `amplitude`
- `signal_timestamps`
- `normalized_signal`
- `dc_component_removed`

### `GET /signal/spectrogram/{stock_id}`

Purpose:

- generates a spectrogram

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | yes | configured stock ID |

Query parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `format` | `png` or `json` | no | defaults to `png` |
| `transform` | string | no | `stft`, `cwt`, or `hht` |
| `window_length` | int | no | STFT override |
| `hop_size` | int | no | STFT override |
| `n_fft` | int | no | STFT override |
| `wavelet` | string | no | CWT override |
| `scales` | int | no | CWT override |
| `max_imfs` | int | no | HHT override |
| `frequency_bins` | int | no | HHT override |

Behavior:

- returns `image/png` by default
- returns JSON when `format=json`

Example:

```http
GET /signal/spectrogram/RELIANCE?format=json&transform=stft&window_length=96&hop_size=16&n_fft=128
```

Common failures:

- `404` unknown stock
- `422` invalid transform parameters

### `GET /signal/stft-frames/{stock_id}`

Purpose:

- returns frame-by-frame STFT data for the explainer page

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | yes | configured stock ID |

Query parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `window_length` | int | no | STFT override |
| `hop_size` | int | no | STFT override |
| `n_fft` | int | no | STFT override |

Response includes:

- `frequency_axis`
- `frames`
- `count`

Each frame includes:

- `frame_index`
- `frame_timestamp`
- `segment_start`
- `segment_end`
- `segment_timestamps`
- `segment`
- `normalized_segment`
- `fft_column`

## Model Endpoints

### `POST /model/predict/{stock_id}`

Purpose:

- runs prediction for the latest available input window

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | yes | configured stock ID |

Response includes:

- `configured_mode`
- `resolved_mode`
- `checkpoint_path`
- `scaler_path`
- `transform_name`
- `prediction_horizon_days`
- `as_of_timestamp`
- `latest_close`
- `predicted_price`
- `predicted_price_normalized`
- `signal_window_length`

Notes:

- the backend can fall back from the configured mode to `per_stock` if needed
- this endpoint requires trained model artifacts plus scaler artifacts

### `GET /model/compare/{stock_id}`

Purpose:

- compares available model variants for a stock

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | yes | configured stock ID |

Response includes:

- `configured_prediction_mode`
- `available_modes`
- `variants`
- `best_available_mode`

Each variant can include:

- artifact path
- report path
- metrics
- missing-artifact error payload

### `GET /model/backtest/{stock_id}`

Purpose:

- returns recent saved prediction-history points for overlay/backtest views

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | yes | configured stock ID |

Query parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `limit` | int | no | number of points to return, default `50`, max `500` |

Response includes:

- `mode`
- `total_points`
- `returned_points`
- `metrics`
- `points`

Each point includes:

- `timestamp`
- `predicted_price`
- `actual_price`
- `reference_price`
- `absolute_error`
- `signed_error`
- `predicted_direction`
- `actual_direction`

## Training Endpoints

### `POST /training/start`

Purpose:

- starts a backend training run

Query parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | no | run for one stock only |

Response includes:

- `status`
- `run_id`
- `requested_stock_ids`
- `total_stocks`
- `started_at`

Common failures:

- `404` unknown stock
- `409` training already running

### `GET /training/progress`

Purpose:

- SSE stream of training events

Response type:

- `text/event-stream`

Event patterns:

- initial `snapshot`
- incremental event data
- terminal `completed`

### `GET /training/report`

Purpose:

- returns summary report entries

Query parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | no | return one stock report only |

Response includes:

- `count`
- `reports`
- `runtime`

### `GET /training/report-detail/{stock_id}`

Purpose:

- returns full saved training detail for one stock

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | yes | configured stock ID |

Response includes:

- `generated_at`
- `mode`
- `report_path`
- `history_length`
- `history`
- `metrics`
- `dataset_summary`
- `artifacts`
- `prediction_horizon_days`
- `transform_name`
- `lookback_days`

## Retraining Endpoints

### `POST /retraining/trigger/{stock_id}`

Purpose:

- executes a manual retraining call and waits for completion

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | yes | configured stock ID |

Response includes:

- `status`
- `result`

### `POST /retraining/start/{stock_id}`

Purpose:

- starts a runtime-tracked retraining run for one stock

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | yes | configured stock ID |

Response includes:

- `status`
- `run_id`
- `stock_id`
- `mode`
- `started_at`

### `POST /retraining/trigger-all`

Purpose:

- retrains all enabled stocks

Response includes:

- `status`
- `results`

### `GET /retraining/status`

Purpose:

- returns scheduler, runtime, and per-stock retraining diagnostics

Response includes:

- `scheduler`
- `runtime`
- `stocks`

Each stock entry includes:

- `stock_id`
- `mode`
- `retrain_due`
- `drift`

### `GET /retraining/progress`

Purpose:

- SSE stream for retraining events

Query parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `run_id` | string | no | filter stream to one retraining run |

Response type:

- `text/event-stream`

### `GET /retraining/logs`

Purpose:

- returns persisted retraining history

Response includes:

- `retrain_history`
- metadata about stored log entries

## Live Endpoints

### `GET /live/stream/{stock_id}`

Purpose:

- streams live or after-hours prediction snapshots

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `stock_id` | string | yes | configured stock ID |

Response type:

- `text/event-stream`

Payload fields:

- `stock_id`
- `ticker`
- `exchange`
- `timestamp`
- `actual`
- `predicted`
- `prediction_mode`
- `prediction_as_of`
- `market_open`
- `next_open_at`
- `seconds_until_open`
- `live_data_provider`

Important behavior:

- while the market is open, the endpoint streams repeatedly
- while the market is closed, the endpoint sends one payload and then closes

### `GET /live/market-status/{exchange}`

Purpose:

- returns current session metadata for one exchange

Path parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `exchange` | string | yes | exchange ID such as `NSE` |

Response includes:

- `exchange`
- `timezone`
- `checked_at`
- `market_open`
- `session_open_time`
- `session_close_time`
- `current_session_open_at`
- `current_session_close_at`
- `next_open_at`
- `seconds_until_open`
- `live_data_provider`

## Notebook Endpoint

### `GET /notebook/generate`

Purpose:

- generates and downloads a Colab notebook

Query parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| `mode` | string | no | `per_stock`, `unified`, `unified_with_embeddings`, or `both` |

Response type:

- file download
- media type `application/x-ipynb+json`

Example:

```http
GET /notebook/generate?mode=per_stock
```

## Common Usage Examples

### Health Check

```bash
curl http://localhost:8000/health
```

### Pull Chart Data for a Stock

```bash
curl http://localhost:8000/data/market-data/RELIANCE
```

### Pull a JSON Spectrogram

```bash
curl "http://localhost:8000/signal/spectrogram/RELIANCE?format=json&transform=stft"
```

### Start Training

```bash
curl -X POST "http://localhost:8000/training/start?stock_id=RELIANCE"
```

### Start Runtime-Tracked Retraining

```bash
curl -X POST "http://localhost:8000/retraining/start/RELIANCE"
```

### Download a Notebook

```bash
curl -OJ "http://localhost:8000/notebook/generate?mode=per_stock"
```
