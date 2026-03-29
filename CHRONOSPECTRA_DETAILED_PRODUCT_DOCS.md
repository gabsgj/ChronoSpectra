# ChronoSpectra: Comprehensive Product Documentation

## 1. Executive Summary and Product Vision
ChronoSpectra (internal project name: StockCNN) is a cutting-edge algorithmic forecasting platform explicitly designed to bridge the gap between advanced digital signal processing (DSP) and modern deep learning for the financial markets. Traditional quantitative analysis primarily relies on sequential time-series modeling (such as ARIMA, LSTMs, and Transformers). ChronoSpectra introduces a paradigm shift by treating market multi-variate time-series as **spectrograms**—two-dimensional visual representations of frequencies over time. 

By utilizing Short-Time Fourier Transforms (STFT), Continuous Wavelet Transforms (CWT), and Hilbert-Huang Transforms (HHT), ChronoSpectra converts price action, macroeconomic indicators (like USD/INR), market indices, and quarterly fundamental metrics (Revenue and Profit) into rich, topological 2D images. These spectrograms are subsequently consumed by tailored Convolutional Neural Networks (CNNs) originally pioneered for computer vision tasks. 

Through this synthesis of Signal Processing and Deep Convolutional feature extraction, ChronoSpectra captures both short-term volatility textures and long-term cyclic macro-trends that conventional recurrent models inherently obscure.

This document serves as an exhaustive reference manual covering the platform’s business logic, feature sets, mathematical formulations, application architecture, deployment environments, and MLOps pipelines.

---

## 2. Core Capabilities & Key Features

### 2.1 Multimodal Feature Extraction and Alignment
Financial data is inherently chaotic, multi-scale, and asynchronous. ChronoSpectra eliminates this friction via an automated `FeatureSeriesLoader` and alignment pipeline. 
* **Daily Tick Alignment**: Synchronizes individual asset OHLCV with broader market indices (e.g., ^NSEI, ^BSESN) and Forex pairs (USD/INR).
* **Quarterly Forward/Backward Fill**: Ingests and smooths sparse fundamental metrics (Quarterly Profit and Revenue) into continuous daily feature tracks.
* **Auto-adjusted Price Handling**: Mitigates artificial technical breakdowns caused by corporate actions (splits and bonuses) via fully adjusted historical price ingestion.

### 2.2 Spectrogram Convolution Modeling (CNN)
* **Image-Based Forecasting**: Instead of passing discrete numbers to the model, normalized sliding windows of data (e.g., 256 days of history) are converted to multiple image channels.
* **Multi-Channel Stack**: Just as an RGB image has Red, Green, and Blue channels, a ChronoSpectra input tensor comprises `[Price, Index, USD_INR, Revenue, Profit]` spectrogram channels.
* **Flexible Operating Modes**: Supports `per_stock` mode (hyper-specialized tiny CNNs for individual assets) and `unified_with_embeddings` (a massive generalized CNN employing categorical stock embeddings to map structural similarities between different equities).

### 2.3 Live Extrapolation and Real-time Dashboard
* **Dynamic Spread Bands**: Projects forecasting trends forward along a user-configured horizon (e.g., 5-day horizon).
* **Live Overlay**: The frontend React dashboard renders the last known closing sessions and superimposes the CNN prediction directly over the interactive chart.
* **Real-time Ingestion**: Pluggable architectures supporting `yfinance`, with extensible adapters for `zerodha`, `polygon`, and `angel_one`.

### 2.4 Automated MLOps and Drift Detection
* **Retraining Pipeline**: The system autonomously detects when model accuracy slips past a designated standard deviation threshold (Concept Drift).
* **Jupyter Interoperability**: Generates executable Jupyter notebooks on the fly containing all necessary hyperparameters, allowing data scientists to spin up training jobs in Google Colab, then import the resulting `.pth` checkpoints and `scaler.pkl` files.
* **Local Backend Training**: Contains a background worker allowing local, headless training and validation of the CNN on the deployment server without external intervention.

---

## 3. Target Audience & Use Cases

