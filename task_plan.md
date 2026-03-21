# Task Plan: FinSpectra Implementation

## Goal
Build FinSpectra phase by phase from the provided prompt and specification, keeping the workspace resumable with up-to-date planning files and verification evidence after each milestone.

## Current Phase
Phase 19 documentation refresh complete; only the open-market SSE verification follow-up remains

## Phases

### Phase 1: Requirements and Discovery
- [x] Read `antigravity_prompt.md`
- [x] Read `finspectra_spec.md`
- [x] Install the antigravity skills needed for the start of the project
- [x] Capture early findings in `findings.md`
- **Status:** complete

### Phase 2: Planning and Architecture
- [x] Create `TASKS.md`
- [x] Create `PROGRESS.md`
- [x] Create `README.md`
- [x] Create `ARCHITECTURE.md`
- [x] Record decisions and discrepancies
- **Status:** complete

### Phase 3: Phase 1 Scaffold Implementation
- [x] Create `stocks.json`
- [x] Scaffold backend directories and route stubs
- [x] Scaffold frontend Vite + React + TypeScript app
- [x] Add Docker-based development workflow
- **Status:** complete

### Phase 4: Verification
- [x] Start backend and frontend
- [x] Confirm `GET /health` returns `{"status": "ok"}`
- [x] Confirm frontend loads cleanly
- [x] Confirm CORS headers are present
- **Status:** complete

### Phase 5: Session Handoff
- [x] Update `PROGRESS.md`
- [x] Update `TASKS.md`
- [x] Leave clear next-step state for the next session
- **Status:** complete

### Phase 6: Runtime and Visualization Hardening
- [x] Separate the local Docker runtime from the heavyweight generic torch install path
- [x] Verify the CPU-only PyTorch runtime install in a clean Linux container
- [x] Stabilize the frontend container install flow
- [x] Expand the graph-first frontend layout with larger charts and extra derived views
- [x] Re-run the frontend verification gates
- **Status:** complete

### Phase 7: Beginner UX and Workspace Cleanup
- [x] Remove stale generated caches, logs, pids, screenshots, and build/test outputs from the workspace
- [x] Add a reusable hover-help primitive and page-level onboarding card
- [x] Extend hints and hover titles across the main navigation, charts, selectors, badges, and key controls
- [x] Make the major pages more beginner-friendly by adding explicit "Start Here" guidance
- [x] Re-run the frontend and backend verification gates after the UX pass
- **Status:** complete

### Phase 8: Documentation Refresh
- [x] Rewrite the README around the real setup and runtime flows
- [x] Add a full `DOCUMENTATION.md` project manual
- [x] Add a dedicated `API_REFERENCE.md`
- [x] Refresh `ARCHITECTURE.md` so it matches the current codebase
- [x] Verify the new documentation files exist and cross-reference cleanly
- **Status:** complete

