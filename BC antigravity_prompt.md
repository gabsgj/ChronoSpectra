# FinSpectra — Antigravity Development Prompt
# Upload this file alongside finspectra_spec.md into Antigravity (Opus 4.6)

---

You are the lead engineer for **FinSpectra**, a professional financial time series forecasting web application. You have been provided with `finspectra_spec.md` — the complete project specification.

---

## BEFORE WRITING ANY CODE

@planning-with-files

Read `finspectra_spec.md` completely before doing anything else. Then create the following project management files at the project root. All future sessions will use these to resume work without losing context.

**`TASKS.md`** — Flat, atomic, checkboxed task list covering every deliverable in the spec, grouped by phase. Each task must be independently completable and verifiable. Example format:
```
## Phase 1: Project Scaffolding
- [ ] Initialize monorepo with backend/ and frontend/ directories
- [ ] Create stocks.json with all 5 NSE stocks configured
- [ ] Set up FastAPI with all route stubs returning {"status": "not_implemented"}
- [ ] Set up Vite + React + TypeScript + Tailwind
- [ ] Create docker-compose.yml
- [ ] Verify: backend :8000, frontend :5173, CORS working

## Phase 2: Data Layer
- [ ] Implement BaseDataFetcher with PricePoint and FundamentalsData dataclasses
- [ ] Implement YFinanceFetcher — all 8 methods fully working
- [ ] Implement ZerodhaFetcher — proper stub with full API docs in docstrings
- [ ] Implement AngelOneFetcher — proper stub with full API docs in docstrings
- [ ] Implement get_fetcher() factory function
- [ ] Implement DailyAligner
- [ ] Implement QuarterlyAligner
- [ ] Implement MinMaxNormalizer
- [ ] Implement DataCache
- [ ] Wire /data/fetch/{stock_id}, /data/fetch-all, /data/market-data/{stock_id}
- [ ] Verify: /data/market-data/RELIANCE returns all 5 signal tracks

## Phase 3: Signal Processing
...and so on for every phase
```

**`PROGRESS.md`** — Session handoff log. Update at the END of every session:
```
## Session Log

### Session N — [date]
**Completed:** [list]
**In Progress:** [task + exact state]
**Blocked:** [if any]
**Next Session Starts With:** [exact next task, no ambiguity]
**Critical Context:** [anything not in the spec]
```

**`README.md`** — Project readme.

@documentation-templates

Use this skill to structure the README. Cover: what FinSpectra is, full tech stack, how to run locally (docker-compose up), how to add stocks to stocks.json, how to generate Colab training notebooks, how to trigger retraining, how to activate Zerodha/AngelOne (env vars + stocks.json change).

---

## PHASE 1 — PROJECT SCAFFOLDING

@senior-architect

Before writing any scaffold code, apply this skill to make key architectural decisions explicit. Document them in `ARCHITECTURE.md`:
- Why FastAPI over Flask (async SSE, background tasks, auto docs)
- Why Vite + React over Next.js (no SSR needed, pure SPA, faster dev loop)
- Why config-driven design (stocks.json as single source of truth)
- Abstract base class strategy for all swappable components
- How the three CNN variants differ and when to use each

Then scaffold the full directory structure exactly as defined in `finspectra_spec.md` section 7.

`docker-compose.yml` brings up both services with `docker-compose up`. Backend on port 8000, frontend on port 5173. Hot reload for both.

@verification-before-completion

Before marking Phase 1 done: start both services and confirm `GET /health` returns `{"status": "ok"}`, frontend loads without console errors, CORS headers present. Do not check this off until you have seen the evidence.

---

## PHASE 2 — DATA LAYER

@software-architecture

Apply this skill when designing `BaseDataFetcher`. The interface must be designed around the union of what yfinance, Zerodha Kite, and Angel One SmartAPI can all provide. The 8 required methods and dataclass definitions are in `finspectra_spec.md` section 8.2.

**`YFinanceFetcher`** — fully implement all 8 methods. For `start_live_stream`, use polling every 15 seconds with a daemon thread. Add prominent docstring: `# yfinance is 15-min delayed. Change live_data_provider in stocks.json to "zerodha" or "angel_one" for real-time.`

**`ZerodhaFetcher`** — proper stub. Every method raises `NotImplementedError` with: exact Kite Connect API endpoint, required env vars (`ZERODHA_API_KEY`, `ZERODHA_ACCESS_TOKEN`), auth flow, WebSocket subscription pattern. `fetch_fundamentals` and `is_market_open` call through to `YFinanceFetcher` since Zerodha doesn't provide that data.

