# FinSpectra Task Checklist

## Phase 1: Project Scaffolding
- [x] Create root planning files: `TASKS.md`, `PROGRESS.md`, `task_plan.md`, and `findings.md`
- [x] Write `README.md` with quick start, configuration, notebook generation, retraining, and broker activation guidance
- [x] Write `ARCHITECTURE.md` documenting the initial architectural decisions
- [x] Create `stocks.json` with application, exchange, stock, signal, training, and retraining configuration
- [x] Scaffold the backend root files: `main.py`, `config.py`, `requirements.txt`
- [x] Scaffold route modules for `data`, `signal`, `model`, `training`, `retraining`, `live`, and `notebook`
- [x] Scaffold backend package directories for data, signal processing, models, training, retraining, and notebooks
- [x] Add placeholder files for fetchers, aligners, normalizers, cache, transforms, models, training modules, and retraining modules
- [x] Scaffold the frontend with Vite, React, TypeScript, and Tailwind
- [x] Create the route/page skeleton for Dashboard, Stock Detail, Signal Analysis, Model Comparison, Live Testing, How It Works, and Training
- [x] Add shared frontend structure for config, components, hooks, API client, and types
- [x] Create `docker-compose.yml` with backend on `:8000` and frontend on `:5173`
- [x] Implement `GET /health` and `GET /config`
- [x] Verify backend starts on port `8000`
- [x] Verify frontend starts on port `5173`
- [x] Verify CORS headers are present on backend responses
- [x] Verify the frontend loads without console errors

## Phase 2: Data Layer
- [x] Implement `PricePoint` and `FundamentalsData` dataclasses in `backend/data/base_fetcher.py`
- [x] Implement the `BaseDataFetcher` abstract interface with all 8 required methods
- [x] Implement `YFinanceFetcher.fetch_historical_ohlcv`
- [x] Implement `YFinanceFetcher.fetch_fundamentals`
- [x] Implement `YFinanceFetcher.fetch_market_index`
- [x] Implement `YFinanceFetcher.fetch_currency_pair`
- [x] Implement `YFinanceFetcher.get_latest_price`
- [x] Implement `YFinanceFetcher.is_market_open`
- [x] Implement `YFinanceFetcher.start_live_stream` with 15-second daemon-thread polling
- [x] Implement `YFinanceFetcher.stop_live_stream`
- [x] Implement `ZerodhaFetcher` as a documented stub with exact endpoints, auth flow, and env var requirements
- [x] Implement `AngelOneFetcher` as a documented stub with exact endpoints, auth flow, TOTP notes, and env var requirements
- [x] Implement the `get_fetcher()` factory as the only provider-selection boundary
- [x] Implement `DailyAligner`
- [x] Implement `QuarterlyAligner`
- [x] Implement `MinMaxNormalizer`
- [x] Implement `DataCache`
- [x] Wire `/data/fetch/{stock_id}`
- [x] Wire `/data/fetch-all`
- [x] Wire `/data/market-data/{stock_id}`
- [x] Verify `/data/market-data/RELIANCE` returns all 5 signal tracks
- [x] Verify revenue and profit remain quarterly in the response

## Phase 3: Signal Processing
- [x] Implement `BaseTransform`
- [x] Implement `STFTTransform` using `scipy.signal.stft`
- [x] Implement `CWTTransform` using `pywt.cwt`
- [x] Implement `HHTTransform` using `PyEMD`
- [x] Implement the transform registry/factory
- [x] Implement `SpectrogramGenerator` returning PNG bytes and JSON frame data
- [x] Implement `FFTVisualizer`
- [x] Wire `/signal/spectrogram/{stock_id}`
- [x] Wire `/signal/fft/{stock_id}`
- [x] Wire `/signal/stft-frames/{stock_id}`
- [x] Verify `/signal/spectrogram/RELIANCE` returns a valid PNG heatmap
- [x] Verify `/signal/fft/RELIANCE` returns frequency and amplitude arrays
- [x] Verify `/signal/stft-frames/RELIANCE` returns frame objects with `segment` and `fft_column`

## Phase 4: Model Layer
- [x] Implement `BaseModel`
- [x] Implement `PerStockCNN`
- [x] Implement `UnifiedCNN`
- [x] Implement `UnifiedCNNWithEmbeddings`
- [x] Implement `ModelRegistry`
- [x] Handle missing `.pth` files with the required `model_not_trained` error response
- [x] Add a smoke-test `__main__` block to each model file
- [x] Verify all three model classes import cleanly
- [x] Verify each model runs a forward pass on a random tensor
- [x] Verify each model file passes its direct smoke test