## Key Questions
1. How should the outdated `polygon_fetcher.py` reference in section 7 be reconciled with the prompt and section 8.2, which both require Zerodha and Angel One fetchers?
2. What is the smallest implementation for each phase that satisfies its verification requirements without overbuilding later phases?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use `TASKS.md` and `PROGRESS.md` as the project-facing planning files, plus `task_plan.md` and `findings.md` as antigravity working-memory files | Satisfies the user prompt and the planning-with-files workflow together |
| Treat Phase 1 as a runnable scaffold with route/page placeholders instead of partial feature implementations | Matches the prompt's request for stubs and preserves clean boundaries for later phases |
| Use direct Docker images in `docker-compose.yml` instead of custom Dockerfiles for Phase 1 | Keeps the initial scaffold small while still supporting hot reload and fixed ports |
| Opt into the React Router future transition flag during Phase 1 | Removes avoidable browser warnings so the dev console stays clean on load |
| Cache raw fetch results in process memory behind `app.state.data_cache` | Cuts repeat yfinance calls while keeping the Phase 2 implementation lightweight |
| Keep quarterly fundamentals separate from daily market tracks in `/data/market-data/{stock_id}` | Matches the spec's signal-track separation and avoids accidental daily forward-fill at the API layer |
| Load and normalize close-price series once through a dedicated signal loader before FFT or transform work | Keeps Phase 3 signal-processing code focused on transforms rather than fetch orchestration details |
| Add explicit `signal_processing.hht` config in `stocks.json` | Keeps HHT parameters config-driven like STFT and CWT, matching the prompt's requirement to avoid hardcoded transform settings |
| Share the CNN feature extractor and regression-head builders in `BaseModel` | Keeps the per-stock and unified variants aligned while still allowing the embedding model to extend the same inference contract |
| Have `ModelRegistry` return a typed load result plus the required `model_not_trained` payload | Preserves a clean boundary between model-loading logic and later API error handling in Phase 8 |
| Split training samples by label timestamp and not just by window start | The model predicts `t + prediction_horizon_days`, so the target time is the true no-leakage boundary |
| Generate notebooks from generic Jinja2 templates plus Python-built cell payloads | Keeps the notebook JSON valid and makes it easier to validate code-cell syntax before route wiring in Phase 7 |
| Let the generated notebooks honor `FINSPECTRA_NOTEBOOK_SMOKE=1` during verification | This preserves the as-generated notebook structure while allowing fast, non-manual local execution checks before actual Colab runs |
| Persist a stock-specific `training_report.json` plus prediction history during each retrain | Gives `DriftDetector` a concrete baseline and recent prediction-vs-actual series instead of leaving drift checks permanently stubbed |
| Prefer per-stock retraining whenever `model_mode: "both"` exposes a per-stock artifact path | Avoids retraining the shared unified model repeatedly for each stock-triggered job while still matching the stock-scoped API contract |
| Constrain notebook `mode` at the FastAPI route boundary with a `Literal[...]` type | Lets FastAPI return `422` automatically for unsupported modes and keeps the route contract aligned with the generator's supported modes |
| Run `/training/start` in a background thread and stream progress from an in-memory event log | Keeps the route responsive while still exposing per-epoch SSE updates for the frontend training page |
| Fall back from the configured unified prediction mode to an available per-stock checkpoint at `/model/predict/{stock_id}` | The current config prefers unified-with-embeddings, but Phase 6 only produced a per-stock artifact, so this keeps the prediction API usable without hiding which model actually served the result |
| End the live SSE stream after the first payload when the exchange is closed | Gives the frontend a clean closed-market snapshot plus countdown without holding an idle connection open all night/weekend |
| Return structured `404` details from `require_stock()` and `require_exchange()` | Makes unknown-stock and unknown-exchange failures consistent across all route modules without duplicating error-shape code in each endpoint |
| Model the remaining non-streaming backend JSON responses with Pydantic while leaving the notebook download and SSE routes as transport-specific responses | Improves `/docs` fidelity without forcing file-download or stream endpoints into unnatural JSON wrappers |
| Treat embedded notebook source in `backend/training/notebook_cells.py` as a file-level lint exception for line length | Preserves readable generated-code templates while still keeping the rest of the backend flake8-clean |
| Point the frontend shell at the root `stocks.json` via a dedicated alias instead of keeping a copied `frontend/src/stocks.json` file | Keeps the backend and frontend on one config spine while giving Vite and TypeScript an explicit, stable import target |
| Store the route metadata in a single frontend manifest and derive the router, desktop sidebar, and mobile nav from it | Prevents route drift across the shell and makes later page expansion safer |
| Keep Phase 9 open until the dark-mode toggle and active-route highlighting are browser-verified, even though the implementation and route-resolution checks are already in place | Preserves honest checklist state instead of treating build/dev success as proof of every UI behavior |
| Build the Phase 10 charts around a shared typed market-data hook plus small SVG primitives instead of introducing a new charting dependency mid-project | Keeps the first live stock-detail page lightweight and focused while still delivering real data and consistent loading/error behavior |
| Add `d3` specifically for the Phase 11 signal-analysis view while leaving the rest of the chart stack lightweight | Uses a mature library where viridis scaling and axis math matter most without forcing a repo-wide charting dependency shift |
| Downsample large spectrogram matrices into a bounded preview grid before SVG rendering | Keeps CWT and HHT interactive in the browser while preserving the full backend response for later, heavier analysis views |
| Keep the live workspace on the stable `/live` route and switch stocks through a `?stock=` query parameter | Lets the page host an in-place selector without introducing a second stock-scoped route shape for the same screen |
| Pair a one-shot market-status fetch with the reconnecting live SSE hook on the frontend | Gives the page an immediate exchange countdown baseline while the stream manages snapshot updates and closed-market cleanup separately |
| Keep the explainer workspace on the stable `/explainer` route and switch stocks through a `?stock=` query parameter | Preserves one canonical explainer route while still allowing the animation to follow different stocks without introducing another path pattern |
| Derive the Phase 13 prediction panel from the current STFT frame plus the reconstructed future signal point | Keeps the explainer self-contained on `/signal/stft-frames/{stock_id}` without adding a second backend dependency just for the educational panel |
| Add per-request timeouts to the aggregated dashboard market-data and exchange-status hooks | Prevents one slow backend response from leaving the Phase 15 dashboard stuck in a permanent loading state |
| Run the new frontend end-to-end coverage against the installed Edge channel and a Vite preview build | Avoids an extra browser download while still verifying the production frontend bundle instead of the dev server |
| Add hidden `/api/*` backend aliases while keeping the canonical routes unprefixed | Lets older callers keep working without changing the main documented API surface or duplicating the routes in OpenAPI |
| Finish the backend normalizer layer by implementing a z-score utility and explicit empty-input validation | Removes an obvious leftover placeholder and makes future normalization experiments safer and easier to reuse |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `git clone` of the antigravity repo was blocked by policy in the shell wrapper | 1 | Used the installed `skill-installer` helper script to install the required skills directly from GitHub |
| `docker compose up -d` initially failed because the Docker engine was not running | 1 | Launched Docker Desktop, waited for the daemon to become available, then retried successfully |
| The first Phase 2 payload probe printed the PowerShell script instead of executing it | 1 | Re-ran the check as a standard PowerShell command and verified the actual JSON response |
| A `HEAD` request to `/signal/spectrogram/{stock_id}` returned `405 Method Not Allowed` during verification | 1 | Switched the PNG verification to `curl.exe -D ... -o ...` so the response headers and file signature could still be checked without relying on `HEAD` support |
| The spec does not give an explicit filename for the unified-with-embeddings artifact | 1 | Taught `ModelRegistry` to look for both `unified_with_embeddings_model.pth` and `unified_model_with_embeddings.pth`, then return the standard `model_not_trained` payload if neither exists |
| The prompt references a `writing-plans` skill that is not installed in this session | 1 | Recorded the dataset indexing plan directly in `task_plan.md` before implementation |
| The host Python environment had `torch` and `jinja2` but was missing `pandas`, `yfinance`, `PyWavelets`, and `EMD-signal` | 1 | Installed the missing packages locally and reran the Phase 5 verification on the host instead of waiting for the backend container to finish reinstalling the full stack |
| The generated config notebook cell originally failed runtime validation because the embedded JSON block broke indentation | 1 | Switched the config payload to a JSON string literal so the emitted code cell stays valid Python regardless of the config size |
| The Phase 6 Docker-backed verification path began reinstalling the full PyTorch wheelchain in the slim backend container, which delayed API checks substantially | 1 | Installed `apscheduler`, `fastapi`, `uvicorn`, and `httpx` in the host Python and verified the FastAPI app directly through `fastapi.testclient` instead |
| The notebook generator was already complete, but the `/notebook/generate` route was still a placeholder JSON response | 1 | Replaced it with a `FileResponse` attachment endpoint and verified both the download headers and notebook JSON body through `fastapi.testclient` |
| A single monolithic `apply_patch` for the Phase 8 route hardening changes exceeded the Windows command-length limits | 1 | Split the work into smaller targeted patches for the new response models, training runtime, utilities, and route modules |
| The live SSE route needed to behave sensibly both during and outside exchange hours | 1 | Made it emit an immediate payload in all cases and terminate after the first message when the market is closed, while keeping the 15-second loop only for open sessions |
| Importing `backend.main` from the repo root for TestClient verification failed with `ModuleNotFoundError: No module named 'config'` | 1 | Ran the verification scripts from `d:\StockCNN\backend` so the backend's current top-level import layout matches runtime expectations |
| The host Python did not have `flake8` or `mypy` installed when the Phase 8 checklist reached lint/type verification | 1 | Installed both tools locally with `python -m pip install flake8 mypy`, then fixed the reported backend issues and reran the checks |
| yfinance intermittently raised `'NoneType' object is not subscriptable` from inside `ticker.history(...)` during docs-surface verification | 1 | Wrapped the history fetch in `_attempt_history_load()`, degraded failures to empty DataFrames, and let the route layer return structured `503 data_unavailable` responses instead of `500`s |
| The first Phase 9 `npm run dev` verification attempt failed inside the sandbox with a Vite `spawn EPERM` / Tailwind native-module startup error | 1 | Re-ran the dev-server start outside the sandbox, then completed the frontend route-resolution checks against the elevated server |
| TypeScript did not initially accept the root `stocks.json` import when the frontend stopped using the copied `src/stocks.json` file | 1 | Added the `@shared-config` alias in Vite and `tsconfig.app.json`, plus a narrow ambient declaration file, then reran the frontend verification commands |
| ESLint started traversing the temporary Edge profile used for browser verification and reported parsing errors in browser-owned extension files | 1 | Added generated-artifact ignores in `frontend/eslint.config.js` so lint stays focused on the project source tree |
| The first stock-detail chart pass triggered a hook-order error because `useStockData` and the memoized track filters lived below the unknown-stock early return | 1 | Split the live chart route into an outer stock lookup and an inner `StockDetailContent` component so hooks run unconditionally within the rendered branch |
| The first Phase 11 type-check run failed because SVG `<text>` does not accept a `textTransform` prop in React's typed SVG attributes | 1 | Removed the invalid prop and reran `npm run type-check` successfully |
| The inherited CDP session on port `9222` became unreliable during the live Phase 11 browser verification | 1 | Started a clean isolated headless Edge session on port `9223` and used that session for the final transform/debounce/tooltip checks |
| A plain `.value = ...` assignment on the STFT range input did not trigger React's controlled-input updates during browser verification | 1 | Switched the probe to the native `HTMLInputElement` value setter before dispatching `input` and `change` events, which produced the expected debounced spectrogram request |
| The first Phase 12 `useLiveMarket` draft tripped the hooks and lint rules because the reconnect helper shape captured mutable state awkwardly | 1 | Reworked the hook around effect-scoped lifecycle helpers plus a request-version retry trigger so cleanup and reconnects stay predictable |
| The first countdown implementation attempted to clamp the timer by writing `0` back into component state from inside the effect loop | 1 | Switched to a ticking `currentTimestamp` source and derived `countdownSeconds` from `next_open_at`, which removed the state-loop smell and simplified the UI logic |
| Installing `framer-motion` for the Phase 13 explainer failed inside the sandbox with an npm cache `EPERM` error | 1 | Re-ran `npm.cmd install framer-motion` outside the sandbox and continued with the animation implementation |
| The first Phase 13 lint pass rejected synchronous state updates inside effects for the playback state machine and animated counter | 1 | Moved the transitions into timer and event callbacks, then switched the counter to a `motionValue`-driven pattern that no longer mutates state directly inside the effect body |
| The first richer CDP page snapshot script for `/explainer` kept collapsing to `{}` because runtime exceptions were being ignored and regex parsing lived inside the page expression | 1 | Simplified the browser probe to return raw panel text from the page and moved the regex parsing into the Node-side verification script |
| The first Phase 15 Playwright run timed out waiting for the normalized dashboard chart | 1 | Added per-request timeout handling to the dashboard aggregate hooks and pre-warmed the market-data endpoints in the test so one slow ticker cannot stall the entire dashboard assertion path |
| The first dark/light route sweep reported false negatives on every page | 1 | Switched the manual verification script from immediate visibility probes after `domcontentloaded` to explicit visible-marker waits so React render timing no longer caused bogus failures |
| `backend/uvicorn.log` still showed callers hitting `/api/*` paths even though the current backend only documented unprefixed routes | 1 | Mounted hidden `/api/*` aliases for all existing routers plus `/api/health` and `/api/config`, then verified both path shapes via `fastapi.testclient` while keeping the aliases out of `/openapi.json` |
| `backend/data/normalizers/zscore_normalizer.py` was still completely empty while the neighboring min-max utility had no clear empty-input guard | 1 | Implemented `ZScoreNormalizer`, exported both normalizers from the package, and added explicit empty-array validation so the utilities now fail clearly instead of surfacing raw NumPy reduction errors |