**`AngelOneFetcher`** — same pattern. Angel One SmartAPI specifics: SmartConnect init, TOTP auth with `pyotp`, OpenAPIScripMaster.json for symbol tokens, SmartWebSocketV2 for streaming. Required env vars: `ANGEL_ONE_API_KEY`, `ANGEL_ONE_CLIENT_ID`, `ANGEL_ONE_PASSWORD`, `ANGEL_ONE_TOTP_SECRET`.

**`get_fetcher()` factory** — reads `live_data_provider` from exchange config in stocks.json. Only place in the codebase that knows about provider selection.

@python-patterns

Apply throughout the data layer. Type hints on every function. Dataclasses for structured data. Abstract base classes via `abc.ABC`. No bare `except` — catch specific exceptions.

@systematic-debugging

When fetching from yfinance: NSE tickers require `.NS` suffix. `quarterly_income_stmt` may be empty for some stocks — handle gracefully. `history()` can return empty DataFrame during holidays — return last available data. Apply this skill whenever a fetcher method fails during testing.

@verification-before-completion

Before marking Phase 2 done: call `/data/market-data/RELIANCE`. Verify all 5 signal tracks returned (price, revenue, profit, index, USD-INR) as aligned JSON with timestamps. Verify revenue and profit are quarterly (4 entries/year, not daily).

---

## PHASE 3 — SIGNAL PROCESSING

@software-architecture

Apply when designing `BaseTransform`. Must return `(spectrogram_2d, freq_axis, time_axis)` consistently regardless of transform used.

**`STFTTransform`** — `scipy.signal.stft`. Parameters from `stocks.json → signal_processing.stft`. Output: `S(t,f) = |STFT(t,f)|²`. Primary transform, fully implemented.

**`CWTTransform`** — `pywt.cwt`. Swappable alternative.

**`HHTTransform`** — `PyEMD`. Third swappable option.

**`SpectrogramGenerator`** — orchestrates fetch → normalize → transform → return 2D array. Returns both PNG bytes (for display) and JSON data (for animation).

**`FFTVisualizer`** — plain FFT of full price series (not windowed) for frequency spectrum chart.

`/signal/stft-frames/{stock_id}` is critical — returns frame-by-frame STFT data. Each frame contains the extracted signal segment and FFT column for that window position. Design the response schema so the frontend can animate each frame independently.

@python-patterns

All transforms must be stateless. Parameters always from config, never hardcoded.

@verification-before-completion

Call `/signal/spectrogram/RELIANCE` → valid PNG heatmap. Call `/signal/fft/RELIANCE` → x (frequency) and y (amplitude) arrays. Call `/signal/stft-frames/RELIANCE` → array of frame objects with `segment` and `fft_column` per frame.

---

## PHASE 4 — MODEL LAYER

@software-architecture

Three CNN variants from `finspectra_spec.md` section 10. All inherit `BaseModel`. All accept `(batch, 1, freq_bins, time_steps)` tensor, output scalar prediction.

`ModelRegistry` reads `model_mode` from stocks.json. Handles missing `.pth` files gracefully: return `{"error": "model_not_trained", "hint": "Run the Colab notebook and place .pth in model_store/"}`.

@python-patterns

Each model file has a `if __name__ == "__main__":` smoke test block running a forward pass with a random tensor.

@verification-before-completion

Import all three model classes. Run random tensor through each. Verify scalar output. Run each file directly — smoke test must pass.

---

## PHASE 5 — TRAINING PIPELINE

@writing-plans

Before implementing, write a short plan for the dataset builder. The key design decision: for a window ending at `t`, the label is price at `t + prediction_horizon_days`. Off-by-one errors here silently corrupt the entire model. Write the indexing logic on paper first, then implement.

**`DatasetBuilder`** — chronological split only. Verify test set timestamps are ALL later than train set timestamps before returning. Returns PyTorch `Dataset` objects.

**`TrainLoop`** — MSE loss, Adam. Emits per-epoch loss via callback (used by SSE training progress endpoint). Saves best checkpoint on validation loss.

**`Evaluator`** — MSE, RMSE, MAE, MAPE, directional accuracy. Denormalizes to original price units using saved scaler.

**`NotebookGenerator`** — Jinja2 templates → complete `.ipynb`. All stocks.json parameters injected. Must be executable in Colab with zero modifications. Includes Google Drive save with clear download instructions.

@python-patterns
@verification-before-completion

Run `DatasetBuilder` on RELIANCE. Print first and last 5 timestamps from train and test sets. Verify zero overlap. Verify test timestamps all later than train timestamps.