## Phase 5: Training Pipeline
- [x] Write the dataset-builder indexing plan before implementation
- [x] Implement `DatasetBuilder` with chronological train/val/test splits
- [x] Verify the test split timestamps are all later than the training split timestamps
- [x] Implement `TrainLoop` with MSE loss, Adam, checkpointing, and per-epoch callbacks
- [x] Implement `Evaluator` with MSE, RMSE, MAE, MAPE, and directional accuracy
- [x] Implement `NotebookGenerator` using Jinja2 templates
- [x] Inject all `stocks.json` parameters into generated notebooks
- [x] Verify generated notebooks are Colab-runnable without manual edits
- [x] Verify `DatasetBuilder` on RELIANCE shows zero overlap between train and test timestamps

## Phase 6: Retraining System
- [x] Implement `scheduler.py` with APScheduler on the asyncio loop
- [x] Implement `DriftDetector`
- [x] Implement `RetrainWorker`
- [x] Write retraining history to `retrain_log.json`
- [x] Wire `POST /retraining/trigger/{stock_id}`
- [x] Wire `POST /retraining/trigger-all`
- [x] Wire `GET /retraining/status`
- [x] Wire `GET /retraining/logs`
- [x] Verify triggering retraining writes a full log entry
- [x] Verify `GET /retraining/logs` returns the new entry

## Phase 7: Colab Notebook Generator
- [x] Create `per_stock_template.ipynb.j2`
- [x] Create `unified_template.ipynb.j2`
- [x] Implement notebook generation API download behavior
- [x] Verify generated notebooks are valid JSON
- [x] Verify all Jinja2 substitutions are rendered
- [x] Verify no template tags remain in the generated notebook

## Phase 8: FastAPI Route Wiring
- [x] Add Pydantic response models for all non-streaming endpoints
- [x] Ensure all routes read from `request.app.state.config`
- [x] Return `404` for unknown stocks
- [x] Return `422` for invalid params
- [x] Return `503` when a model is not trained
- [x] Implement structured error responses with `error`, `detail`, and `hint`
- [x] Implement `/live/stream/{stock_id}` as SSE with market-open handling
- [x] Implement `/training/progress` as SSE
- [x] Verify every endpoint from `/docs` returns the correct shape without `500` errors
- [x] Run `flake8 backend/ --max-line-length=100`
- [x] Run `mypy backend/ --ignore-missing-imports`
- [x] Fix all backend lint/type errors

## Phase 9: Frontend Scaffolding
- [x] Document the frontend state/layout decisions in a top-of-file comment block in `App.tsx`
- [x] Create typed `stocksConfig.ts` from the shared config
- [x] Implement strict TypeScript route scaffolding with lazy-loaded pages
- [x] Implement the theme system in `src/hooks/useTheme.ts`
- [x] Add semantic Tailwind color tokens for dark and light mode
- [x] Implement the sidebar, navbar, and top-level layout shell
- [x] Ensure the stock tabs are config-driven from `activeStocks`
- [x] Verify `npm run dev` starts cleanly
- [x] Verify all 7 frontend routes resolve
- [x] Verify the dark-mode toggle works
- [x] Verify the sidebar highlights the active route

## Phase 10: Frontend Data Charts
- [x] Implement `StockSelector`
- [x] Implement `ExchangeBadge`
- [x] Implement `StockPriceChart`
- [x] Implement `RevenueChart`
- [x] Implement `ProfitChart`
- [x] Implement `MarketIndexChart`
- [x] Implement `USDINRChart`
- [x] Implement `getChartColors(theme)` utility
- [x] Add loading, error, retry, and empty states for all chart components
- [x] Sync the time-range selector across the 3 daily charts
- [x] Verify `/stock/RELIANCE` renders all 5 charts with live backend data
- [x] Verify stock tab switching updates the displayed stock data

## Phase 11: Signal Analysis Page
- [x] Implement the frequency spectrum bar chart with annotated zones
- [x] Implement the D3 spectrogram heatmap with viridis scale, axes, clip path, and tooltip
- [x] Implement the transform selector toggle
- [x] Implement the parameter explorer sliders with `H < L` enforcement
- [x] Add debounced preview updates for spectrogram parameter changes
- [x] Verify the transform toggle updates the heatmap
- [x] Verify slider changes update the preview after debounce
- [x] Verify heatmap cell hover shows time, frequency, and energy

## Phase 12: Live Testing Page
- [x] Implement `useLiveMarket` with EventSource lifecycle cleanup
- [x] Add exponential-backoff reconnection with a max of 3 attempts
- [x] Implement the live prediction chart
- [x] Implement the 4 live metric cards
- [x] Implement the last-10-predictions table
- [x] Implement the closed-market fallback with countdown timer
- [ ] Verify SSE connects during market hours
- [x] Verify countdown mode renders correctly outside market hours

