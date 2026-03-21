# Assignment Alignment

This audit maps the assignment requirements called out in `finspectra_spec.md` and the Phase 16 antigravity prompt to the implemented FinSpectra codebase.

## Task Coverage

| Status | Assignment Requirement | Implementation |
|---|---|---|
| Done | Task 1: collect data for 3+ companies, align to a common scale, normalize | `backend/data/` provides the fetchers, aligners, and reusable normalizers; `stocks.json` currently enables 5 stocks |
| Done | Task 2: Fourier Transform and spectrogram-based signal processing | `backend/signal_processing/` implements FFT, STFT, CWT, and HHT; the Signal Analysis page visualizes FFT and spectrogram outputs |
| Done | Task 3: CNN model development and future-price prediction | `backend/models/`, `backend/training/`, and notebook generation support per-stock, unified, and embedding-aware CNN variants |
| Done | Task 4: analysis and evaluation | `backend/training/evaluator.py` computes MSE, RMSE, MAE, MAPE, and directional accuracy; the Training and Model Comparison pages surface saved metrics and histories |

## Required Figures

| Status | Figure | Implementation |
|---|---|---|
| Done | Time series plot | Stock Detail page with the stock-price chart |
| Done | Frequency spectrum | Signal Analysis page frequency-spectrum chart |
| Done | Spectrogram | Signal Analysis page spectrogram heatmap |
| Done | CNN architecture diagram | How It Works page CNN forward-pass panel |

## Additional Signal Charts

| Status | Figure | Implementation |
|---|---|---|
| Done | Stock price vs time | `frontend/src/components/charts/StockPriceChart.tsx` |
| Done | Revenue vs quarter | `frontend/src/components/charts/RevenueChart.tsx` |
| Done | Profit vs quarter | `frontend/src/components/charts/ProfitChart.tsx` |
| Done | Market index vs time | `frontend/src/components/charts/MarketIndexChart.tsx` |
| Done | USD-INR exchange rate vs time | `frontend/src/components/charts/USDINRChart.tsx` |

## Submission Notes

| Topic | Notes |
|---|---|
| Active dataset scope | The shared config currently enables 5 stocks, exceeding the assignment minimum |
| Core metrics | MSE is preserved as the primary evaluation metric, with RMSE, MAE, MAPE, and directional accuracy included as supporting diagnostics |
| Model comparison | The project includes per-stock, unified, and unified-with-embeddings variants so the assignment comparison discussion can be grounded in artifacts |
| Training workflow | Both Colab-generated notebooks and backend-driven local training are available |
| Remaining verification-only gap | The open-market SSE stream still needs to be checked during an actual live NSE session |
