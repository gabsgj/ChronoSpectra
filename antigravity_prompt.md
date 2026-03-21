# FinSpectra — Final Antigravity Development Prompt
# Upload alongside finspectra_spec.md into Antigravity (Opus 4.6)
# Primary design inspiration: TradingView

---

You are the lead engineer for **FinSpectra** — a professional financial time series forecasting platform that uses signal processing and deep learning to predict stock prices. You have been provided with `finspectra_spec.md`. Read it fully before doing anything.

---

## BEFORE ANY CODE — PROJECT SETUP

@planning-with-files

Read `finspectra_spec.md` completely. Then create these files at the project root:

**`TASKS.md`** — The living task tracker for the entire project. This file is updated continuously throughout development. Format:
```markdown
# FinSpectra — Task Tracker
Last updated: [date] | Session: [N]

## Legend
✅ Done | 🔄 In Progress | ⏳ Pending | ❌ Blocked

## Phase 1: Scaffolding
- ✅ Monorepo structure created
- 🔄 docker-compose.yml — backend done, frontend pending
- ⏳ .env root file

## Phase 2: Data Layer
...and so on for all phases
```

Update this file after completing every single task — not just phases.

**`PROGRESS.md`** — Session handoff log. Updated at END of every session:
```markdown
## Session N — [date]

**Completed this session:** [list]
**Left in progress:** [task — exact state, which function, what's missing]
**Next session starts with:** [first command to run, first file to open]
**Decisions made:** [architectural decisions not in the spec]
**Gotchas discovered:** [anything that will bite the next session]
```

**`README.md`** — See documentation-templates skill below.

**`.env`** — Single shared env file at project root, symlinked or copied into backend/ and frontend/. Contains:
```env
# Server
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
VITE_BACKEND_URL=http://localhost:8000

# Data Providers (fill in to activate)
ZERODHA_API_KEY=
ZERODHA_ACCESS_TOKEN=
ANGEL_ONE_API_KEY=
ANGEL_ONE_CLIENT_ID=
ANGEL_ONE_PASSWORD=
ANGEL_ONE_TOTP_SECRET=

# App
APP_ENV=development
LOG_LEVEL=INFO
```

The frontend reads `VITE_BACKEND_URL` (Vite exposes only `VITE_` prefixed vars). The backend reads `BACKEND_URL`, data provider keys, and `APP_ENV`.

**`ARCHITECTURE.md`** — Document key design decisions before Phase 1 begins.

@documentation-templates

Structure the README to cover: what FinSpectra is, full tech stack, local dev setup (docker-compose up), how to add stocks to stocks.json, the Colab training workflow, the local training workflow, how to trigger retraining, how to activate Zerodha/AngelOne, assignment tasks mapping.

---

## STOCKS.JSON — FULL UPDATED SCHEMA

The config file now includes two new top-level flags and a revised training section:

```json
{
  "app_name": "FinSpectra",
  "version": "1.2.0",
  "model_mode": "both",

  "local_training": {
    "enabled": false,
    "auto_place_models": true,
    "_note": "When enabled, FastAPI trains models locally using the training pipeline instead of Colab. Set enabled:true offline to regenerate models, then set false before deploying to production."
  },

  "retrain_on_startup": {
    "enabled": false,
    "_note": "When true, FastAPI retrains all stale/missing models on startup. Use offline only. Always set false before pushing to production."
  },

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
      "_live_note": "yfinance=15min delayed. Switch to zerodha or angel_one for real-time."
    }
  },

  "stocks": [
    {
      "id": "RELIANCE",
      "ticker": "RELIANCE.NS",
      "display_name": "Reliance Industries",
      "exchange": "NSE",
      "sector": "Energy",
      "color": "#00D4AA",
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
    "stft": { "window_length": 64, "hop_size": 16, "window_function": "hann", "n_fft": 128 }
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
    "drift_threshold_multiplier": 1.5
  }
}
```

Each stock has a `color` field — a unique hex color used consistently across all charts for that stock. All 5 stocks must have distinct, visually separable colors on dark backgrounds.

---

## TRAINING WORKFLOW — HOW IT WORKS (READ THIS CAREFULLY)

There are three training modes. The app supports all three via config:

### Mode 1 — Colab (default, for production)
1. User calls `GET /notebook/generate?mode=per_stock` or `?mode=unified`
2. Backend renders a Jinja2 template into a complete `.ipynb` file using current `stocks.json`
3. User downloads the `.ipynb` and uploads it to Google Colab
4. User runs all cells — model trains, evaluates, saves `model.pth` + `scaler.pkl` to Google Drive
5. User downloads those files and manually places them in `backend/models/model_store/`
6. `retrain_on_startup: false`, `local_training.enabled: false`

### Mode 2 — Local Training (offline use)
1. Set `local_training.enabled: true` in stocks.json
2. Restart FastAPI (or call `POST /training/start`)
3. Backend runs the full training pipeline internally
4. With `auto_place_models: true`, trained `.pth` and `.pkl` files are automatically placed in `model_store/`
5. Set `local_training.enabled: false` before deploying

### Mode 3 — Retrain on Startup (offline model refresh)
1. Set `retrain_on_startup.enabled: true`
2. Restart FastAPI
3. On startup, all stale models (older than `retrain_interval_days`) are retrained locally
4. Models auto-placed in `model_store/`
5. Set `retrain_on_startup.enabled: false` → push to production with fresh models

The backend's `startup` event handler must check both flags and act accordingly. This is the primary workflow for keeping production models fresh without a live training server.

---