---

## PHASE 6 — RETRAINING SYSTEM

@software-architecture

APScheduler background job, not blocking the FastAPI event loop. Two triggers per stock: scheduled (based on `retrain_interval_days`) and drift-based (rolling MSE > `baseline_mse × drift_threshold_multiplier`).

`RetrainWorker` — asyncio background task. Writes to `retrain_log.json`: stock_id, timestamp, reason, before_mse, after_mse, duration_seconds, status.

`DriftDetector` — last 14 days of prediction vs actual pairs. Computes MSE. Compares to baseline from `training_report.json`.

@verification-before-completion

Call `POST /retraining/trigger/RELIANCE`. Verify `retrain_log.json` gets new entry with all required fields. Verify `GET /retraining/logs` returns it.

---

## PHASE 7 — COLAB NOTEBOOK GENERATOR

Two Jinja2 templates. `GET /notebook/generate?mode=per_stock` renders and returns downloadable `.ipynb`.

Generated notebook must be complete and runnable. Every cell has a markdown header. Variable names match backend model architecture exactly — `.pth` must load in `ModelRegistry` without modification.

@verification-before-completion

Generate a notebook. Verify valid JSON. Verify all Jinja2 substitutions rendered. Verify no template tags remain.

---

## PHASE 8 — ALL FASTAPI ROUTES WIRED

@backend-dev-guidelines

Apply this skill for full route implementation. Every endpoint must:
- Read from `request.app.state.config` — never re-read stocks.json per request
- Return proper HTTP status codes: 404 unknown stock, 422 invalid params, 503 model not trained
- Pydantic response models for all non-streaming endpoints
- Structured error responses: `{"error": "...", "detail": "...", "hint": "..."}`

`/live/stream/{stock_id}` — SSE, `text/event-stream`. Check `is_market_open()` each tick. If closed: emit `{"market_open": false, "countdown_seconds": N}`. Handle client disconnection.

`/training/progress` — SSE streaming per-epoch loss callbacks.

@api-patterns

Consistent response shapes: lists return `{"data": [...], "count": N}`. Single resources return directly. Errors return `{"error": "...", "detail": "...", "hint": "..."}`.

@lint-and-validate

Run `flake8 backend/ --max-line-length=100` and `mypy backend/ --ignore-missing-imports`. Fix all errors before marking complete.

@verification-before-completion

Hit every endpoint in FastAPI `/docs`. Every endpoint returns correct shape. No 500 errors on valid requests.

---

## PHASE 9 — FRONTEND SCAFFOLDING

@brainstorming

Before writing frontend code, apply this skill to decide: Where does stocks.json config load? How does theme state persist? How does active stock share between pages? Should live data be global or local? Document answers in a comment block at the top of `App.tsx`.

@frontend-dev-guidelines

Apply throughout all frontend phases. Config values always from `stocksConfig.ts`. TypeScript strict mode, no `any`. All API responses typed in `src/types/index.ts`. Suspense + lazy loading for all pages.

**Theme system — implement before any other components:**
```typescript
// src/hooks/useTheme.ts
export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('finspectra-theme') as 'dark' | 'light') || 'dark'
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('finspectra-theme', theme);
  }, [theme]);
  return { theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') };
}
```

@tailwind-patterns

CSS-first Tailwind v4 config. Define full color token set from the spec as CSS custom properties. All components use semantic tokens, never raw hex in JSX.

Light/dark color tokens from the spec:
```
Dark:  bg-primary #0F1117, bg-secondary #1A1D2E, bg-card #1E2235
       text-primary #F0F2F5, text-secondary #8B90A7
       accent-teal #00D4AA, accent-amber #F5A623
Light: bg-primary #F5F6FA, bg-secondary #FFFFFF, bg-card #FFFFFF
       text-primary #0F1117, text-secondary #5A6072
       accent-teal #00A885, accent-amber #D4860A
```

@react-patterns

React Router v6 with `createBrowserRouter`. Lazy-loaded page components. Sidebar highlights active route via `useLocation`. Stock tabs update URL via `useNavigate`.

@verification-before-completion

`npm run dev` starts without errors. All 7 routes resolve. Dark mode toggle works. Sidebar highlights active route. Stock tabs render from `activeStocks` config, not hardcoded.

---

## PHASE 10 — FRONTEND DATA CHARTS

@frontend-design

Apply this skill for all chart components. Customize every Recharts default — colors, fonts, grid lines, tooltip styles. No generic out-of-box appearance.

