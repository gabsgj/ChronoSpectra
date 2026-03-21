# ChronoSpectra

ChronoSpectra is a configuration-driven financial time-series forecasting platform with a FastAPI backend and a React frontend. It provides end-to-end workflows for market data ingestion, signal transforms, CNN-based forecasting, model comparison, live monitoring, and optional retraining.

## Key Capabilities

- Shared app configuration through a single `stocks.json` file.
- Multi-source market context (stock, index, and FX context where configured).
- Signal-analysis workflows using FFT, STFT, CWT, and HHT.
- Model variants: `per_stock`, `unified`, and `unified_with_embeddings`.
- Live testing with streaming updates and closed-market fallback behavior.
- Local training/retraining orchestration and report-driven model evaluation.
- Notebook generation for external/Colab training workflows.

## Quick Start

### Option A: Docker Compose

```bash
docker compose up --build
```

Default local endpoints:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Backend OpenAPI docs: `http://localhost:8000/docs`

### Option B: Manual Run

Backend:

```bash
cd backend
python -m pip install -r requirements.runtime.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Training Workflows

ChronoSpectra supports two practical training patterns.

### Colab-first training (recommended)

- Generate and run notebooks for training in Google Colab.
- Export model artifacts back to this repository structure.
- Keep local runtime lightweight for inference and UI operations.

Why this is recommended:

- GPU-heavy training is better suited to Colab/external compute.
- Local app usage remains stable without CUDA/NVIDIA dependency complexity.

### Local training (offline regeneration)

- Enable local training in `stocks.json` using `local_training.enabled` when you explicitly want backend-managed local training.
- Disable it again for normal runtime usage once artifacts are generated.

### Startup retraining

- `retrain_on_startup.enabled` triggers stale-or-missing model refresh on backend startup.
- If both startup flags are `true`, local training takes precedence.

## Model Modes

Supported modes:

- `per_stock`: dedicated checkpoint per stock.
- `unified`: one shared checkpoint across stocks.
- `unified_with_embeddings`: shared checkpoint with stock identity embeddings.
- `both`: comparison-oriented config mode that exposes multiple variants.

Prediction behavior notes:

- The configured prediction mode is read from `stocks.json`.
- Live Testing supports explicit mode override in the UI.
- Forced mode requires artifacts for that specific mode; unavailable artifacts produce a clear backend error.

## Tech Stack

- Backend: FastAPI, NumPy, pandas, SciPy, PyWavelets, EMD-signal, PyTorch.
- Frontend: React, TypeScript, Vite, D3, Tailwind CSS.
- Runtime orchestration: Docker Compose (optional, recommended for local setup).

## Repository Structure

```text
StockCNN/
|- backend/
|  |- data/
|  |- models/
|  |- routes/
|  |- retraining/
|  |- signal_processing/
|  |- training/
|  |- main.py
|  |- requirements.runtime.txt
|  |- requirements.txt
|- frontend/
|  |- src/
|  |- package.json
|- docker-compose.yml
|- stocks.json
|- API_REFERENCE.md
|- README.md
```

## Prerequisites

- Python 3.12
- Node.js 22+
- npm 10+
- Docker Desktop (optional)

## Configuration

### Environment Variables

Runtime values may be loaded from root `.env`, `backend/.env`, and `frontend/.env`.

Common variables:

| Variable | Purpose | Typical value |
|---|---|---|
| `BACKEND_URL` | Backend base URL | `http://localhost:8000` |
| `FRONTEND_URL` | Allowed frontend origins for CORS | `http://localhost:5173` |
| `VITE_BACKEND_URL` | Frontend API base URL | `http://localhost:8000` |
| `APP_ENV` | Backend environment label | `development` |
| `LOG_LEVEL` | Backend log level | `INFO` |

### `stocks.json`

`stocks.json` is the primary control plane for application behavior:

- Global model mode and startup behavior.
- Exchange and market-hours metadata.
- Active stock universe and per-stock forecast horizon.
- Signal processing defaults (including STFT settings).
- Training and retraining policies.

## Runtime Profiles

- `backend/requirements.runtime.txt`: preferred local runtime dependency set (CPU-only PyTorch path).
- `backend/requirements.txt`: broader dependency set for extended development/training scenarios.

For standard local app execution, use `requirements.runtime.txt`.

## Artifacts and Storage

Model and retraining outputs are written under backend storage paths such as:

- `backend/models/model_store/per_stock/`
- `backend/models/model_store/unified/`
- `backend/models/model_store/scalers/`
- `backend/models/model_store/reports/`
- `backend/retraining/prediction_history/`
- `backend/retraining/retrain_log.json`

These artifacts back model predict/compare/backtest routes and live fallback behavior.

## Development Commands

Frontend checks:

```bash
cd frontend
npm run type-check
npm run lint
npm run build
```

Backend syntax sanity check:

```bash
cd d:/StockCNN
python -m compileall backend
```

Optional browser E2E tests:

```bash
cd frontend
npm run test:e2e
```

## API Reference

Detailed API endpoint documentation is available in [API_REFERENCE.md](API_REFERENCE.md).

## Operational Notes

- Signal Analysis parameter overrides are for analysis endpoints.
- Prediction routes use runtime model configuration unless backend prediction logic is explicitly changed.
- For local runtime, prefer CPU PyTorch via `backend/requirements.runtime.txt`.
- Use startup training/retraining flags only intentionally, not as always-on defaults.

## Troubleshooting

### Frontend cannot reach backend

- Verify backend is running and reachable on the configured host/port.
- Check `VITE_BACKEND_URL` in frontend environment.
- Check backend CORS configuration (`FRONTEND_URL`).

### Live stream errors

- Confirm network reachability to `/live/stream/{stock_id}`.
- Verify selected model mode has artifacts if mode override is enabled.
- Check backend logs for model/scaler artifact availability.

### Model unavailable errors

- Ensure trained artifacts exist under `backend/models/model_store/`.
- If forcing a specific mode, ensure that mode checkpoint exists for requested stock/context.