## HOW THE CNN LEARNS FROM SPECTROGRAMS (IMPLEMENT THIS IN THE HOW IT WORKS PAGE)

This is the conceptual core of the app. Every visualization must make this intuitive.

**The signal processing chain:**
1. Stock price series X(t) — a 1D time series of daily closing prices
2. Sliding window extracts short overlapping segments: each window is L=64 days of prices
3. FFT computed on each window → frequency spectrum showing which oscillation periods dominate
4. Spectrogram S(t,f) = stacking all FFT outputs → a 2D image where brightness = energy of frequency f at time t

**What the frequencies mean:**
- Low frequency (slow oscillations) = long-term trend (bull/bear market cycle lasting months)
- Mid frequency = medium-term cycle (weekly/monthly patterns, earnings cycles)
- High frequency (fast oscillations) = short-term noise (daily volatility, news reactions)

**What the CNN learns:**
The CNN is trained on thousands of (spectrogram → future_price) pairs. Its convolutional filters learn spatial patterns in the 2D spectrogram image — patterns that precede price movements. For example:
- A diagonal band of energy sweeping from low to high frequency = a momentum shift → CNN learns this often precedes a breakout
- Sustained brightness at low frequency + sudden spike at mid frequency = trend + catalyst → CNN learns this pattern
- Chaotic high-frequency dominance = unpredictable market regime → CNN learns low-confidence output

The CNN does NOT "know" what stocks are. It purely learns visual patterns in a 2D heatmap that happen to correspond to future price movements.

**Training algorithm:**
- Loss: MSE (mean squared error between predicted price and actual price 5 days later)
- Optimizer: Adam (adaptive learning rate, handles different gradient magnitudes per frequency band)
- Architecture: Conv2d → ReLU → MaxPool (×3) → AdaptiveAvgPool → Flatten → Linear → ReLU → Dropout → Linear → scalar
- The unified model concatenates a stock embedding vector with CNN features so one model handles all stocks

This explanation must be animated beautifully on the How It Works page.

---

## DESIGN SYSTEM — TRADINGVIEW-INSPIRED PROFESSIONAL UI

@ui-ux-pro-max

Apply this skill for the entire frontend. The design must be professional, data-dense, and instantly recognizable as a financial platform. Primary inspiration: TradingView. Secondary: Linear.app for spacing and typography precision.

### Typography

TradingView uses a specific typographic hierarchy. Match it:
- **Primary font:** `"Inter"` (import from Google Fonts) — the standard for financial dashboards
- **Monospace font:** `"JetBrains Mono"` or `"IBM Plex Mono"` — for ALL price values, percentages, metric numbers, timestamps
- **Font sizes:** 11px (micro labels), 12px (secondary), 13px (body), 14px (emphasis), 16px (section titles), 20px (page titles), 28px (hero metrics)
- **Font weights:** 400 regular, 500 medium, 600 semibold — never 700 or 800 (too heavy for financial UI)
- **Letter spacing:** -0.02em on headings, 0.02em on uppercase labels, 0.05em on CAPS badges

### Color System (implement as CSS custom properties)

```css
/* Dark mode (default) */
--color-bg-primary:    #0B0E11;   /* deepest black - main canvas */
--color-bg-secondary:  #131722;   /* TradingView's exact dark bg */
--color-bg-card:       #1E222D;   /* card/panel bg */
--color-bg-elevated:   #2A2E39;   /* hover states, tooltips */
--color-border:        rgba(255,255,255,0.06);
--color-border-strong: rgba(255,255,255,0.12);

--color-text-primary:   #D1D4DC;  /* TradingView's exact text color */
--color-text-secondary: #787B86;
--color-text-muted:     #4A4E5A;

--color-green:   #26A69A;  /* TradingView green - price up */
--color-red:     #EF5350;  /* TradingView red - price down */
--color-teal:    #00BCD4;  /* accent */
--color-amber:   #FF9800;  /* warning/quarterly */
--color-purple:  #7C4DFF;  /* model/AI accent */
--color-blue:    #2962FF;  /* info/index */

/* Light mode */
--color-bg-primary:    #FFFFFF;
--color-bg-secondary:  #F0F3FA;
--color-bg-card:       #FFFFFF;
--color-bg-elevated:   #E8ECF5;
--color-border:        rgba(0,0,0,0.08);
--color-border-strong: rgba(0,0,0,0.15);

--color-text-primary:   #131722;
--color-text-secondary: #787B86;
--color-text-muted:     #B2B5BE;

--color-green:   #26A69A;
--color-red:     #EF5350;
```

### Chart Design Standards (ALL charts — non-negotiable)

Every chart in the app must look like a real financial chart:

