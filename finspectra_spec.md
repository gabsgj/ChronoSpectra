# FinSpectra — Pattern Recognition for Financial Time Series Forecasting
### Full Project Specification v1.1

> **Stack:** React + TypeScript + Vite (Frontend) · FastAPI + Python (Backend) · PyTorch (Model) · Google Colab (Training)
> **Architecture:** Highly modular, config-driven, exchange-aware, periodically retrained, single-page React app with route-based rendering

---

## Table of Contents

1. [Objective](#1-objective)
2. [Problem Description](#2-problem-description)
3. [Signal Processing Theory](#3-signal-processing-theory)
4. [Architecture Decisions & Corrections](#4-architecture-decisions--corrections)
5. [System Architecture](#5-system-architecture)
6. [Stock Configuration — stocks.json](#6-stock-configuration--stocksjson)
7. [Folder Structure](#7-folder-structure)
8. [Backend — FastAPI](#8-backend--fastapi)
9. [Signal Processing Modules](#9-signal-processing-modules)
10. [CNN Model Variants](#10-cnn-model-variants)
11. [Training Pipeline & Colab Notebooks](#11-training-pipeline--colab-notebooks)
12. [Periodic Retraining System](#12-periodic-retraining-system)
13. [Frontend — React + TypeScript](#13-frontend--react--typescript)
14. [Live Testing & Real-Time Prediction](#14-live-testing--real-time-prediction)
15. [Visualization Tab — How It Works](#15-visualization-tab--how-it-works)
16. [Required Figures & Charts](#16-required-figures--charts)
17. [Light / Dark Mode](#17-light--dark-mode)
18. [API Reference](#18-api-reference)
19. [Assignment Tasks Mapping](#19-assignment-tasks-mapping)
20. [Analysis & Evaluation](#20-analysis--evaluation)
21. [References](#21-references)

---

## 1. Objective

The objective of FinSpectra is to explore how **time–frequency signal processing** and **deep learning** can be combined to predict stock prices using financial time series data. This implementation extends the academic assignment into a production-grade, modular web application featuring real-time market data, animated visualizations of the underlying model mechanics, and a dynamic config-driven pipeline that adapts to any set of stocks and exchanges.

The prediction model is defined as:

```
p̂(t + Δt) = fθ(St)
```

where `fθ` is a CNN model trained on spectrogram representations `St` of the input signal.

---

## 2. Problem Description

Financial time series data is treated as a **multivariate signal**:

```
X(t) = [p(t), r(t), g(t), s(t), d(t)]
```

| Symbol | Variable | Frequency | Source |
|--------|----------|-----------|--------|
| `p(t)` | Stock price (OHLCV) | Daily | yfinance |
| `r(t)` | Revenue | Quarterly | yfinance fundamentals |
| `g(t)` | Profit (gross) | Quarterly | yfinance fundamentals |
| `s(t)` | Market index (Sensex/NIFTY) | Daily | yfinance |
| `d(t)` | USD–INR exchange rate | Daily | yfinance (`USDINR=X`) |

> **Signal track separation:** Revenue and profit are quarterly signals. They are handled on a separate processing track, visualized independently as bar charts, and optionally forward-filled to daily frequency for feature fusion. The STFT and CNN pipeline operates primarily on daily signals. This is an intentional architectural decision — not a limitation.

---

## 3. Signal Processing Theory

### 3.1 Signal Representation

Financial data is treated as a signal in:
- **Time domain** — amplitude (price) vs time
- **Frequency domain** — amplitude vs frequency (via Fourier Transform)

### 3.2 Short-Time Fourier Transform (STFT)

Financial time series are **non-stationary** — their statistical properties change over time. A plain Fourier Transform assumes stationarity, so STFT is used instead, analyzing the signal through short overlapping windows:

```
STFT(t, f) = ∫₋∞^∞ X(τ) · w(τ − t) · e^(−j2πfτ) dτ
```

The **spectrogram** is the squared magnitude:

```
S(t, f) = |STFT(t, f)|²
```

### 3.3 Sliding Window Mechanism

Given signal `X(t)` and window length `L`, the STFT extracts overlapping segments:

```
X_{1:L},  X_{1+H:L+H},  X_{1+2H:L+2H},  ...
```

| Parameter | Symbol | Effect |
|-----------|--------|--------|
| Window Length | `L` | Larger → better frequency resolution |
| Hop Size | `H` | Smaller → finer time resolution |
| Overlap | `L − H` | Higher → smoother spectrogram |

> **Important distinction:** The sliding window serves two different purposes in this project. During **training**, it slides over historical data to generate a large dataset of (spectrogram → future price) pairs all at once. During **inference**, only the most recent window is used to produce a live prediction. No retraining happens during inference.

### 3.4 Spectrogram Computation (Per Window)

**Step 1 — Windowing:**
```
x_w(τ) = X(τ) · w(τ − t)
```

**Step 2 — Fourier Transform:**
```
X_t(f) = ∫₋∞^∞ x_w(τ) · e^(−j2πfτ) dτ
```

**Step 3 — Magnitude Squared:**
```
S(t, f) = |X_t(f)|²
```

Each window produces one **column** of the spectrogram. Stacking all columns forms `S ∈ ℝ^(T×F)` — a 2D image.

### 3.5 Interpretation for Financial Data

| Frequency Band | Financial Meaning |
|----------------|-------------------|
| Low frequency | Long-term trends (bull/bear cycles) |
| Mid frequency | Weekly/monthly cyclical patterns |
| High frequency | Short-term noise and daily volatility |

---

## 4. Architecture Decisions & Corrections

### 4.1 No Exchange Tabs in the UI

Exchanges (NSE, BSE, NYSE) are **metadata on each stock**, not a navigation concept. Users think in terms of stock names, not exchanges. The exchange is displayed as a small badge next to each stock's name and drives backend logic (ticker suffix, market hours, API routing). It does not appear as a tab.

### 4.2 SPA with Route-Based Rendering, Not a Long Single Page

The app is a **Single Page Application** using React Router — it feels seamless and instant but each tab/view only mounts when active. This is critical because:
- The Live Testing tab runs a persistent SSE connection that should not be active when unused
- The How It Works tab has heavy animations that should not run in the background
- Signal Analysis has interactive sliders that trigger API calls on change

### 4.3 Daily vs Quarterly Signal Separation

- **Daily signals** (price, index, USD-INR) → STFT pipeline → CNN → prediction
- **Quarterly signals** (revenue, profit) → visualized as bar charts, optionally fused as forward-filled features

### 4.4 Data Provider Strategy

**yfinance** is the active implementation for all data — historical OHLCV, fundamentals, market index, and USD-INR rate. It is the only fully implemented fetcher.

**Zerodha Kite API** and **Angel One SmartAPI** are properly stubbed with correct method signatures, auth patterns, and endpoint comments. They are not active but are ready to be activated by filling in the implementation. Both are free with a brokerage account.

The distinction between the three providers matters mainly for **live intraday data**:

| Provider | Historical Data | Live Intraday | Delay | Auth |
|----------|----------------|---------------|-------|------|
| yfinance | ✅ Full | ⚠️ 15-min delayed | 15 min | None |
| Zerodha Kite | ✅ Via API | ✅ Real-time WebSocket | None | API key + access token |
| Angel One SmartAPI | ✅ Via API | ✅ Real-time WebSocket | None | API key + TOTP |

For historical training data and backtesting, yfinance is fully sufficient. For the Live Testing tab to show truly real-time prices, swap to Zerodha or Angel One by changing `live_data_provider` in `stocks.json`.

The `BaseDataFetcher` interface is designed around the union of all three providers' capabilities so no provider forces an awkward workaround.

### 4.5 Per-Stock vs Unified Model

Three variants are available:

| Mode | Description | Recommendation |
|------|-------------|----------------|
| `per_stock` | One CNN per ticker | Maximum per-stock accuracy |
| `unified` | One CNN for all stocks | Cross-market generalization |
| `unified_with_embeddings` | One CNN + learned stock ID vector | **Production-grade — recommended** |
| `both` | Train all variants | Assignment comparison |

The **unified CNN with stock embeddings** is the most sophisticated approach. Each stock receives a learned identity vector concatenated with CNN features before the prediction head. This is how real FinTech ML systems work. Training this variant and comparing it against per-stock models is the analytical highlight of the assignment.

---

## 5. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    stocks.json (Config)                      │
│  Drives: data fetching · exchange routing · model selection  │
│          training notebooks · retraining schedule · live API │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
 ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐
 │  React +    │   │   FastAPI    │   │  Google Colab    │
 │ TypeScript  │◄──►   Backend   │   │  Training NB     │
 │  Frontend   │   │             │   │  (Jinja2-gen'd   │
 └─────────────┘   └──────┬──────┘   │  from config)    │
                          │          └──────────────────┘
            ┌─────────────┼────────────────┐
            ▼             ▼                ▼
    ┌──────────────┐ ┌──────────┐ ┌──────────────────┐
    │ Data Layer   │ │ Signal   │ │  Model Layer     │
    │ (yfinance /  │ │Processing│ │  per-stock CNN   │
    │  exchange    │ │ STFT/CWT │ │  unified CNN     │
    │   APIs)      │ │  /HHT    │ │  + embeddings    │
    └──────────────┘ └──────────┘ └──────────────────┘
```

### Full Pipeline

```
stocks.json
    │
    ▼
Data Fetcher (exchange-aware via BaseDataFetcher)
    │
    ├──► Daily signals   ──► Normalize ──► STFT ──► Spectrogram ──► CNN ──► p̂(t+Δt)
    │                                                                         │
    └──► Quarterly signals ──► Visualize as bar charts (separate track)       │
                                                                              ▼
                                                                 Historical Backtest
                                                                 Live Intraday Overlay
```

---

## 6. Stock Configuration — stocks.json

This single file is the **spine of the entire application**. Every component — data fetching, model training, API routing, notebook generation, frontend rendering, and the retraining scheduler — reads from this config.

```json
{
  "app_name": "FinSpectra",
  "version": "1.1.0",
  "model_mode": "both",

  "exchanges": {
    "NSE": {
      "suffix": ".NS",
      "market_index_ticker": "^NSEI",
      "currency_pair": "USDINR=X",
      "market_hours": {
        "timezone": "Asia/Kolkata",
        "open": "09:15",
        "close": "15:30"
      },
      "historical_data_provider": "yfinance",
      "live_data_provider": "yfinance",
      "live_data_provider_options": ["yfinance", "zerodha", "angel_one"],
      "_live_note": "yfinance = 15-min delayed. Switch to zerodha or angel_one for real-time."
    },
    "BSE": {
      "suffix": ".BO",
      "market_index_ticker": "^BSESN",
      "currency_pair": "USDINR=X",
      "market_hours": {
        "timezone": "Asia/Kolkata",
        "open": "09:15",
        "close": "15:30"
      },
      "historical_data_provider": "yfinance",
      "live_data_provider": "yfinance",
      "live_data_provider_options": ["yfinance", "zerodha", "angel_one"],
      "_live_note": "yfinance = 15-min delayed. Switch to zerodha or angel_one for real-time."
    },
    "NYSE": {
      "suffix": "",
      "market_index_ticker": "^GSPC",
      "currency_pair": "USDINR=X",
      "market_hours": {
        "timezone": "America/New_York",
        "open": "09:30",
        "close": "16:00"
      },
      "historical_data_provider": "yfinance",
      "live_data_provider": "yfinance",
      "live_data_provider_options": ["yfinance"],
      "_live_note": "yfinance only for NYSE currently. Polygon.io can be added later."
    }
  },

  "stocks": [
    {
      "id": "RELIANCE",
      "ticker": "RELIANCE.NS",
      "display_name": "Reliance Industries",
      "exchange": "NSE",
      "sector": "Energy",
      "enabled": true,
      "model": {
        "retrain_interval_days": 30,
        "prediction_horizon_days": 5,
        "training_data_years": 5
      }
    },
    {
      "id": "TCS",
      "ticker": "TCS.NS",
      "display_name": "Tata Consultancy Services",
      "exchange": "NSE",
      "sector": "Technology",
      "enabled": true,
      "model": {
        "retrain_interval_days": 30,
        "prediction_horizon_days": 5,
        "training_data_years": 5
      }
    },
    {
      "id": "HDFCBANK",
      "ticker": "HDFCBANK.NS",
      "display_name": "HDFC Bank",
      "exchange": "NSE",
      "sector": "Banking",
      "enabled": true,
      "model": {
        "retrain_interval_days": 30,
        "prediction_horizon_days": 5,
        "training_data_years": 5
      }
    },
    {
      "id": "INFY",
      "ticker": "INFY.NS",
      "display_name": "Infosys",
      "exchange": "NSE",
      "sector": "Technology",
      "enabled": true,
      "model": {
        "retrain_interval_days": 30,
        "prediction_horizon_days": 5,
        "training_data_years": 5
      }
    },
    {
      "id": "WIPRO",
      "ticker": "WIPRO.NS",
      "display_name": "Wipro",
      "exchange": "NSE",
      "sector": "Technology",
      "enabled": true,
      "model": {
        "retrain_interval_days": 30,
        "prediction_horizon_days": 5,
        "training_data_years": 5
      }
    }
  ],

  "signal_processing": {
    "default_transform": "stft",
    "available_transforms": ["stft", "cwt", "hht"],
    "stft": {
      "window_length": 64,
      "hop_size": 16,
      "window_function": "hann",
      "n_fft": 128
    },
    "cwt": {
      "wavelet": "morl",
      "scales": 64
    }
  },

  "training": {
    "split": { "train": 0.70, "val": 0.15, "test": 0.15 },
    "epochs": 50,
    "batch_size": 32,
    "learning_rate": 0.001,
    "split_strategy": "time_based"
  },

  "retraining": {
    "enabled": true,
    "check_interval_hours": 6,
    "strategy": "scheduled",
    "drift_threshold_multiplier": 1.5,
    "notify_on_completion": true
  }
}
```

**To add more stocks:** Add a new entry to `stocks[]`. The entire pipeline updates automatically.
**To add more exchanges:** Add a new entry to `exchanges{}`. Suffix and market hours drive all downstream logic.

---

## 7. Folder Structure

```
finspectra/
│
├── stocks.json                               ← Single config. Controls everything.
├── README.md
├── PROGRESS.md                               ← Task tracking & session handoff
├── TASKS.md                                  ← Atomic task checklist
├── docker-compose.yml
│
├── backend/
│   ├── main.py                               # FastAPI app entry point
│   ├── config.py                             # Loads and validates stocks.json
│   ├── requirements.txt
│   │
│   ├── routes/                               # One file per API domain
│   │   ├── data.py                           # /data/*
│   │   ├── signal.py                         # /signal/*
│   │   ├── model.py                          # /model/*
│   │   ├── training.py                       # /training/*
│   │   ├── retraining.py                     # /retraining/*
│   │   ├── live.py                           # /live/* SSE streams
│   │   └── notebook.py                       # /notebook/* Colab generation
│   │
│   ├── data/                                 # Task 1: Data Preparation
│   │   ├── base_fetcher.py                   # Abstract interface
│   │   ├── fetchers/
│   │   │   ├── yfinance_fetcher.py
│   │   │   ├── angel_one_fetcher.py
│   │   │   └── polygon_fetcher.py
│   │   ├── aligners/
│   │   │   ├── daily_aligner.py              # Aligns to common trading calendar
│   │   │   └── quarterly_aligner.py          # Handles revenue/profit resampling
│   │   ├── normalizers/
│   │   │   ├── minmax_normalizer.py
│   │   │   └── zscore_normalizer.py
│   │   └── cache/
│   │       └── data_cache.py
│   │
│   ├── signal_processing/                    # Task 2: Signal Processing
│   │   ├── base_transform.py                 # Abstract interface
│   │   ├── transforms/
│   │   │   ├── stft_transform.py             # Short-Time Fourier Transform
│   │   │   ├── cwt_transform.py              # Continuous Wavelet Transform
│   │   │   └── hht_transform.py              # Hilbert-Huang Transform
│   │   ├── spectrogram_generator.py
│   │   └── fft_visualizer.py
│   │
│   ├── models/                               # Task 3: Model Development
│   │   ├── base_model.py
│   │   ├── per_stock_cnn.py
│   │   ├── unified_cnn.py
│   │   ├── unified_cnn_with_embeddings.py
│   │   ├── model_registry.py
│   │   └── model_store/
│   │       ├── per_stock/
│   │       ├── unified/
│   │       └── scalers/
│   │
│   ├── training/
│   │   ├── dataset_builder.py
│   │   ├── train_loop.py
│   │   ├── evaluator.py
│   │   └── notebook_generator.py             # Jinja2 → .ipynb from stocks.json
│   │
│   ├── retraining/
│   │   ├── scheduler.py                      # APScheduler
│   │   ├── drift_detector.py
│   │   ├── retrain_worker.py
│   │   └── retrain_log.json
│   │
│   └── notebooks/
│       ├── templates/
│       │   ├── per_stock_template.ipynb.j2
│       │   └── unified_template.ipynb.j2
│       └── generated/
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    │
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── stocks.json                       # Symlinked from root
        │
        ├── config/
        │   └── stocksConfig.ts               # Typed loader for stocks.json
        │
        ├── pages/
        │   ├── Dashboard.tsx                 # All stocks overview
        │   ├── StockDetail.tsx               # Per-stock deep dive (5 charts)
        │   ├── SignalAnalysis.tsx             # FFT, spectrogram, transform selector
        │   ├── ModelComparison.tsx            # Per-stock vs unified metrics
        │   ├── LiveTesting.tsx               # Real-time prediction overlay
        │   ├── HowItWorks.tsx                # Animated pipeline explainer
        │   └── Training.tsx                  # Training progress, retrain trigger
        │
        ├── components/
        │   ├── charts/
        │   │   ├── StockPriceChart.tsx        # Area chart, teal gradient
        │   │   ├── RevenueChart.tsx           # Quarterly bar chart
        │   │   ├── ProfitChart.tsx            # Quarterly bar chart, +/- colors
        │   │   ├── MarketIndexChart.tsx       # Line chart
        │   │   ├── USDINRChart.tsx            # Line chart
        │   │   ├── FrequencySpectrumChart.tsx # Amplitude vs frequency
        │   │   ├── SpectrogramHeatmap.tsx     # 2D heatmap (viridis)
        │   │   ├── PredictionOverlayChart.tsx # Predicted vs actual
        │   │   ├── LivePredictionChart.tsx    # Real-time overlay
        │   │   └── LossCurveChart.tsx         # Training loss
        │   │
        │   ├── visualizations/               # Animated explainer components
        │   │   ├── SlidingWindowAnim.tsx
        │   │   ├── STFTAnim.tsx
        │   │   ├── SpectrogramBuildAnim.tsx
        │   │   ├── CNNForwardPassAnim.tsx
        │   │   └── DataFlowAnim.tsx
        │   │
        │   ├── ui/
        │   │   ├── StockSelector.tsx
        │   │   ├── ExchangeBadge.tsx
        │   │   ├── MarketStatusBadge.tsx
        │   │   ├── MetricCard.tsx
        │   │   ├── ModelModeBadge.tsx
        │   │   └── ThemeToggle.tsx            # Light/dark switcher
        │   │
        │   └── layout/
        │       ├── Navbar.tsx
        │       └── Sidebar.tsx
        │
        ├── hooks/
        │   ├── useStockData.ts
        │   ├── useSpectrogram.ts
        │   ├── useLiveMarket.ts              # SSE hook
        │   ├── useMarketStatus.ts
        │   ├── usePrediction.ts
        │   └── useTheme.ts                   # Light/dark mode
        │
        ├── api/
        │   └── client.ts                     # Axios + typed API calls
        │
        └── types/
            └── index.ts
```

---

## 8. Backend — FastAPI

### 8.1 Entry Point (`main.py`)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import load_config
from routes import data, signal, model, training, retraining, live, notebook
from retraining.scheduler import start_retraining_scheduler

app = FastAPI(title="FinSpectra API", version="1.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

config = load_config("../stocks.json")
app.state.config = config

app.include_router(data.router,       prefix="/data")
app.include_router(signal.router,     prefix="/signal")
app.include_router(model.router,      prefix="/model")
app.include_router(training.router,   prefix="/training")
app.include_router(retraining.router, prefix="/retraining")
app.include_router(live.router,       prefix="/live")
app.include_router(notebook.router,   prefix="/notebook")

@app.on_event("startup")
async def startup():
    start_retraining_scheduler(config)

@app.get("/config")
def get_config():
    return config
```

### 8.2 Data Fetchers

**`BaseDataFetcher`** — interface all three providers implement:

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
import pandas as pd

@dataclass
class PricePoint:
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: int

@dataclass
class FundamentalsData:
    ticker: str
    quarterly_revenue: pd.DataFrame    # columns: quarter, value_crores
    quarterly_profit: pd.DataFrame     # columns: quarter, value_crores

class BaseDataFetcher(ABC):
    def __init__(self, stock_config: dict, app_config: dict):
        self.stock = stock_config
        self.config = app_config

    @abstractmethod
    def fetch_historical_ohlcv(self, years: int) -> pd.DataFrame:
        """Returns daily OHLCV DataFrame with DatetimeIndex."""
        pass

    @abstractmethod
    def fetch_fundamentals(self) -> FundamentalsData:
        """Returns quarterly revenue and profit."""
        pass

    @abstractmethod
    def fetch_market_index(self) -> pd.DataFrame:
        """Returns daily index values (Sensex/NIFTY/S&P per exchange config)."""
        pass

    @abstractmethod
    def fetch_currency_pair(self) -> pd.DataFrame:
        """Returns daily USD-INR rate."""
        pass

    @abstractmethod
    def get_latest_price(self) -> PricePoint:
        """Returns most recent available price point."""
        pass

    @abstractmethod
    def is_market_open(self) -> bool:
        """Timezone-aware check against exchange market hours."""
        pass

    @abstractmethod
    def start_live_stream(self, callback) -> None:
        """Starts real-time price stream. Calls callback(PricePoint) on each tick.
        For yfinance: polling every 15s. For Zerodha/AngelOne: WebSocket."""
        pass

    @abstractmethod
    def stop_live_stream(self) -> None:
        pass
```

**`YFinanceFetcher`** — fully implemented:

```python
import yfinance as yf
from .base_fetcher import BaseDataFetcher, PricePoint, FundamentalsData

class YFinanceFetcher(BaseDataFetcher):
    """
    Primary data provider. Uses yfinance for all data.
    Historical data: full accuracy.
    Live data: 15-minute delayed. Switch to ZerodhaFetcher or AngelOneFetcher
    for real-time by changing live_data_provider in stocks.json.
    """

    def fetch_historical_ohlcv(self, years: int) -> pd.DataFrame:
        ticker = yf.Ticker(self.stock["ticker"])
        df = ticker.history(period=f"{years}y")
        return df[["Open", "High", "Low", "Close", "Volume"]]

    def fetch_fundamentals(self) -> FundamentalsData:
        ticker = yf.Ticker(self.stock["ticker"])
        income = ticker.quarterly_income_stmt
        revenue = income.loc["Total Revenue"].T if "Total Revenue" in income.index else pd.DataFrame()
        profit  = income.loc["Gross Profit"].T  if "Gross Profit"  in income.index else pd.DataFrame()
        return FundamentalsData(
            ticker=self.stock["ticker"],
            quarterly_revenue=revenue,
            quarterly_profit=profit
        )

    def fetch_market_index(self) -> pd.DataFrame:
        exchange = self.stock["exchange"]
        index_ticker = self.config["exchanges"][exchange]["market_index_ticker"]
        return yf.Ticker(index_ticker).history(period="5y")[["Close"]]

    def fetch_currency_pair(self) -> pd.DataFrame:
        exchange = self.stock["exchange"]
        pair = self.config["exchanges"][exchange]["currency_pair"]
        return yf.Ticker(pair).history(period="5y")[["Close"]]

    def get_latest_price(self) -> PricePoint:
        df = yf.Ticker(self.stock["ticker"]).history(period="1d", interval="1m")
        if df.empty:
            df = yf.Ticker(self.stock["ticker"]).history(period="2d")
        row = df.iloc[-1]
        return PricePoint(
            timestamp=str(row.name),
            open=row["Open"], high=row["High"],
            low=row["Low"],  close=row["Close"], volume=int(row["Volume"])
        )

    def is_market_open(self) -> bool:
        from datetime import datetime
        import pytz
        exchange = self.stock["exchange"]
        tz_str = self.config["exchanges"][exchange]["market_hours"]["timezone"]
        open_t = self.config["exchanges"][exchange]["market_hours"]["open"]
        close_t = self.config["exchanges"][exchange]["market_hours"]["close"]
        tz = pytz.timezone(tz_str)
        now = datetime.now(tz)
        if now.weekday() >= 5:
            return False
        open_dt  = tz.localize(datetime.combine(now.date(), datetime.strptime(open_t,  "%H:%M").time()))
        close_dt = tz.localize(datetime.combine(now.date(), datetime.strptime(close_t, "%H:%M").time()))
        return open_dt <= now <= close_dt

    def start_live_stream(self, callback) -> None:
        # yfinance does not support WebSocket streaming.
        # This implementation polls get_latest_price() every 15 seconds.
        # For real-time streaming, use ZerodhaFetcher or AngelOneFetcher.
        import threading, time
        self._streaming = True
        def poll():
            while self._streaming:
                try:
                    callback(self.get_latest_price())
                except Exception as e:
                    print(f"[YFinanceFetcher] stream error: {e}")
                time.sleep(15)
        self._stream_thread = threading.Thread(target=poll, daemon=True)
        self._stream_thread.start()

    def stop_live_stream(self) -> None:
        self._streaming = False
```

**`ZerodhaFetcher`** — stubbed, ready to implement:

```python
from .base_fetcher import BaseDataFetcher, PricePoint, FundamentalsData

class ZerodhaFetcher(BaseDataFetcher):
    """
    Zerodha Kite API fetcher. Provides real-time WebSocket streaming.
    Docs: https://kite.trade/docs/connect/v3/

    TO ACTIVATE:
    1. Create a Zerodha Kite Connect app at https://developers.kite.trade
    2. Set environment variables:
       ZERODHA_API_KEY=your_api_key
       ZERODHA_ACCESS_TOKEN=your_access_token  (refreshed daily via login flow)
    3. Change live_data_provider to "zerodha" in stocks.json for NSE/BSE exchanges
    4. Install: pip install kiteconnect

    AUTH FLOW:
    - GET https://kite.trade/connect/login?api_key={api_key}&v=3
    - User logs in → redirected to redirect_url?request_token={token}
    - POST https://api.kite.trade/session/token  body: {api_key, request_token, checksum}
    - Returns access_token (valid for one trading day)

    INSTRUMENT TOKENS:
    - Each NSE ticker maps to a numeric instrument_token required for WebSocket subscription
    - GET https://api.kite.trade/instruments/NSE  → CSV with symbol → instrument_token mapping
    - Cache this mapping — it changes infrequently
    """

    def __init__(self, stock_config: dict, app_config: dict):
        super().__init__(stock_config, app_config)
        # TODO: initialize KiteConnect client
        # from kiteconnect import KiteConnect, KiteTicker
        # self.kite = KiteConnect(api_key=os.environ["ZERODHA_API_KEY"])
        # self.kite.set_access_token(os.environ["ZERODHA_ACCESS_TOKEN"])
        raise NotImplementedError(
            "ZerodhaFetcher requires ZERODHA_API_KEY and ZERODHA_ACCESS_TOKEN. "
            "See class docstring for setup instructions."
        )

    def fetch_historical_ohlcv(self, years: int):
        # GET https://api.kite.trade/instruments/historical/{instrument_token}/{interval}
        # interval: "day" for daily data
        # Returns: candles array with [date, open, high, low, close, volume]
        raise NotImplementedError

    def fetch_fundamentals(self):
        # Zerodha Kite does not provide fundamentals.
        # Fall back to YFinanceFetcher for this method.
        from .yfinance_fetcher import YFinanceFetcher
        return YFinanceFetcher(self.stock, self.config).fetch_fundamentals()

    def fetch_market_index(self):
        raise NotImplementedError

    def fetch_currency_pair(self):
        raise NotImplementedError

    def get_latest_price(self) -> PricePoint:
        # GET https://api.kite.trade/quote?i=NSE:{symbol}
        # Returns last_price, ohlc, volume
        raise NotImplementedError

    def is_market_open(self) -> bool:
        # Reuse the timezone logic from YFinanceFetcher — it's exchange-config based
        from .yfinance_fetcher import YFinanceFetcher
        return YFinanceFetcher(self.stock, self.config).is_market_open()

    def start_live_stream(self, callback) -> None:
        # KiteTicker WebSocket: wss://ws.kite.trade?api_key={key}&access_token={token}
        # Subscribe to instrument tokens for real-time tick data
        # ticker.on_ticks → callback(PricePoint) per tick
        raise NotImplementedError

    def stop_live_stream(self) -> None:
        raise NotImplementedError
```

**`AngelOneFetcher`** — stubbed, ready to implement:

```python
from .base_fetcher import BaseDataFetcher, PricePoint, FundamentalsData

class AngelOneFetcher(BaseDataFetcher):
    """
    Angel One SmartAPI fetcher. Provides real-time WebSocket streaming.
    Docs: https://smartapi.angelbroking.com/docs

    TO ACTIVATE:
    1. Create a SmartAPI app at https://smartapi.angelbroking.com
    2. Set environment variables:
       ANGEL_ONE_API_KEY=your_api_key
       ANGEL_ONE_CLIENT_ID=your_client_id
       ANGEL_ONE_PASSWORD=your_password
       ANGEL_ONE_TOTP_SECRET=your_totp_secret   (for 2FA)
    3. Change live_data_provider to "angel_one" in stocks.json for NSE/BSE exchanges
    4. Install: pip install smartapi-python pyotp

    AUTH FLOW:
    - POST https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword
      body: {clientcode, password, totp}
    - Returns jwtToken, refreshToken, feedToken
    - jwtToken used for REST APIs
    - feedToken used for WebSocket market data stream

    SYMBOL TOKENS:
    - Each NSE ticker maps to a symboltoken required for WebSocket subscription
    - GET https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json
    - Cache this mapping — large file, refresh weekly
    """

    def __init__(self, stock_config: dict, app_config: dict):
        super().__init__(stock_config, app_config)
        # TODO: initialize SmartConnect client
        # from SmartApi import SmartConnect
        # import pyotp
        # self.smart = SmartConnect(api_key=os.environ["ANGEL_ONE_API_KEY"])
        # totp = pyotp.TOTP(os.environ["ANGEL_ONE_TOTP_SECRET"]).now()
        # data = self.smart.generateSession(client_code, password, totp)
        # self.feed_token = data["data"]["feedToken"]
        raise NotImplementedError(
            "AngelOneFetcher requires ANGEL_ONE_API_KEY and credentials. "
            "See class docstring for setup instructions."
        )

    def fetch_historical_ohlcv(self, years: int):
        # POST https://apiconnect.angelbroking.com/rest/secure/angelbroking/historical/v1/getCandleData
        # body: {exchange, symboltoken, interval, fromdate, todate}
        # interval: "ONE_DAY" for daily
        raise NotImplementedError

    def fetch_fundamentals(self):
        # Angel One SmartAPI does not provide fundamentals.
        from .yfinance_fetcher import YFinanceFetcher
        return YFinanceFetcher(self.stock, self.config).fetch_fundamentals()

    def fetch_market_index(self):
        raise NotImplementedError

    def fetch_currency_pair(self):
        raise NotImplementedError

    def get_latest_price(self) -> PricePoint:
        # POST https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote/
        # body: {mode: "FULL", exchangeTokens: {NSE: [symboltoken]}}
        raise NotImplementedError

    def is_market_open(self) -> bool:
        from .yfinance_fetcher import YFinanceFetcher
        return YFinanceFetcher(self.stock, self.config).is_market_open()

    def start_live_stream(self, callback) -> None:
        # SmartWebSocketV2 WebSocket streaming
        # ws = SmartWebSocketV2(auth_token, api_key, client_code, feed_token)
        # ws.subscribe(correlation_id, mode=1, token_list=[{exchangeType: 1, tokens: [symboltoken]}])
        # ws.on_message → callback(PricePoint)
        raise NotImplementedError

    def stop_live_stream(self) -> None:
        raise NotImplementedError
```

**Fetcher Factory** — reads `live_data_provider` from stocks.json:

```python
def get_fetcher(stock_config: dict, app_config: dict) -> BaseDataFetcher:
    exchange = stock_config["exchange"]
    provider = app_config["exchanges"][exchange].get("live_data_provider", "yfinance")
    if provider == "zerodha":
        return ZerodhaFetcher(stock_config, app_config)
    elif provider == "angel_one":
        return AngelOneFetcher(stock_config, app_config)
    else:
        return YFinanceFetcher(stock_config, app_config)
```

```python
import json
from pathlib import Path

def load_config(path: str) -> dict:
    with open(Path(path)) as f:
        cfg = json.load(f)
    enabled = [s for s in cfg["stocks"] if s.get("enabled", True)]
    cfg["active_stocks"] = enabled
    cfg["active_tickers"] = [s["ticker"] for s in enabled]
    cfg["stock_ids"] = [s["id"] for s in enabled]
    return cfg
```

### 8.3 Live SSE Route (`routes/live.py`)

```python
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
import asyncio, json

router = APIRouter()

@router.get("/stream/{stock_id}")
async def live_price_stream(stock_id: str, request: Request):
    """SSE stream: live price + model prediction every 15 seconds."""
    cfg = request.app.state.config
    stock = next(s for s in cfg["stocks"] if s["id"] == stock_id)

    async def event_generator():
        fetcher = get_fetcher(stock, cfg)
        while True:
            if await request.is_disconnected():
                break
            price = fetcher.get_latest_price()
            prediction = get_current_prediction(stock_id, cfg)
            payload = json.dumps({
                "timestamp": price["timestamp"],
                "actual": price["close"],
                "predicted": prediction,
                "market_open": fetcher.is_market_open()
            })
            yield f"data: {payload}\n\n"
            await asyncio.sleep(15)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/market-status/{exchange}")
async def market_status(exchange: str, request: Request):
    cfg = request.app.state.config
    exchange_cfg = cfg["exchanges"][exchange.upper()]
    # Check current time vs market hours in exchange timezone
    ...
```

---

## 9. Signal Processing Modules

Each transform is in its own file and inherits from `BaseTransform`. Swap transforms by changing `default_transform` in `stocks.json`.

### 9.1 Base Class

```python
from abc import ABC, abstractmethod
import numpy as np

class BaseTransform(ABC):
    def __init__(self, config: dict):
        self.config = config

    @abstractmethod
    def transform(self, signal: np.ndarray) -> tuple:
        """Returns (spectrogram_2d, freq_axis, time_axis)"""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass
```

### 9.2 STFT Transform

```python
from scipy.signal import stft
from ..base_transform import BaseTransform

class STFTTransform(BaseTransform):
    name = "stft"

    def transform(self, signal):
        cfg = self.config["signal_processing"]["stft"]
        f, t, Zxx = stft(signal,
                         nperseg=cfg["window_length"],
                         noverlap=cfg["window_length"] - cfg["hop_size"],
                         nfft=cfg["n_fft"])
        return np.abs(Zxx) ** 2, f, t   # S(t,f) = |STFT|²
```

### 9.3 Transform Registry

```python
TRANSFORM_REGISTRY = {
    "stft": STFTTransform,
    "cwt":  CWTTransform,
    "hht":  HHTTransform,
}

def get_transform(name: str, config: dict) -> BaseTransform:
    if name not in TRANSFORM_REGISTRY:
        raise ValueError(f"Unknown transform '{name}'")
    return TRANSFORM_REGISTRY[name](config)
```

---

## 10. CNN Model Variants

### 10.1 Per-Stock CNN

```python
class PerStockCNN(nn.Module):
    def __init__(self, in_channels=1):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(in_channels, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.AdaptiveAvgPool2d((4,4))
        )
        self.regressor = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64*4*4, 128), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(128, 1)
        )

    def forward(self, x):
        return self.regressor(self.features(x))
```

### 10.2 Unified CNN with Stock Embeddings (Recommended)

```python
class UnifiedCNNWithEmbeddings(nn.Module):
    """
    Production-grade approach. Each stock gets a learned identity vector
    concatenated with CNN features before prediction. This is how real
    FinTech ML systems handle multi-asset prediction.
    """
    def __init__(self, num_stocks: int, embedding_dim: int = 8):
        super().__init__()
        self.stock_embedding = nn.Embedding(num_stocks, embedding_dim)
        self.features = nn.Sequential(
            nn.Conv2d(1, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.AdaptiveAvgPool2d((4,4))
        )
        self.regressor = nn.Sequential(
            nn.Linear(64*4*4 + embedding_dim, 128),
            nn.ReLU(), nn.Dropout(0.3), nn.Linear(128, 1)
        )

    def forward(self, x, stock_id):
        cnn_out = self.features(x).flatten(1)
        emb = self.stock_embedding(stock_id)
        return self.regressor(torch.cat([cnn_out, emb], dim=1))
```

---

## 11. Training Pipeline & Colab Notebooks

### 11.1 What Gets Trained in Colab

One CNN model (or all three variants if `model_mode: "both"`), trained on (spectrogram → future price) pairs derived from historical OHLCV data.

**Colab training checklist:**
1. `pip install yfinance torch scipy matplotlib scikit-learn`
2. Load `stocks.json`
3. Fetch historical data for all active stocks
4. Normalize (MinMax per stock)
5. Apply STFT sliding window → generate spectrograms
6. Build `(spectrogram, label)` dataset with **time-based split** (no leakage)
7. Train CNN(s) for configured epochs
8. Plot loss curve, predictions vs actual on test set
9. Save `model.pth` + `scaler.pkl` → download

### 11.2 Dynamic Notebook Generation

Notebooks are Jinja2-templated from `stocks.json`. Every time stocks change, regenerate:

```bash
# Via API
GET /notebook/generate?mode=per_stock
GET /notebook/generate?mode=unified

# Via CLI
python -m training.notebook_generator --config ../stocks.json --mode both
```

Output → `backend/notebooks/generated/`

### 11.3 Export Files

| File | Purpose |
|------|---------|
| `{STOCK_ID}_model.pth` | Per-stock CNN weights |
| `unified_model.pth` | Unified CNN weights |
| `{STOCK_ID}_scaler.pkl` | MinMax scaler for denormalization |
| `training_report.json` | MSE, loss curves, metadata |

---

## 12. Periodic Retraining System

Financial models degrade over time due to **concept drift** — market regimes change, making patterns learned from older data less predictive.

### 12.1 Scheduler (`retraining/scheduler.py`)

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from .drift_detector import DriftDetector
from .retrain_worker import RetrainWorker

def start_retraining_scheduler(config: dict):
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_retraining_check,
        "interval",
        hours=config["retraining"]["check_interval_hours"],
        args=[config]
    )
    scheduler.start()

async def run_retraining_check(config: dict):
    for stock in config["active_stocks"]:
        worker = RetrainWorker(stock, config)
        detector = DriftDetector(stock["id"], config)
        if worker.is_retrain_due() or detector.check():
            reason = "scheduled" if worker.is_retrain_due() else "drift_detected"
            await worker.retrain(reason=reason)
```

### 12.2 Drift Detection

```python
class DriftDetector:
    """Alerts when rolling MSE exceeds 1.5x baseline MSE over last 14 days."""

    def check(self) -> bool:
        baseline = self._load_baseline_mse()
        recent = self._compute_recent_mse(window_days=14)
        threshold = self.config["retraining"]["drift_threshold_multiplier"]
        return recent > baseline * threshold
```

### 12.3 Retraining Log

All events persisted to `retrain_log.json`:
```json
{
  "retrain_history": [
    {
      "stock_id": "RELIANCE",
      "timestamp": "2025-03-01T02:00:00Z",
      "reason": "scheduled",
      "previous_mse": 0.0042,
      "new_mse": 0.0031,
      "duration_seconds": 312,
      "status": "success"
    }
  ]
}
```

### 12.4 Manual Retraining API

```
POST /retraining/trigger/{stock_id}
POST /retraining/trigger-all
GET  /retraining/status
GET  /retraining/logs
```

---

## 13. Frontend — React + TypeScript

### 13.1 Tab Structure (SPA with React Router)

| Tab | Route | Description |
|-----|-------|-------------|
| Dashboard | `/` | All stocks overview, market status badges |
| Stock Detail | `/stock/:id` | All 5 signal charts aligned on one page |
| Signal Analysis | `/signal/:id` | FFT, spectrogram, transform selector |
| Model Comparison | `/compare` | Per-stock vs unified — MSE, radar charts |
| Live Testing | `/live` | Real-time prediction vs live intraday price |
| How It Works | `/explainer` | Animated step-by-step pipeline walkthrough |
| Training | `/training` | Trigger training, loss curve, retrain history |

### 13.2 Config-Driven Rendering

```typescript
// frontend/src/config/stocksConfig.ts
import stocksJson from '../stocks.json';

export const activeStocks = stocksJson.stocks.filter(s => s.enabled);
export const getStockById = (id: string) =>
  activeStocks.find(s => s.id === id);
```

Adding a stock to `stocks.json` automatically adds it to every dropdown, chart, API call, and route in the app.

### 13.3 Live Market Hook

```typescript
export function useLiveMarket(stockId: string) {
  const [data, setData] = useState<LiveDataPoint[]>([]);
  const [isMarketOpen, setIsMarketOpen] = useState(false);

  useEffect(() => {
    const es = new EventSource(`/live/stream/${stockId}`);
    es.onmessage = (e) => {
      const point = JSON.parse(e.data);
      setIsMarketOpen(point.market_open);
      setData(prev => [...prev.slice(-200), point]);
    };
    return () => es.close();
  }, [stockId]);

  return { data, isMarketOpen };
}
```

---

## 14. Live Testing & Real-Time Prediction

**When market is OPEN:**
- Intraday candlestick/line chart updated every 15 seconds
- Dashed teal prediction line overlaid
- Shaded confidence band around prediction
- Live metrics panel: rolling MSE, RMSE, directional accuracy, MAPE
- Last 10 prediction vs actual data points table

**When market is CLOSED:**
- Most recent trading day's chart with prediction overlay
- Countdown timer to next market open
- Historical backtesting summary

---

## 15. Visualization Tab — How It Works

Six animated panels with connecting data flow arrows. Each panel shows a stage of the pipeline using actual stock data.

| Panel | What's animated |
|-------|----------------|
| 1. Raw Signal | Price chart with pulsing highlight on current window |
| 2. Sliding Window | Window slides across signal, pausing at each segment |
| 3. STFT Computation | Frequency bars rise/fall as FFT is computed |
| 4. Spectrogram Build | 2D heatmap builds column by column |
| 5. CNN Forward Pass | Feature maps light up through convolutional layers |
| 6. Prediction Output | Final price value emerges with confidence band |

Controls: Play / Pause / Step / Speed slider / Step indicator dots.

Built with **Framer Motion** + **D3.js**. Users can pause and step through frame by frame.

---

## 16. Required Figures & Charts

### From the Assignment

| Figure | Component |
|--------|-----------|
| Time series plot (price vs time) | `StockPriceChart.tsx` |
| Frequency spectrum | `FrequencySpectrumChart.tsx` |
| Spectrogram (2D heatmap) | `SpectrogramHeatmap.tsx` |
| CNN architecture diagram | `CNNForwardPassAnim.tsx` |

### Additional Figures

| Figure | Component |
|--------|-----------|
| Revenue vs quarter | `RevenueChart.tsx` |
| Profit vs quarter | `ProfitChart.tsx` |
| Market index vs time | `MarketIndexChart.tsx` |
| USD–INR exchange rate vs time | `USDINRChart.tsx` |
| Prediction vs actual (backtest) | `PredictionOverlayChart.tsx` |
| Live prediction vs actual | `LivePredictionChart.tsx` |
| Training loss curve | `LossCurveChart.tsx` |
| Per-stock vs unified MSE comparison | `ModelComparisonChart.tsx` |
| Sliding window animation | `SlidingWindowAnim.tsx` |
| STFT frame-by-frame | `STFTAnim.tsx` |
| Spectrogram build animation | `SpectrogramBuildAnim.tsx` |
| CNN data flow animation | `CNNForwardPassAnim.tsx` |
| Retraining history timeline | `RetrainingTimeline.tsx` |
| Rolling MSE drift chart | `DriftChart.tsx` |
| Stock embedding t-SNE plot | `EmbeddingPlot.tsx` |

---

## 17. Light / Dark Mode

Both modes use identical layout, spacing, and component shapes. Switched via a pill toggle in the top-right navbar. All color transitions are 200ms.

| Token | Dark Mode | Light Mode |
|-------|-----------|------------|
| Background primary | `#0F1117` | `#F5F6FA` |
| Background secondary | `#1A1D2E` | `#FFFFFF` |
| Card background | `#1E2235` | `#FFFFFF` |
| Border | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.08)` |
| Text primary | `#F0F2F5` | `#0F1117` |
| Text secondary | `#8B90A7` | `#5A6072` |
| Accent teal | `#00D4AA` | `#00A885` |
| Accent amber | `#F5A623` | `#D4860A` |

Default: **dark mode**.

Implemented via Tailwind `dark:` class strategy with a `ThemeProvider` context wrapping the app.

---

## 18. API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/config` | Full stocks.json |
| `GET` | `/data/fetch/{stock_id}` | Fetch historical OHLCV + fundamentals |
| `GET` | `/data/fetch-all` | Fetch all active stocks |
| `GET` | `/data/market-data/{stock_id}` | All 5 aligned signal tracks |
| `GET` | `/signal/fft/{stock_id}` | Frequency spectrum |
| `GET` | `/signal/spectrogram/{stock_id}` | Spectrogram PNG |
| `GET` | `/signal/spectrogram/{stock_id}?transform=cwt` | Alternate transform |
| `GET` | `/signal/stft-frames/{stock_id}` | Frame-by-frame data for animation |
| `POST` | `/model/predict/{stock_id}` | Single prediction from spectrogram |
| `GET` | `/model/compare/{stock_id}` | Per-stock vs unified metrics |
| `GET` | `/model/backtest/{stock_id}` | Historical prediction vs actual |
| `POST` | `/training/start` | Trigger training for all stocks |
| `GET` | `/training/progress` | SSE stream of per-epoch loss |
| `GET` | `/training/report` | Final metrics and plots |
| `GET` | `/retraining/status` | Current retraining job status |
| `POST` | `/retraining/trigger/{stock_id}` | Force retrain |
| `GET` | `/retraining/logs` | Retraining history |
| `GET` | `/live/stream/{stock_id}` | SSE: live price + prediction |
| `GET` | `/live/market-status/{exchange}` | Is exchange open? |
| `GET` | `/notebook/generate` | Generate Colab notebooks from config |

---

## 19. Assignment Tasks Mapping

| Task | Requirement | Implementation |
|------|------------|----------------|
| **Task 1** | Collect 3+ companies, align, normalize | `backend/data/` — 5 companies configured, daily + quarterly aligners, pluggable normalizers |
| **Task 2** | Fourier Transform, spectrograms, visualize | `backend/signal_processing/` — FFT, STFT, CWT, HHT, all visualized in Signal Analysis tab |
| **Task 3** | CNN model, train, predict | `backend/models/` + Colab notebooks — per-stock and unified variants |
| **Task 4** | Compare predictions, MSE, feature analysis | `backend/training/evaluator.py` — MSE, RMSE, MAPE, directional accuracy; Model Comparison tab |

**Required figures coverage:** All 4 required figures present plus 11 additional visualizations.

---

## 20. Analysis & Evaluation

### Metrics

| Metric | Description |
|--------|-------------|
| MSE | Mean Squared Error — primary assignment metric |
| RMSE | Same units as price — more interpretable |
| MAE | Average absolute error |
| MAPE | Percentage error |
| Directional Accuracy | % correct on direction (up/down) — most practically relevant |

### Per-Stock vs Unified Findings (Expected)

The per-stock model typically achieves lower MSE on its own ticker but overfits. The unified model with embeddings achieves competitive MSE while learning generalizable patterns across stocks. The embedding space can be visualized with t-SNE — stocks in the same sector cluster together, demonstrating that the model learns meaningful financial relationships.

### Concept Drift

Financial time series exhibit concept drift — learned patterns become less predictive as market conditions evolve. This implementation addresses it through configurable periodic retraining, automatic drift detection based on rolling MSE degradation, and a full audit log. In production this is the difference between a model that works at deployment and one that works at deployment and six months later.

### STFT Parameter Effects

| Change | Effect |
|--------|--------|
| Larger window L | Better frequency resolution, slower trend capture |
| Smaller window L | Better time resolution, captures abrupt changes |
| Smaller hop H | More spectrogram columns, larger training set |
| CWT vs STFT | Better time-frequency tiling for sudden market events |

---

## 21. References

1. Y. Zhang and C. Aggarwal, "Stock Market Prediction Using Deep Learning," *IEEE Access*
2. A. Tsantekidis et al., "Deep Learning for Financial Time Series Forecasting"
3. S. Hochreiter and J. Schmidhuber, "Long Short-Term Memory," *Neural Computation*, 1997
4. A. Borovykh et al., "Conditional Time Series Forecasting with CNNs"
5. FastAPI Documentation — https://fastapi.tiangolo.com
6. PyTorch Documentation — https://pytorch.org/docs
7. SciPy Signal — https://docs.scipy.org/doc/scipy/reference/signal.html
8. Zerodha Kite API — https://kite.trade/docs/connect/v3/
9. Angel One SmartAPI — https://smartapi.angelbroking.com

---

*FinSpectra v1.1 — Design assets to be integrated separately.*
*Market Nerves integration deferred to Phase 2.*