## Phase 13: How It Works Page
- [x] Design and document the `idle | playing | paused | stepping` state machine
- [x] Fetch STFT frame data once on mount
- [x] Implement Panel 1 raw signal animation
- [x] Implement Panel 2 sliding-window animation
- [x] Implement Panel 3 FFT column animation
- [x] Implement Panel 4 spectrogram build animation
- [x] Implement Panel 5 CNN forward-pass animation
- [x] Implement Panel 6 prediction output animation
- [x] Implement rewind, play/pause, step, speed, and progress-dot controls
- [x] Respect `prefers-reduced-motion`
- [x] Verify all 6 panels animate together from the same frame index

## Phase 14: Model Comparison and Training Pages
- [x] Implement the model-variant explainer cards
- [x] Implement `ModelComparisonChart`
- [x] Implement the D3 radar/spider chart
- [x] Implement the t-SNE embedding scatter plot
- [x] Implement the notebook-generation download button
- [x] Implement the trigger-retraining flow with confirmation and progress SSE
- [x] Implement `LossCurveChart`
- [x] Implement `RetrainingTimeline`
- [x] Implement `DriftChart`
- [x] Verify notebook downloads produce a `.ipynb` file
- [x] Verify triggering retraining adds a new timeline entry on completion

## Phase 15: Dashboard and Polish
- [x] Implement the dashboard metric cards for all 5 stocks
- [x] Implement the multi-line normalized comparison chart
- [x] Implement the market-status summary section
- [x] Ensure all pages have friendly API-down error states with retry
- [x] Lazy-load all page components
- [x] Defer STFT-frame fetching until the How It Works page is visited
- [x] Write the Playwright test covering dashboard, stock detail, signal analysis, theme toggle, and live page rendering
- [x] Run `npm run type-check`
- [x] Run `npm run lint`
- [x] Fix all frontend lint and type warnings/errors
- [x] Run the final production-code audit for dead code, `console.log`, hardcoded values, and async error handling gaps
- [x] Manually verify all 7 pages in dark and light mode
- [x] Verify Playwright tests pass

## Phase 16: Prompt Alignment
- [x] Add a shared root `.env` plus backend/frontend copies for local runtime parity
- [x] Extend `stocks.json` with `local_training`, `retrain_on_startup`, and per-stock `color`
- [x] Load backend runtime settings and CORS origins from environment values
- [x] Check startup training flags and launch the configured startup action
- [x] Remove hardcoded frontend API/test URLs in favor of env-driven configuration
- [x] Remove hardcoded frontend stock IDs from Playwright checks
- [x] Create `ASSIGNMENT_ALIGNMENT.md`

## Phase 17: Runtime and Visualization Hardening
- [x] Add a CPU-only backend runtime requirements file for local inference without CUDA wheel downloads
- [x] Point Docker Compose backend startup at the lighter runtime requirements
- [x] Switch the frontend container from Alpine/npm-install to a more stable slim/npm-ci workflow
- [x] Reduce frontend bind mounts to the files each service actually needs
- [x] Widen the frontend shell and tighten chart-card overflow handling
- [x] Promote the stock-detail page to a chart-first layout with expanded hero graphs and extra comparison charts
- [x] Promote the signal-analysis page to a heatmap-first layout with extra derived timeline graphs
- [x] Re-run frontend type-check, lint, and production build
- [x] Verify the frontend Docker install path with the updated container workflow
- [x] Verify the backend runtime requirements install cleanly in a fresh Python 3.12 slim container

## Phase 18: Beginner UX and Workspace Cleanup
- [x] Add a root `.gitignore` for generated caches, logs, build outputs, and temporary browser artifacts
- [x] Remove stale caches, logs, pids, screenshots, and generated build/test folders from the workspace
- [x] Add a shared hover-help component for inline guidance on interactive surfaces
- [x] Add a reusable first-time user guide card for major pages
- [x] Add hints or hover titles across navigation, selectors, badges, metric cards, chart controls, and retry actions
- [x] Improve first-run page flow for dashboard, stock detail, signal analysis, live testing, model comparison, training, and explainer pages
- [x] Re-run frontend type-check, lint, and production build after the UX pass
- [x] Re-run `python -m compileall backend` after the UX pass

## Phase 19: Documentation Refresh
- [x] Rewrite `README.md` as the main quick-start and docs index
- [x] Create `DOCUMENTATION.md` as the full project manual
- [x] Create `API_REFERENCE.md` for the backend route surface
- [x] Refresh `ARCHITECTURE.md` so it reflects the current implementation rather than the early scaffold state
- [x] Link the updated docs together clearly