**Dark mode chart colors (hardcoded hex — Recharts cannot use CSS variables):**
- Background: `#1A1D2E`, Grid: `rgba(255,255,255,0.1)`, Teal: `#00D4AA`, Amber: `#F5A623`, Purple: `#7F77DD`

**Light mode chart colors:**
- Background: `#FFFFFF`, Grid: `rgba(0,0,0,0.08)`, Teal: `#00A885`, Amber: `#D4860A`, Purple: `#534AB7`

Define `getChartColors(theme: 'dark' | 'light')` utility used by all chart components.

Five charts on Stock Detail page share time range selector state (1M/3M/6M/1Y/3Y/5Y). Daily charts re-fetch on range change. Quarterly charts always show all available quarters.

`StockSelector` renders from `activeStocks`. Each tab shows `display_name` + `ExchangeBadge`. Active tab has accent-teal left border indicator.

@react-ui-patterns

Every chart must have: shimmer skeleton loading state, friendly error state with retry button, empty state if no data.

@verification-before-completion

Navigate to `/stock/RELIANCE`. All 5 charts render with real data. Time range selector updates all 3 daily charts. Stock tab switching loads correct stock data.

---

## PHASE 11 — SIGNAL ANALYSIS PAGE

@d3-viz

Apply this skill for the spectrogram heatmap. Use `d3.scaleSequential` with `d3.interpolateViridis` for the color scale. Proper axes with tick formatting. Clip path to keep heatmap within bounds. Hoverable cells with tooltip showing time / frequency / energy.

Three sections:
1. **Frequency Spectrum** — Recharts `BarChart` with three vertical reference lines annotating "Long-term trends" / "Cyclical patterns" / "Short-term noise" frequency zones.
2. **Spectrogram Heatmap** — D3 heatmap with viridis color scale, transform selector toggle (STFT/CWT/HHT pill buttons), color scale legend bar on right edge.
3. **Parameter Explorer** — Two range sliders (Window Length L, Hop Size H). Constrain H < L. Debounced preview heatmap updates on slider change. Educational annotations update dynamically.

@verification-before-completion

Spectrogram renders as proper 2D colored heatmap. Transform toggle switches work and update heatmap. Parameter sliders update preview after debounce. Cell hover shows correct values.

---

## PHASE 12 — LIVE TESTING PAGE

@react-patterns

`useLiveMarket` hook manages EventSource lifecycle. Close on unmount via `return () => es.close()`. Reconnect with exponential backoff (max 3 attempts) on disconnect before showing error state.

Market OPEN: `LivePredictionChart` (Recharts `ComposedChart` with actual line + dashed prediction line + `ReferenceArea` confidence band). Four live metric cards (rolling MSE, RMSE, Directional Accuracy %, MAPE) with trend arrows. Last 10 predictions table.

Market CLOSED: Last trading day's static chart. Countdown timer computed from exchange `market_hours` in stocks.json using exchange timezone. Counts down in real time via `setInterval`.

@frontend-dev-guidelines

Market open/closed state drives conditional rendering — not `display: none`. The SSE hook only starts the `EventSource` when the component mounts. The countdown timer only starts when `isMarketOpen === false`.

@verification-before-completion

During market hours: SSE connects, data arrives, chart updates. Off-hours: countdown shows correct time, counts down in real time.

---

## PHASE 13 — HOW IT WORKS PAGE

@brainstorming

Apply before writing a single line. Design the animation state machine first: `idle | playing | paused | stepping`. All 6 panels driven by a single `currentFrame` index. Frame data fetched once on mount from `/signal/stft-frames/{stock_id}`. Document the state machine in a comment block at the top of `HowItWorks.tsx`.

Six animated panels. All respect `prefers-reduced-motion` — static snapshots if reduced motion preferred.

**Panel 1** — Mini StockPriceChart with amber Framer Motion rectangle sliding across signal.
**Panel 2** — Price chart with smooth spring-transition window rectangle. Frame counter text below.
**Panel 3** — Framer Motion bar chart: bars animate `height: 0 → value` using `fft_column` from current frame.
**Panel 4** — D3 heatmap building column-by-column. Each column fades in as frame advances.
**Panel 5** — SVG CNN architecture diagram. Framer Motion glowing dot travels through network. Each layer box highlights as dot passes through.
**Panel 6** — Framer Motion counter animating 0 → predicted price. Predicted vs actual with ± delta.

Controls: ⏮ Rewind / ▶⏸ Play-Pause / ⏭ Step / speed slider / progress dots.

@frontend-design

