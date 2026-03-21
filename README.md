# FinSpectra

FinSpectra is a config-driven financial time-series forecasting platform with a FastAPI backend, a React frontend, signal-processing visualizations, CNN-based prediction workflows, live monitoring, and retraining support.

## What This Repo Includes

- A FastAPI backend for market data, signal processing, model inference, training orchestration, retraining, notebook generation, and SSE streams
- A React + TypeScript frontend with dashboard, stock detail, signal analysis, model comparison, live testing, explainer, and training pages
- A shared `stocks.json` configuration file that drives both services
- A Colab-friendly training notebook generator plus optional local training/retraining paths
- A CPU-only local runtime path so local inference does not need CUDA or NVIDIA wheels

## Quick Start

### Option 1: Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Backend docs: `http://localhost:8000/docs`

### Option 2: Run Services Manually

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

## Local Runtime vs Colab Training

If you train models in Google Colab, you do not need local CUDA or `nvidia_*` wheel packages.

What you do still need locally:

- `torch` for backend checkpoint loading and inference

What this repo already does for local development:

- `backend/requirements.runtime.txt` installs `torch==2.10.0+cpu`
- `docker-compose.yml` uses that CPU-only runtime file for the backend service

Use `backend/requirements.txt` only when you want the broader full environment. Use `backend/requirements.runtime.txt` for normal local app runtime.

## Main Features

- Config-driven stock universe and exchange settings from `stocks.json`
- Historical OHLCV, fundamentals, market index, and USD-INR ingestion
- FFT, STFT, CWT, and HHT signal-processing workflows
- Per-stock, unified, and unified-with-embeddings CNN model modes
- Generated Colab notebooks for training
- Local training and retraining endpoints
- Live prediction monitoring with market-status handling
- Beginner-friendly frontend with page guides, hover hints, and graph-first layouts

## Configuration

The project reads environment values from:

- root `.env`
- `backend/.env`
- `frontend/.env`

Common variables:

| Variable | Purpose | Default |
|---|---|---|
| `BACKEND_URL` | backend base URL | `http://localhost:8000` |
| `FRONTEND_URL` | allowed frontend origin(s) for CORS | `http://localhost:5173` |
| `VITE_BACKEND_URL` | frontend API base URL | `http://localhost:8000` |
| `APP_ENV` | backend environment label | `development` |
| `LOG_LEVEL` | backend log level | `INFO` |
| `ZERODHA_API_KEY` | Zerodha integration stub credential | empty |
| `ZERODHA_ACCESS_TOKEN` | Zerodha integration stub credential | empty |
| `ANGEL_ONE_API_KEY` | Angel One integration stub credential | empty |
| `ANGEL_ONE_CLIENT_ID` | Angel One integration stub credential | empty |
| `ANGEL_ONE_PASSWORD` | Angel One integration stub credential | empty |
| `ANGEL_ONE_TOTP_SECRET` | Angel One integration stub credential | empty |

Shared application behavior lives in `stocks.json`, including:

- enabled stocks
- exchanges and market hours
- signal-processing defaults
- training hyperparameters
- retraining policy
- startup training flags
- per-stock chart colors

## Verification Commands

Frontend:

```bash
cd frontend
npm run type-check
npm run lint
npm run build
```

Backend:

```bash
cd d:/StockCNN
python -m compileall backend
```

Optional browser coverage:

```bash
cd frontend
npm run test:e2e
```

## Documentation

- [`DOCUMENTATION.md`](./DOCUMENTATION.md): full project manual, setup guide, configuration guide, user flow, artifacts, and troubleshooting
- [`API_REFERENCE.md`](./API_REFERENCE.md): backend route reference, parameters, response behavior, and SSE notes
- [`ARCHITECTURE.md`](./ARCHITECTURE.md): architecture decisions and current system design
- [`ASSIGNMENT_ALIGNMENT.md`](./ASSIGNMENT_ALIGNMENT.md): mapping from assignment requirements to the implemented codebase
- [`finspectra_spec.md`](./finspectra_spec.md): original project specification

## Current Status

The main implementation is complete. The one long-standing verification-only gap is checking the live SSE stream during an actual open NSE trading session.