* **Quantitative Researchers & Data Scientists**: A playground to test esoteric spectral analysis parameters (Window Functions, Hop Sizes, Morlet Wavelets) directly mapped into an end-to-end PyTorch pipeline.
* **Algorithmic Traders & Risk Managers**: To be used as a supplementary confluence indicator for medium-term portfolio rebalancing (horizon-based forecasting), providing a degree of confidence and directional accuracy.
* **Hobbyist Developers**: Operating as a fully functional open-source blueprint demonstrating how to orchestrate cutting-edge React 18, FastAPI, and PyTorch in an isolated containerized ecosystem.

---

## 4. System Architecture Overview

ChronoSpectra adopts a highly decoupled, modern tech stack utilizing the robustness of Python on the backend and the reactivity of TypeScript on the frontend.

### 4.1 Architecture Diagram
The platform is bifurcated into two primary ecosystems:

**1. The Inference and Ingestion Engine (Backend)**
* **Framework**: FastAPI (Python 3.10+) 
* **Machine Learning**: PyTorch (`torch`, `torch.nn`)
* **DSP Processing**: SciPy (`scipy.signal.stft`), NumPy, Pandas
* **Cache Layer**: In-memory ephemeral caching to prevent API rate-limiting against providers.
* **Model Registry**: Disk-based persistent store mapping specific `stock_id` identifiers to scaling metadata (`scaler.pkl`) and PyTorch tensors (`.pth`).

**2. The Presentation Layer (Frontend)**
* **Framework**: React 18, Vite.
* **Language**: TypeScript (`strict` mode).
* **Styling**: Tailwind CSS.
* **Visualization**: Specialized HTML5 Canvas/SVG charting libraries adapted for real-time OHLCV and spread-band rendering.

---

## 5. AI & Machine Learning Pipeline Deep Dive

### 5.1 The Data Topography
The machine learning pipeline consumes configured horizons (e.g., 7 years of data) defined in `stocks.json`. 
Features undergo strict `MinMax` scaling bounded continuously to `[0, 1]` avoiding zero-variance divisions. Critically, to prevent look-ahead bias, scaling artifacts are strictly fitted against the **training** subset and frozen before valid/test evaluations.

### 5.2 Spectrogram Transformations
The user can seamlessly switch between transforming paradigms:

**Short-Time Fourier Transform (STFT)**
Utilized to extract the sinusoidal frequency and phase content of local sections of the asset over time. 
* *Mechanism*: A moving window (e.g., Hann window) multiplied across the signal, performing standard FFT. 
* *Tuning*: `window_length=32`, `hop_size=8`, `n_fft=64`. Maps the complex spectrum to energy amplitudes (`np.abs(spectrum) ** 2`).

**Continuous Wavelet Transform (CWT)** 
Better suited for non-stationary signals containing transient events (like market crashes or abrupt euphoric rallies).
* *Mechanism*: Scales and translates a mother wavelet (e.g., `morl` - Morlet).

**Hilbert-Huang Transform (HHT)**
Designed for nonlinear and non-stationary processes via Empirical Mode Decomposition (EMD) generating Intrinsic Mode Functions (IMFs).

### 5.3 Neural Network Topologies

All models inherit from `SingleHeadCNN` extending PyTorch's `nn.Module`. 

**Feature Extractor:**
```text
Conv2d (1/5 channels -> 16) + ReLU + MaxPool2d (2x2)
Conv2d (16 -> 32) + ReLU + MaxPool2d (2x2)
Conv2d (32 -> 64) + ReLU + AdaptiveAvgPool2d (4x4)
Flatten -> 1024 parameters
```

**Regressors:**
* **PerStockCNN**: Adds a simple deep dense linear head mapping `1024 -> 128 -> 1 (MSE Regression)`.
* **UnifiedCNNWithEmbeddings**: Concatenates a latent embedding representation of the specific categorical stock token. If `num_stocks=10`, a dense mapped vector of size `8` embeds unquantifiable ticker characteristics natively. `Concat(1024, 8) -> 128 -> 1`.

### 5.4 Training Operations & Evaluation Metrics
The loss function minimizes `MSELoss` utilizing the `Adam` optimizer.
Evaluation includes:
* **Root Mean Square Error (RMSE)**
* **Mean Absolute Percentage Error (MAPE)**
* **Directional Accuracy**: A custom metric calculating the percentage of times the model correctly predicts the structural sign (positive vs. negative return) against the reference raw price from the end of the lookback window.

---

## 6. Backend Modules Breakdown