**Background:** `--color-bg-secondary` (#131722 dark / #F0F3FA light)
**Grid lines:** Horizontal only, `rgba(255,255,255,0.04)` dark / `rgba(0,0,0,0.04)` light — extremely subtle
**Axes:** No axis lines (just tick labels). Ticks in `--color-text-muted`. Right-side Y axis (TradingView style)
**Candlestick up color:** `#26A69A` (teal-green). Down color: `#EF5350` (red). ALWAYS these exact colors.
**Line charts:** 1.5px stroke weight. Slight glow effect on hover.
**Area charts:** Line + gradient fill, fill stops at 30% opacity at top, 0% at bottom
**Volume bars:** Bottom of chart, 25% of total chart height, same green/red coloring
**Crosshair:** Vertical dashed line at `rgba(255,255,255,0.3)` following cursor. Horizontal dashed line too.
**Tooltip:** Dark card `#1E222D` with 1px border, shows OHLCV values in monospace, date at top
**No chart titles inside the chart area** — use labels above the chart component
**Rounded corners:** `border-radius: 4px` on chart container only

### Layout

Fixed left sidebar: 52px collapsed (icons only) / 200px expanded (icons + labels). Toggle on hover.
Top navbar: 48px height. Logo left, stock selector center, theme toggle + market status right.
Content area fills remaining space with 16px padding.
All cards: `border-radius: 8px`, `border: 1px solid var(--color-border)`, no drop shadows.
Section spacing: 24px between sections, 16px between cards in a grid.

### Icons

Use `lucide-react` — the icon set used by TradingView and Linear. Install: `npm install lucide-react`. Key icons:
- Sidebar: LayoutDashboard, BarChart2, Activity, GitCompare, Radio, HelpCircle, Cpu
- Market: TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight
- Actions: Play, Pause, SkipBack, SkipForward, Download, RefreshCw, Settings
- Status: CheckCircle2, AlertCircle, Clock, Wifi, WifiOff

---

## CHART IMPLEMENTATIONS — REAL FINANCIAL CHARTS

@frontend-design
@d3-viz

Every chart must look and feel like a real trading terminal chart. Use `lightweight-charts` (TradingView's open-source charting library) for all OHLCV/candlestick/line price charts. Use D3.js for spectrograms, radar charts, embeddings. Use Recharts only for non-financial bar/metric charts where TradingView style is less critical.

Install: `npm install lightweight-charts`

### StockPriceChart (primary — used on Dashboard and Stock Detail)

Use `lightweight-charts` `CandlestickSeries` + `HistogramSeries` (volume). This produces the exact TradingView look.

```typescript
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

// Chart layout
const chart = createChart(containerRef.current, {
  layout: {
    background: { type: ColorType.Solid, color: '#131722' },
    textColor: '#787B86',
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
  },
  grid: {
    vertLines: { visible: false },
    horzLines: { color: 'rgba(255,255,255,0.04)' },
  },
  rightPriceScale: { borderVisible: false },
  timeScale: { borderVisible: false, timeVisible: true },
  crosshair: {
    vertLine: { color: 'rgba(255,255,255,0.3)', width: 1, style: 3 },
    horzLine: { color: 'rgba(255,255,255,0.3)', width: 1, style: 3 },
  },
});

const candleSeries = chart.addCandlestickSeries({
  upColor: '#26A69A', downColor: '#EF5350',
  borderUpColor: '#26A69A', borderDownColor: '#EF5350',
  wickUpColor: '#26A69A', wickDownColor: '#EF5350',
});

// Volume bars at bottom
const volumeSeries = chart.addHistogramSeries({
  color: '#26A69A',
  priceFormat: { type: 'volume' },
  priceScaleId: 'volume',
  scaleMargins: { top: 0.8, bottom: 0 },
});
```

Add a **prediction overlay line** using `LineSeries` in `#7C4DFF` (purple) with `lineStyle: 2` (dashed). This shows the model's predicted price trajectory overlaid on the candlestick chart.

Add a **confidence band** using two `AreaSeries` (upper and lower bound) with `topColor: 'rgba(124,77,255,0.1)'` and `bottomColor: 'rgba(124,77,255,0)'` — creating a subtle purple band around the prediction.

### LivePredictionChart (Live Testing page)

Same `lightweight-charts` setup. Real-time updates via `series.update({ time, value })` — lightweight-charts supports streaming updates efficiently. Add:
- A vertical `PriceLine` at the model's current prediction level
- A colored area between prediction and actual to show the gap
- A small "live" indicator dot that pulses (CSS animation) when market is open

### MarketIndexChart

`lightweight-charts` `AreaSeries`. Blue (`#2962FF`) line with 15% opacity fill below.

### USDINRChart

`lightweight-charts` `AreaSeries`. Amber (`#FF9800`) line with 15% opacity fill.

### RevenueChart and ProfitChart

These are quarterly, NOT financial price charts. Use Recharts `BarChart` styled to match the design system:
- Bar fill: `#2962FF` for revenue, dynamic `#26A69A` / `#EF5350` for profit +/-
- Background: `#131722` matching chart bg
- No chart border, subtle grid lines, right-aligned Y axis ticks in monospace

### SpectrogramHeatmap

D3.js. Viridis color scale. Interactively hoverable. Axes formatted to show dates on X, frequency in Hz on Y. Color scale legend bar on right. Match the dark chart background (#131722).

### FrequencySpectrumChart

Recharts `BarChart` with gradient fills — bars go from teal (low frequency, left) to red (high frequency, right) using a gradient definition. Three vertical reference lines dividing zones with labeled annotations.

### LossCurveChart

Recharts `LineChart` with two lines: training loss (teal) and validation loss (amber). Smooth Bezier curve (`type="monotone"`). Fills under each line with matching low-opacity gradient.

### ModelComparisonChart

Recharts grouped `BarChart`. Per-stock bars in teal, unified bars in purple. Custom rounded bar shape component.

### DriftChart

Recharts `LineChart`. One line per stock using each stock's configured `color` from stocks.json. Red dashed `ReferenceLine` at threshold. `ReferenceArea` fills `rgba(239,83,80,0.08)` (subtle red tint) when lines are above threshold.

### MiniSparkline (used in metric cards)

`lightweight-charts` `AreaSeries` in a tiny 80×32px container. No axes, no crosshair, no tooltip. Just the shape of the price movement. Green if price went up, red if down.

---

## PHASE-BY-PHASE IMPLEMENTATION

### Phase 1 — Scaffolding

@senior-architect

Document in `ARCHITECTURE.md` before coding. Then scaffold:
- Monorepo: `backend/` and `frontend/` under root
- `.env` at root with all variables listed above
- `backend/.env` → symlink or copy of root `.env`
- `frontend/.env` → symlink or copy (Vite reads `VITE_` vars)
- `docker-compose.yml` — backend port 8000, frontend port 5173, hot reload both
- All FastAPI route stubs returning `{"status": "not_implemented"}`
- Vite + React + TypeScript + Tailwind + React Router v6

Install all frontend dependencies upfront:
```bash
npm install lightweight-charts recharts d3 framer-motion lucide-react react-router-dom axios
npm install -D @types/d3 tailwindcss autoprefixer postcss
```

@tailwind-patterns

CSS-first Tailwind v4 config. Define ALL color tokens from the design system above as CSS custom properties in `globals.css`. Dark mode via `darkMode: 'class'`. Components use `var(--color-*)` tokens, never raw hex.

@verification-before-completion

`docker-compose up` → backend `/health` returns ok, frontend loads, CORS headers present. Check TASKS.md is updated.

---

### Phase 2 — Data Layer

@software-architecture
@python-patterns

`BaseDataFetcher` interface (8 methods). Full `YFinanceFetcher` implementation. `ZerodhaFetcher` and `AngelOneFetcher` properly stubbed with complete API documentation in docstrings — endpoints, auth flows, env var names, WebSocket subscription patterns. `get_fetcher()` factory reads `live_data_provider` from exchange config.

`DailyAligner`, `QuarterlyAligner`, `MinMaxNormalizer`, `DataCache` (parquet-based, invalidates if config changes).

The startup handler must check `local_training.enabled` and `retrain_on_startup.enabled` flags from stocks.json:
```python
@app.on_event("startup")
async def startup():
    config = app.state.config
    start_retraining_scheduler(config)

    if config["retrain_on_startup"]["enabled"]:
        logger.warning("retrain_on_startup is ENABLED — retraining all stale models")
        for stock in config["active_stocks"]:
            worker = RetrainWorker(stock, config)
            if worker.is_model_stale():
                await worker.retrain(reason="startup_retrain")
```

@systematic-debugging
@verification-before-completion

`/data/market-data/RELIANCE` → all 5 signal tracks with correct types and timestamps. Revenue and profit are quarterly. Update TASKS.md.

---

### Phase 3 — Signal Processing

@python-patterns
@software-architecture

`BaseTransform`, `STFTTransform`, `CWTTransform`, `HHTTransform`, transform registry, `SpectrogramGenerator`, `FFTVisualizer`.

`/signal/stft-frames/{stock_id}` response schema (used by the animation):
```json
{
  "frames": [
    {
      "frame_index": 0,
      "window_start_date": "2020-01-15",
      "window_end_date": "2020-04-14",
      "signal_segment": [1234.5, 1241.2, ...],
      "fft_frequencies": [0.0, 0.016, ...],
      "fft_amplitudes": [0.0, 12.4, ...],
      "spectrogram_column": [0.0, 0.08, ...],
      "label_price": 1298.4,
      "label_date": "2020-04-19"
    }
  ],
  "total_frames": 847,
  "freq_bins": 64,
  "time_axis_labels": ["2020-01-15", ...],
  "freq_axis_labels": ["0.0 Hz", ...]
}
```

@verification-before-completion

PNG spectrogram, FFT data, stft-frames all return correct shapes. Update TASKS.md.

---

### Phase 4 — Model Layer

@python-patterns

Three CNN variants. `ModelRegistry`. Graceful missing-model handling. Smoke test in `__main__` per file.

---

### Phase 5 — Training Pipeline

@writing-plans

Write the label alignment plan before implementing. Chronological split. `DatasetBuilder`, `TrainLoop` (with SSE callback), `Evaluator`, `NotebookGenerator` (Jinja2 → complete `.ipynb`).

The local training mode must be activatable via:
```python
if config["local_training"]["enabled"]:
    trainer = LocalTrainer(config)
    results = trainer.train_all()
    if config["local_training"]["auto_place_models"]:
        trainer.place_models()  # moves .pth and .pkl to model_store/
```

@verification-before-completion

Chronological split verified. Notebook generates valid JSON. Update TASKS.md.

---

### Phase 6 — Retraining System

APScheduler. `DriftDetector`. `RetrainWorker` (respects `local_training.enabled` flag — if true, retrains locally; if false, only logs that retraining is due and suggests running Colab). `retrain_log.json`.

---

### Phase 7 — All FastAPI Routes

@backend-dev-guidelines
@api-patterns

All routes fully implemented. Pydantic response models. Proper error shapes. SSE endpoints for `/live/stream/{stock_id}` and `/training/progress`.

`GET /config` exposes full stocks.json to frontend (used by React to render dynamic stock list).

@lint-and-validate
@verification-before-completion

Every endpoint tested via FastAPI `/docs`. Update TASKS.md.

---

### Phase 8 — Frontend Core

@brainstorming

Before writing components, decide: theme state (localStorage + CSS class on html), active stock (URL param), live data (local hook, not global store), chart color utilities (per-theme object per component).

@frontend-dev-guidelines

All config from `stocksConfig.ts`. TypeScript strict mode, no `any`. Discriminated unions for loading states.

**Theme system:**
```typescript
const DARK_CHART = {
  bg: '#131722', grid: 'rgba(255,255,255,0.04)',
  text: '#787B86', up: '#26A69A', down: '#EF5350',
};
const LIGHT_CHART = {
  bg: '#F0F3FA', grid: 'rgba(0,0,0,0.04)',
  text: '#787B86', up: '#26A69A', down: '#EF5350',
};
export const getChartTheme = (theme: 'dark' | 'light') =>
  theme === 'dark' ? DARK_CHART : LIGHT_CHART;
```

**Sidebar:**
52px collapsed (icons + tooltips on hover), 200px expanded. `lucide-react` icons. Active route gets `--color-teal` left border accent and slightly lighter background. Collapse toggle at bottom.

**Navbar:**
48px height. Left: FinSpectra logo (Inter 600, 16px, with a small TrendingUp icon). Center: stock search/selector dropdown styled like TradingView's. Right: MarketStatusBadge + ThemeToggle pill.

**MarketStatusBadge:**
Green pulsing dot + "OPEN" text when market is open. Grey dot + "CLOSED" when not. Exchanges shown: "NSE 09:15–15:30".

@react-patterns
@verification-before-completion

All 7 routes resolve. Dark/light toggle works. Sidebar collapses/expands. Stock selector renders all active stocks from config. Update TASKS.md.

---

### Phase 9 — Dashboard Page

@frontend-design
@ui-ux-pro-max

The dashboard is a command center. Every pixel should feel purposeful.

**Top row — 5 Metric Cards (one per stock):**
Each card (approx 200px wide):
- Stock name (Inter 600, 13px)
- ExchangeBadge pill ("NSE" in teal at 10% opacity background)
- Current price (JetBrains Mono 600, 20px)
- Price change: `▲ +1.24%` in green or `▼ -0.87%` in red (Mono 12px)
- Predicted price label (Inter 400 11px, muted) + predicted value (Mono 14px, purple)
- MiniSparkline (80×32px, lightweight-charts, last 30 days)
- On hover: card slightly elevates with `--color-bg-elevated` background

**Main Chart (below cards):**
Full-width multi-stock line chart using `lightweight-charts`. Each stock normalized to 100 at start date. Each stock line uses its `color` from stocks.json. Custom legend below chart (not inside): colored dot + stock name + current % change.

Time range selector bar above chart: 1D / 5D / 1M / 3M / 6M / 1Y / 3Y / 5Y buttons styled as TradingView's range selector (subtle background, active state with white text).

**Bottom Row — 3 Status Cards:**

Card 1 — Model Health:
Table of all 5 stocks showing model status (CheckCircle2 green if trained, AlertCircle amber if stale, XCircle red if missing), model type (per-stock/unified), last trained date.

Card 2 — Retraining Schedule:
Next scheduled retrain per stock as a mini timeline.

Card 3 — System Status:
- Local training: enabled/disabled badge
- Retrain on startup: enabled/disabled badge
- Active provider (yfinance/zerodha/angel_one) per exchange
- API latency (last fetch time)

**Live Market Ticker (top of page, full width):**
A horizontally scrolling ticker strip (like Bloomberg/TradingView top bar):
`RELIANCE ▲ 2847.50 +1.24%  |  TCS ▼ 3421.15 -0.31%  |  HDFCBANK ...`
CSS `animation: scroll-left 30s linear infinite`. Pause on hover.

@react-ui-patterns

Every data-dependent section has shimmer skeleton loading state.

@verification-before-completion

All 5 metric cards render. Main chart shows all stocks. Ticker scrolls. Status cards show correct training state. Update TASKS.md.

---

### Phase 10 — Stock Detail Page

@frontend-design

Full-width stock selector tabs at top. Five charts below, arranged in a 2-column grid with the price chart spanning full width at top.

**Layout:**
```
[  StockPriceChart (candlestick + volume) — full width, 400px tall  ]
[ MarketIndexChart — 50%  ] [ USDINRChart — 50%  ]
[ RevenueChart — 50%      ] [ ProfitChart — 50%  ]
```

**StockPriceChart extras beyond basic candlestick:**
- Moving averages: MA20 (thin white line 40% opacity), MA50 (thin amber line 40% opacity) as `LineSeries`
- Prediction overlay: dashed purple `LineSeries` extending 5 days into the future
- Confidence band: subtle purple `AreaSeries` around prediction
- Volume histogram at bottom (25% of chart height)
- Right-side price scale (TradingView standard)
- Interactive crosshair with OHLCV tooltip

**Above the chart (chart toolbar):**
- Stock name + exchange badge (left)
- Time range selector: 1W / 1M / 3M / 6M / 1Y / 3Y (center)
- Chart type toggle: Candlestick / Line / Area (right, icons from lucide-react)
- Indicators toggle: MA20, MA50, Prediction (toggleable pills)

**RevenueChart and ProfitChart:**
Recharts `BarChart`. X axis shows quarter labels ("Q1 FY24"). Revenue bars in blue. Profit bars: positive in `#26A69A`, negative in `#EF5350`. On hover: tooltip showing exact value in ₹ Crores.

**Additional analysis panel (below all charts):**
A small summary panel for the selected stock:
- Current prediction: "₹2,851 in 5 days" with confidence level
- Price momentum indicator (circular gauge — D3.js arc, 0-100 scale)
- Sector badge and stock description (one line, from a hardcoded map in stocksConfig.ts)

@verification-before-completion

All 5 charts render with real data. Time range selector updates all daily charts. Chart type toggle works. MA lines toggle. Update TASKS.md.

---

### Phase 11 — Signal Analysis Page

@d3-viz
@frontend-design

This page explains the signal processing. Make it feel like a textbook come alive.

**Page header:** "Signal Analysis" title + stock selector dropdown + transform selector pills (STFT / CWT / HHT).

**Section 1 — Time Domain (full width):**
A `lightweight-charts` line chart of the raw price series. Below it, a second mini chart showing the same series with a highlighted amber sliding window rectangle that the user can drag left/right to see different time regions.

**Section 2 — Frequency Domain (two columns):**
Left: `FrequencySpectrumChart` — D3.js bar chart showing amplitude vs frequency for the currently selected window. Bars are colored by frequency band:
- Low freq (0–0.05 Hz) → teal
- Mid freq (0.05–0.2 Hz) → amber
- High freq (0.2+ Hz) → red/coral
Annotation arrows with labels: "Long-term trends (months)", "Medium cycles (weeks)", "Daily noise".

Right: A frequency band energy pie chart (Recharts `PieChart`) showing the percentage of total energy in each band. Real-time updates as the window slides.

**Section 3 — Spectrogram (full width):**
D3.js heatmap. Viridis color scale. Both axes labeled. Color legend bar right side. Crosshair cursor. On hover: tooltip showing exact date, frequency bin, and energy value.

Below the heatmap: Three pill toggle buttons (STFT / CWT / HHT) — switching sends a new API request and smoothly transitions the heatmap colors.

**Section 4 — Parameter Explorer:**
Two `<input type="range">` sliders: Window Length L (16–256) and Hop Size H (1–L/2). Below sliders: a small preview spectrogram that updates debounced. Two annotation lines: "Larger L → better frequency resolution" and "Smaller H → finer time grid".

**Section 5 — Window Dissection (educational, bottom of page):**
Pick a specific date using a date picker. Shows: the extracted price window, its FFT (bar chart), and the resulting spectrogram column — all three side by side. Labels explaining each step.

@react-ui-patterns
@verification-before-completion

Spectrogram renders as 2D heatmap. Transform toggle works. Window slider updates frequency spectrum. Date picker shows window dissection. Update TASKS.md.

---

### Phase 12 — Live Testing Page

@react-patterns

`useLiveMarket` hook — EventSource lifecycle, reconnect with exponential backoff, emits `{actual, predicted, timestamp, market_open}`.

**Page layout (when market OPEN):**

Top: Full-width pulsing green banner: `● NSE MARKET OPEN — 11:42:31 IST` (live clock using `setInterval`).

Main chart (70% width): `lightweight-charts` real-time chart. Two series:
1. Actual intraday price — candlestick or line (user toggleable), updates every 15s
2. Predicted price — dashed purple `LineSeries`
3. Confidence band — subtle purple `AreaSeries`

Right panel (30% width):

Prediction accuracy panel — four large metric cards:
```
Rolling MSE    RMSE         Directional     MAPE
  0.00412    ₹14.82         Accuracy       2.34%
   ↓ -5%      ↑ +2%          73.2%          ↓ -0.1%
                              ↑ +1.4%
```
Each card: large monospace number, label, small trend arrow + % change vs previous 20 windows.

Below metrics: "Last 10 Predictions" table with columns: Time | Predicted | Actual | Δ Error | Direction ✓/✗. Rows alternate background colors. Green check / red X for direction accuracy.

**Page layout (when market CLOSED):**

Large dim banner: `● NSE MARKET CLOSED — Opens in 4h 23m 11s` (live countdown using exchange timezone from stocks.json).

Shows most recent trading day's completed chart (static, same lightweight-charts layout).

Below: daily summary for last trading day — predicted price for that day vs actual close, all 4 accuracy metrics for that day.

@verification-before-completion

SSE connects. Chart updates in real time. Metrics update per tick. Countdown works with correct timezone. Update TASKS.md.

---

### Phase 13 — HOW IT WORKS PAGE (MOST IMPORTANT VISUALIZATION)

@brainstorming

This page must make someone with no ML knowledge understand exactly how FinSpectra works. It must also make a professor give full marks. Design the state machine first:

```
State: { phase: 0-5, frame: 0-N, playing: bool, speed: 0.5|1|2 }
Transitions: PLAY | PAUSE | STEP | REWIND | SET_SPEED | AUTO_ADVANCE
```

Fetch all frame data from `/signal/stft-frames/{stock_id}` on mount. Store in component state. All 6 panels driven by `currentFrame` index.

@frontend-design
@ui-ux-pro-max

**Page header:**
"How FinSpectra Works" (Inter 600, 24px). Below it: a horizontal pipeline diagram showing the 6 stages with connecting arrows. The active stage glows. This is a static SVG overview that doesn't animate — it's the map.

**The 6 animated panels (below the pipeline map):**

Panels are displayed in a 2×3 grid on wide screens, full-width stacked on narrow. Each panel has:
- Panel number badge (teal circle, 14px mono)
- Panel title (Inter 500, 13px)
- 4px teal left border on active panel
- Panel content (the visualization)

**Panel 1 — "The Signal":**
A `lightweight-charts` mini line chart (read-only, no interactions) showing the full price history. A slowly pulsing amber rectangle (Framer Motion `animate={{x: frameX, width: windowWidth}}`) marks the current window position. Below: "Window ${frame.window_start_date} → ${frame.window_end_date}".

**Panel 2 — "Extracting the Window":**
Same chart, but zoomed into just the current window's price segment. The extracted segment animates in with a Framer Motion entrance effect. Shows L data points. Below: `"Window Length: ${L} trading days"`.

**Panel 3 — "Frequency Analysis (FFT)":**
A D3.js animated bar chart showing `frame.fft_amplitudes` vs `frame.fft_frequencies`. Bars animate from 0 to their final heights using D3 transitions (`d3.transition().duration(300)`). Three colored zones (teal/amber/red) matching the frequency bands. Below: "Dominant frequency: X Hz (roughly Y-day cycle)".

**Panel 4 — "The Spectrogram Builds":**
A D3.js heatmap that builds column by column. As `currentFrame` advances, a new column appears on the right edge and older columns shift left. Use D3 enter/update/exit pattern for smooth transitions. The currently active column is highlighted with a bright border. Below: "Each column = one FFT computation".

**Panel 5 — "CNN Pattern Recognition":**
An SVG diagram of the CNN architecture. As frame advances (or on Play), a glowing amber particle (Framer Motion `animate={{pathOffset: 0→1}}` along an SVG path) travels through the network. Each layer node box glows (Framer Motion `animate={{boxShadow: glow}}`) as the particle passes through. Layer labels: Input, Conv1 (16 filters), Pool, Conv2 (32 filters), Pool, Conv3 (64 filters), Pool, Dense 128, Dropout, Output. The final output node shows the predicted price ticking up.

**Panel 6 — "The Prediction":**
Large centered display:
- Predicted price animates counting up (Framer Motion `animate={{value: 0→predicted}}` with `useMotionValue`)
- "Predicted: ₹{value} in 5 days" (JetBrains Mono, 28px, teal)
- Actual price shown below: "Actual (5 days later): ₹{actual}" (Mono, 16px, muted)
- Delta: green if prediction was close, red if not
- Accuracy meter: a horizontal bar showing |predicted - actual| / actual as a percentage

**Data flow particle animation (between panels):**
Between each adjacent panel, a small animated particle streams along a connecting path (SVG `<path>` with Framer Motion `pathLength` animation). The particle is teal, 6px circle, leaves a fading trail. This makes it visually clear that data flows from one stage to the next.

**Controls bar (fixed at bottom of page):**
```
[⏮ Rewind] [◀ Step Back] [▶ Play / ⏸ Pause] [Step Forward ▶] [⏭ Last]
  ●─────────────────────────────○  Progress slider (drag to any frame)
  Speed: [0.5x] [1x] [2x]           Frame: 247 / 847   Window: 2021-03-15
```
Styled with the design system. Play button has a pulsing green glow when playing.

**Concept explanation panel (right side, 280px):**
As the animation plays, this panel shows a plain-English explanation of what's happening at the current stage. It updates as the phase changes:
- Phase 1: "We start with raw stock prices — a simple time series of daily closing values."
- Phase 2: "We extract a 64-day window of prices. This is the 'short time' in Short-Time Fourier Transform."
- Phase 3: "The FFT converts our price window into frequency space. High bars = strong oscillations at that frequency."
- Phase 4: "Stacking all FFT results over time creates the spectrogram — a 2D image where patterns are visible."
- Phase 5: "The CNN scans this image like a camera looking at a photo. It has learned which patterns precede price movements."
- Phase 6: "The CNN outputs a single predicted price. After 5 days, we compare it to reality."

`prefers-reduced-motion`: if true, show a static 6-panel grid with the final state of each panel. No animations.

@verification-before-completion

Play button runs all 6 panels. Pause/step/rewind work. Speed slider changes tempo. CNN particle travels through the network. Spectrogram builds column by column. Concept panel updates per phase. Update TASKS.md.

---

### Phase 14 — Model Comparison Page

@d3-viz
@frontend-design

**Header row:** Two large info cards explaining the two model variants in plain language. Use a small diagram inside each card showing the architecture difference.

**Comparison chart:** Recharts grouped `BarChart`. X axis = stock names. Two bar groups per stock. Per-stock MSE in teal, unified MSE in purple. Custom rounded bar corners. Labels showing exact MSE above each bar.

**Radar chart (D3.js):** Five axes: MSE, RMSE, MAE, Directional Accuracy, MAPE (inverted so "bigger = better" on all axes). Two filled polygons (teal for per-stock, purple for unified, both at 25% opacity). Axis labels around the perimeter.

**Embedding visualization (D3.js scatter):**
Title: "What the Unified Model Learned About Each Stock"
t-SNE 2D scatter. Each stock = one labeled dot. Dots colored by sector (one color per sector). Stock name labels with leader lines. Subtitle: "Stocks that cluster together have similar spectrogram patterns — the model learned this without being told."
Only renders if `unified_model.pth` is present. Otherwise: "Train the unified model to see how it clusters stocks by learned behavior."

**Metric table (bottom):**
Full comparison table: all metrics for all stocks for all model types. Sortable columns. Highlight best value per row in teal.

@verification-before-completion

Comparison chart renders. Radar chart renders with both models. Embedding scatter only renders if unified model is trained. Table is sortable. Update TASKS.md.

---

### Phase 15 — Training Page

@frontend-design

**Top section — Actions:**
Two primary action buttons:
1. "Generate Colab Notebook" (Download icon + outline button style) → triggers `/notebook/generate` → downloads `.ipynb`
2. "Train Locally" (Play icon + filled teal button) → triggers `POST /training/start` → only available if `local_training.enabled: true` in config. If disabled: button is greyed with tooltip "Enable local_training in stocks.json to use this feature"

Config status banner showing current training flags:
```
Local Training: DISABLED  |  Retrain on Startup: DISABLED  |  Provider: yfinance
```
With small edit icon hinting the user to modify stocks.json.

**Training progress section (visible during active training):**
- Stock being trained: badge with stock color
- Epoch counter: "Epoch 23 / 50" (monospace)
- `LossCurveChart` updating live via SSE
- Estimated time remaining
- Cancel button (sends `POST /training/cancel`)

**Retraining history timeline:**
Vertical timeline. Each event is a card:
- Stock badge (colored dot + name)
- Date and time (monospace)
- Reason pill: green "scheduled" / amber "drift detected" / blue "startup" / purple "manual"
- MSE before → MSE after (arrow between, green if improved)
- Duration (e.g., "4m 32s")
- Mode badge: "Colab" / "Local"
Timeline connector line between events.

**Drift monitoring section:**
`DriftChart` with one line per stock (using stock's color from config). Red dashed `ReferenceLine` at threshold. `ReferenceArea` fills subtle red when lines exceed threshold. Title: "Model Performance Over Time — Rolling MSE".

**Colab workflow guide (collapsible panel):**
Step-by-step numbered guide with code blocks showing exactly how to use the downloaded notebook. Styled like a documentation page within the app.

@verification-before-completion

Notebook download works. Local training button respects config flag. Retraining history shows from retrain_log.json. Drift chart renders. Update TASKS.md.

---

### Phase 16 — Assignment Alignment Audit

@research-engineer

Before calling the project complete, audit every requirement from the original assignment document against the implementation:

**Required tasks from assignment:**
1. Task 1 — Data Preparation: ✓ 5 companies, aligned to common time scale, normalized
2. Task 2 — Signal Processing: ✓ Fourier Transform (FFT page), STFT spectrograms (Signal Analysis), visualized
3. Task 3 — Model Development: ✓ CNN model (per-stock + unified), trained on spectrograms, predicts future prices
4. Task 4 — Analysis: ✓ Predictions vs actual (Stock Detail + Live Testing), MSE evaluation (Training + Model Comparison), feature effect analysis (Parameter Explorer)

**Required figures from assignment:**
1. ✓ Time series plot → StockPriceChart (Stock Detail page)
2. ✓ Frequency spectrum → FrequencySpectrumChart (Signal Analysis page)
3. ✓ Spectrogram → SpectrogramHeatmap (Signal Analysis page)
4. ✓ CNN architecture diagram → Panel 5 of How It Works page

**Additional signal charts from assignment:**
1. ✓ Stock price vs time → StockPriceChart
2. ✓ Revenue vs quarter → RevenueChart
3. ✓ Profit vs quarter → ProfitChart
4. ✓ Market index (Sensex) vs time → MarketIndexChart
5. ✓ USD-INR exchange rate vs time → USDINRChart

Document this audit in `ASSIGNMENT_ALIGNMENT.md` at project root with a table showing every requirement and which component satisfies it. This file is for submission reference.

@verification-before-completion

All assignment requirements verified present. `ASSIGNMENT_ALIGNMENT.md` created. Update TASKS.md.

---

### Phase 17 — Polish, Testing, Final Audit

@webapp-testing

Playwright test suite:
1. Dashboard loads → 5 metric cards + ticker strip render
2. Stock Detail → `/stock/RELIANCE` → all 5 charts, time range selector, indicators toggle
3. Signal Analysis → spectrogram heatmap renders, transform toggle works
4. Live Testing → SSE connects, market status badge renders
5. How It Works → Play button starts animation, all 6 panels become active
6. Model Comparison → charts render, radar chart visible
7. Training → notebook download triggers file download
8. Dark/light mode toggle → all charts rerender with correct theme colors
9. Sidebar collapse/expand → works, icons visible in collapsed state

@production-code-audit

Full codebase scan:
- No `console.log` in production code
- No hardcoded stock names outside `stocksConfig.ts`
- No hardcoded API URLs (all from `.env`)
- No `any` TypeScript types
- All async boundaries have error handling

@lint-and-validate

Backend: `flake8 backend/ --max-line-length=100` + `mypy backend/`
Frontend: `npm run type-check` (tsc --noEmit) + `npm run lint` (eslint)
Zero errors, zero warnings.

@security-review

No API keys in source. CORS set to `FRONTEND_URL` env var (not `*`). No path traversal in notebook generation.

@git-pushing

Final commit: `feat: finspectra v1.0 complete — all phases done`

@verification-before-completion

Full manual walkthrough of all pages in both modes. All Playwright tests pass. Zero linting errors. ASSIGNMENT_ALIGNMENT.md complete. TASKS.md shows all tasks done. PROGRESS.md has final session entry.

---

## SESSION HANDOFF PROTOCOL

End of every session:
1. Update `TASKS.md` — check off completed tasks, add new ones discovered
2. Update `PROGRESS.md` — completed, in-progress with exact state, next session starts with
3. Leave `# IN PROGRESS:` comments in unfinished files

@git-pushing

End of every phase: `feat(phase-N): [description]` commit + push.

New session start:
1. Read `PROGRESS.md`
2. Read `TASKS.md`
3. Continue exactly where last session ended

---

## GLOBAL CODING STANDARDS

@clean-code
@typescript-expert
@python-patterns

Python: type hints everywhere, dataclasses for structured data, pathlib.Path, logging not print, specific exceptions.
TypeScript: strict mode, no `any`, Zod for API response validation, discriminated unions for states.
Both: functions max 40 lines, descriptive names, one responsibility per function, constants named.

---

## CONSTRAINTS

- Do not implement Market Nerves integration — deferred to Phase 2
- Zerodha and AngelOne are stubs only — full API documentation in docstrings, never called without credentials
- FastAPI never trains models during request handling — training runs in background tasks only
- All `.env` values read from environment — never hardcoded in source
- `retrain_on_startup` and `local_training.enabled` must ALWAYS be `false` in the committed stocks.json — they are local-only flags

---

## START NOW

@planning-with-files

Read `finspectra_spec.md`. Create `TASKS.md`, `PROGRESS.md`, `README.md`, `ARCHITECTURE.md`, `.env`. Then Phase 1.