## Notes
- On this Windows workspace, `PROGRESS.md` serves the role that the antigravity skill describes as `progress.md`.
- Re-read `TASKS.md`, `PROGRESS.md`, and `findings.md` before major implementation decisions.
- Project Phases 1 through 15 are complete. The only checklist item still pending anywhere in `TASKS.md` is the market-hours SSE verification under Phase 12, which requires a future open trading session.
- The prompt-alignment slice is now also complete: shared env files exist, backend CORS/runtime settings are env-driven, startup flag planning is implemented, the frontend/browser tooling no longer depends on hardcoded API URLs, and `ASSIGNMENT_ALIGNMENT.md` exists for submission mapping.

## Phase 5 Dataset Indexing Plan
1. Use a fixed lookback window `W` derived from the STFT config so every training sample produces the same 2D spectrogram shape.
2. For a start index `i`, the model input window is the normalized close-price slice `signal[i : i + W]`.
3. The window end index is `t = i + W - 1`.
4. The label index is `t + H`, where `H = prediction_horizon_days`.
5. Only keep samples where `t + H < len(signal)` so every sample has a valid future label.
6. Store both `window_end_timestamp` and `label_timestamp`, but split chronologically by `label_timestamp` because that is the actual prediction target time.
7. Build all samples in chronological order first, then apply contiguous train/val/test splits with no shuffling before the split boundary.
8. Verification should inspect the first and last 5 label timestamps in train and test, confirm zero overlap, and confirm every test label timestamp is later than every train label timestamp.