### 6.1 `config.py` and `stocks.json`
The brain of the application. Dictates market hours (`America/New_York` vs `Asia/Kolkata`), lists the active roster of tickers, specifies retraining constraints, and stores hyperparameters for STFT/CWT. 

### 6.2 Routes (`/api/v1/`)
* `/live/{stock_id}`: Streams ongoing market pricing and requests hot-inferences from the cached PyTorch model.
* `/model/{stock_id}/predict`: The core endpoint executing the inference forward pass and returning a denormalized target.
* `/training/notebook/{stock_id}`: Transpiles backend configuration and current PyTorch class structures into an ephemeral `.ipynb` binary format, downloading it for the client.

### 6.3 Signal & Data Subsystem
* `yfinance_fetcher.py`: Manages network ingress, enforces `auto_adjust=True` to normalize historic splits, and conforms data types.
* `dataset_builder.py`: Orchestrates the `Lookback` -> `Feature Map` -> `Spectrogram` conversion securely during both training batch generation and live single-shot inferencing.

---

## 7. Frontend Architectural Details

### 7.1 Modern Component Tree
The UI is strictly modularized. Top-level contexts provide configuration states retrieved from the `stocks.json` payload, mapping vibrant UI colors (`#00D4AA` for Reliance, etc.) automatically.

### 7.2 Core Views
* **Dashboard / Grid**: High-level telemetry displaying current inferred directionality for all tracked equities.
* **Single Stock View**: Generates the interactive canvas. Allows the user to toggle through historical performances vs predictions and exposes the predicted `Spread Band` displaying model certainty limits.
* **MLOps Control Panel**: Exposes raw training telemetry (Loss curves, Epoch charts, Directional Accuracy), and provides UI buttons to trigger remote retraining or force artifact reloads.

---

## 8. Supported Exchanges & Real-World Mechanics

The codebase inherently supports arbitrary localization.
* **National Stock Exchange of India (NSE)**: Utilizing indices like `^NSEI`, converting via `USDINR=X`. Closes at 15:30 IST.
* **Bombay Stock Exchange (BSE)**: `^BSESN`. 
* **New York Stock Exchange (NYSE)**: Support utilizing S&P 500 (`^GSPC`) indexing.
The system automatically mitigates weekend trading halts and dynamically halts real-time updates when current system clocks indicate the market is closed or in "After Hours" modes. 

---

## 9. Deployment Strategies & Hosting

The project encompasses varying tiers of operational hosting depending on scale:

1. **Docker Compose (Local/Self-hosted)**:
   `docker-compose up --build` wraps the Vite dev server and Uvicorn FastAPI instances allowing immediate local sandbox environments.
   
2. **Wasmer Edge (Backend)**: 
   The application leverages Wasmer and WebAssembly for lightning-fast edge computing inference. Dependencies are carefully pruned in `requirements.runtime.txt` to mitigate footprint.

3. **Railway.app**: 
   Standard PaaS implementation for isolated CPU hosting. Useful when the Unified CNN loads require modest multithreading inference bounds.

4. **Cloudflare Pages (Frontend)**:
   The Vite React build (`npm run build`) is deployed statically on CF Pages, interacting with the backend via cross-origin resource sharing (CORS), configured gracefully via environmental variables (`ALLOWED_FRONTEND_ORIGINS`).

---

## 10. Developer Guide & Extension Scaffolding

Adding a new Exchange or Stock:
1. Open `stocks.json`.
2. Append the Exchange ruleset (Market hours, Base Index, Currency Pair).
3. Append the new Stock configuration payload with the required ID, Ticker, and target Retrain Horizon.
4. Execute `POST /api/v1/training/run` or upload the generated Jupyter notebook back into the system after Colab processing to mount the tensors.

To add new Data Providers (e.g., Bloomberg/Polygon):
Replicate the `yfinance_fetcher.py` inheriting base classes. Point the config router towards the new identifier. 

---

## 11. Future Roadmap & Iteration 

1. **Transformer Encoders**: Shifting the Regressor head to utilize self-attention mechanisms over the flattened feature maps to capture distant cyclic relationships.
2. **Sentiment Analysis Embedding**: Injecting a 6th Spectrogram channel utilizing quantified NLP semantic scores of news wire feeds overlaid against time.
3. **Automated Trading Bridge**: Webhook integration capable of broadcasting directional triggers to execution platforms like Zerodha Kite or Interactive Brokers. 