Apply for panel styling. Consistent panel sizing. Animated data-flow particles between panels. Panel labels in muted secondary text. Subtle panel borders. Speed slider as custom range input.

@verification-before-completion

Click Play → all 6 panels animate in sequence. Pause/play/step controls work. Speed slider at 2x runs at double tempo. Spectrogram builds column-by-column correctly.

---

## PHASE 14 — MODEL COMPARISON + TRAINING PAGES

@d3-viz

Apply for the radar/spider chart and t-SNE embedding scatter plot.
- Radar chart: `d3.lineRadial` with `d3.scaleLinear` per axis, 5 metrics per model.
- t-SNE scatter: dots per stock labeled with name, colored by sector. `d3.forceSimulation` for non-overlapping labels. Only renders if `unified_model.pth` is loaded.

**Model Comparison page:** Two-column cards explaining each CNN variant. `ModelComparisonChart` (Recharts grouped bar, teal for per-stock, amber for unified). Radar chart. Embedding t-SNE scatter.

**Training page:** "Generate Colab Notebook" button (file download). "Trigger Retraining" button (confirmation modal → progress SSE). `LossCurveChart` (live updating via SSE). `RetrainingTimeline` (CSS/Tailwind vertical timeline from `retrain_log.json`). `DriftChart` (per-stock rolling MSE lines with red threshold `ReferenceArea`).

@verification-before-completion

Model comparison loads with metrics. Training page shows retraining history. Notebook download triggers `.ipynb` file. Trigger retraining → new entry appears in timeline on completion.

---

## PHASE 15 — DASHBOARD + POLISH

@frontend-design

**Dashboard:** Five metric cards (display_name, ExchangeBadge, current price, predicted price, % delta, 30-point sparkline, ModelModeBadge). Multi-line chart of all 5 stocks normalized to 100 at start date. Market status section (model trained ✓/✗, last retrained, next scheduled retrain).

Every component — correct in both dark and light mode. Chart colors switch via `getChartColors(theme)` utility.

Every data-fetching page — friendly error state if API is down, with "Try again" button.

Performance: all page components lazy-loaded via `React.lazy`. How It Works page only fetches STFT frame data on navigation.

@webapp-testing

Write a Playwright test covering:
1. Dashboard loads → 5 metric cards render
2. Navigate to `/stock/RELIANCE` → all 5 charts render
3. Navigate to `/signal/RELIANCE` → spectrogram heatmap renders
4. Toggle dark/light → `dark` class on `<html>` toggles
5. Navigate to `/live` → market status badge renders

@lint-and-validate

Run `npm run type-check` and `npm run lint`. Fix every error and warning before marking complete.

@production-code-audit

Apply this skill as a final pass over the entire codebase before considering the project complete. Scan for: unused imports, dead code, any remaining `console.log` statements, hardcoded values that should be in config, missing error handling at async boundaries.

@verification-before-completion

Full manual walkthrough of all 7 pages in both dark and light mode. Every chart renders with real data. No console errors. No TypeScript errors. Playwright tests pass.

---

## SESSION HANDOFF PROTOCOL

At the end of every working session:
1. Update `PROGRESS.md`
2. Check off completed tasks in `TASKS.md`
3. Leave `# IN PROGRESS: [task] — [exact state]` comments in unfinished files

@git-pushing

At the end of every completed phase, commit all changes with a conventional commit message: `feat(phase-N): [what was built]` and push.

When a new session begins:
1. Read `PROGRESS.md`
2. Read `TASKS.md`
3. Continue from exactly where the last session ended

---

## CODING STANDARDS

@clean-code

No function longer than 40 lines. No nested ternaries. Descriptive names — never `data`, `result`, `temp`. One responsibility per function. Constants named and placed at module top.

@typescript-expert

Strict mode. No `any`. Discriminated unions for API response states. Generic types for API client. Zod for runtime validation of API responses.

@python-patterns

Type hints everywhere. Dataclasses for structured data. `pathlib.Path` over `os.path`. `logging` not `print`. Context managers for file operations.

@security-review

Final security pass: no API keys in source code, CORS configured properly, no user input reaching filesystem paths unvalidated.

---

## CONSTRAINTS

- Do not implement Market Nerves integration — deferred
- Do not implement actual Zerodha/AngelOne API calls — stubs only with full documentation
- Do not train models in FastAPI — only load pre-trained `.pth` files
- Do not add features not in the spec

---

## START

@planning-with-files

Read `finspectra_spec.md`. Create `TASKS.md`, `PROGRESS.md`, `README.md`, `ARCHITECTURE.md`. Then begin Phase 1.