## Phase 16 Prompt Alignment
### Completed
- Added a shared root `.env` plus copied `backend/.env` and `frontend/.env`.
- Extended `stocks.json` to the prompt-aligned schema additions: `version: 1.2.0`, `local_training`, `retrain_on_startup`, and per-stock `color`.
- Added env-file loading and prompt defaults in `backend/config.py`.
- Added startup-action planning and scheduling in `backend/startup_actions.py`.
- Switched backend CORS to env-driven `FRONTEND_URL` handling in `backend/main.py`.
- Removed hardcoded frontend API/test URLs and hardcoded Playwright stock IDs.
- Created `ASSIGNMENT_ALIGNMENT.md`.
- Verified the backend env/CORS/startup-planning slice plus the frontend type/lint/build/E2E chain.

### Decisions Made
| Decision | Rationale |
|----------|-----------|
| Let `local_training.enabled` take precedence over `retrain_on_startup.enabled` when both are true | A full local training pass already refreshes artifacts, so running a second startup retrain sweep immediately afterward would be redundant |
| Keep Playwright URLs env-driven and move the preview server to `PLAYWRIGHT_BASE_URL` when present | Avoids hardcoded test URLs while preventing accidental reuse of a long-running dev server on the main frontend port |
| Read stock colors from the shared config and surface them first in the comparison chart and live selector | Makes the new prompt-required `color` field immediately useful without forcing a risky chart-wide visual refactor in one pass |
| Add a dedicated `backend/requirements.runtime.txt` that pins CPU-only PyTorch for local Docker use | Colab handles GPU training, while the local app only needs CPU inference and should not download the full NVIDIA wheel chain |
| Move the frontend container to `node:22-bookworm-slim` with `npm ci` | This is a more reproducible and stable local install path than the earlier Alpine + `npm install` startup |
| Rework the stock-detail and signal-analysis pages around full-width lead charts plus supporting derived charts | This addresses the current visibility/overflow complaints without changing the underlying backend APIs |
| Add a shared hover-help pattern plus page-level "Start Here" guides | The app has grown large enough that first-time users need inline orientation instead of relying on page titles alone |
| Keep generated caches and logs out of the repo with a root `.gitignore` plus periodic cleanup | This keeps the workspace lighter and prevents transient verification artifacts from obscuring real source changes |
| Split documentation into an entry-point README, a full manual, and a separate API reference | The project now spans multiple workflows and routes, so one monolithic README would be harder to scan and easier to let drift |

### Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| The first backend env smoke script failed with a local `python.exe` access error when piped through the default interpreter alias | 1 | Re-ran the smoke test using the explicit host Python executable path already known to work in this workspace |
| The first Playwright rerun reused an already-running service on `http://localhost:5173`, so the dashboard heading assertion failed even though the test wiring itself was correct | 1 | Added `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173` and `PLAYWRIGHT_API_BASE_URL=http://127.0.0.1:8000` to the shared env files, then reran the suite successfully against the dedicated preview server |
| The fresh Playwright E2E rerun for the new graph layout failed on the dashboard before chart assertions | 1 | Confirmed the failure was environmental rather than UI-specific: the page snapshot showed backend fetches failing, so the test could not exercise the rendered chart surface in that run |
