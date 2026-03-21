# flake8: noqa
from __future__ import annotations

import json
from textwrap import dedent
from typing import Any


def build_notebook_cells(app_config: dict[str, Any], mode: str) -> list[dict[str, Any]]:
    config_json = json.dumps(app_config, indent=2)
    return [
        _markdown_cell(
            "FinSpectra Training Notebook",
            (
                f"This notebook was generated for `{mode}` mode. "
                "It mirrors the backend model and training architecture so the exported `.pth` "
                "files load into `ModelRegistry` without renaming layers."
            ),
        ),
        _code_cell(_dependency_install_source()),
        _markdown_cell(
            "Configuration Snapshot",
            "The full `stocks.json` payload is embedded below so the notebook runs without edits.",
        ),
        _code_cell(_config_source(config_json, mode)),
        _markdown_cell(
            "Model Definitions",
            "These classes keep the same layer names as the backend: `features`, `regressor`, and `stock_embedding`.",
        ),
        _code_cell(_model_architecture_source()),
        _markdown_cell(
            "Data Pipeline",
            "This section fetches yfinance close prices, normalizes them, converts windows to STFT spectrograms, and builds leakage-safe samples.",
        ),
        _code_cell(_data_pipeline_source()),
        _markdown_cell(
            "Training And Evaluation",
            "These helpers perform time-based splits, training, metric calculation, and artifact saving.",
        ),
        _code_cell(_training_loop_source()),
        _markdown_cell(
            "Run Training",
            "Execute this cell to train the requested mode and write `.pth`, `scaler.pkl`, and `training_report.json` artifacts locally inside the notebook workspace.",
        ),
        _code_cell(_run_training_source(mode)),
        _markdown_cell(
            "Export To Google Drive",
            "Run this after training in Colab to copy the generated artifacts to Google Drive for download or later reuse.",
        ),
        _code_cell(_drive_export_source()),
    ]


def _markdown_cell(title: str, body: str) -> dict[str, Any]:
    return {
        "cell_type": "markdown",
        "metadata": {},
        "source": f"# {title}\n\n{body}\n",
    }


def _code_cell(source: str) -> dict[str, Any]:
    return {
        "cell_type": "code",
        "metadata": {},
        "execution_count": None,
        "outputs": [],
        "source": dedent(source).strip() + "\n",
    }


def _dependency_install_source() -> str:
    return """
    !pip install -q yfinance torch scipy matplotlib scikit-learn
    """


def _config_source(config_json: str, mode: str) -> str:
    config_literal = json.dumps(config_json)
    return f"""
    import os
    import json
    from pathlib import Path

    CONFIG = json.loads({config_literal})
    ACTIVE_STOCKS = [stock for stock in CONFIG["stocks"] if stock.get("enabled", True)]
    NOTEBOOK_MODE = "{mode}"
    SMOKE_MODE = os.environ.get("FINSPECTRA_NOTEBOOK_SMOKE") == "1"
    if SMOKE_MODE:
        CONFIG["training"]["epochs"] = 1
        ACTIVE_STOCKS = ACTIVE_STOCKS[:1]
    OUTPUT_DIR = Path("finspectra_artifacts")
    OUTPUT_DIR.mkdir(exist_ok=True)

    print("Notebook mode:", NOTEBOOK_MODE)
    print("Smoke mode:", SMOKE_MODE)
    print("Configured app mode:", CONFIG["model_mode"])
    print("Active stocks:", [stock["id"] for stock in ACTIVE_STOCKS])
    """


def _model_architecture_source() -> str:
    return """
    import torch
    from torch import nn

    DEFAULT_IN_CHANNELS = 1
    FEATURE_CHANNELS = (16, 32, 64)
    FEATURE_MAP_SIZE = (4, 4)
    HIDDEN_LAYER_SIZE = 128

    class BaseModel(nn.Module):
        model_name = "base"

        def __init__(self, in_channels: int = DEFAULT_IN_CHANNELS) -> None:
            super().__init__()
            self.in_channels = in_channels

        @property
        def feature_vector_size(self) -> int:
            return FEATURE_CHANNELS[-1] * FEATURE_MAP_SIZE[0] * FEATURE_MAP_SIZE[1]

        def build_feature_extractor(self, in_channels: int | None = None) -> nn.Sequential:
            resolved_channels = in_channels or self.in_channels
            return nn.Sequential(
                nn.Conv2d(resolved_channels, FEATURE_CHANNELS[0], kernel_size=3, padding=1),
                nn.ReLU(),
                nn.MaxPool2d(kernel_size=2),
                nn.Conv2d(FEATURE_CHANNELS[0], FEATURE_CHANNELS[1], kernel_size=3, padding=1),
                nn.ReLU(),
                nn.MaxPool2d(kernel_size=2),
                nn.Conv2d(FEATURE_CHANNELS[1], FEATURE_CHANNELS[2], kernel_size=3, padding=1),
                nn.ReLU(),
                nn.AdaptiveAvgPool2d(FEATURE_MAP_SIZE),
            )

        def build_regressor_head(self, extra_features: int = 0) -> nn.Sequential:
            input_features = self.feature_vector_size + extra_features
            return nn.Sequential(
                nn.Linear(input_features, HIDDEN_LAYER_SIZE),
                nn.ReLU(),
                nn.Dropout(0.3),
                nn.Linear(HIDDEN_LAYER_SIZE, 1),
            )

        def validate_inputs(self, inputs: torch.Tensor) -> torch.Tensor:
            if inputs.ndim != 4:
                raise ValueError("Expected (batch, channels, freq_bins, time_steps) inputs.")
            if inputs.shape[1] != self.in_channels:
                raise ValueError(
                    f"Expected {self.in_channels} channel(s), received {inputs.shape[1]}."
                )
            return inputs.float()

        def extract_features(self, inputs: torch.Tensor) -> torch.Tensor:
            return torch.flatten(self.features(self.validate_inputs(inputs)), start_dim=1)

    class SingleHeadCNN(BaseModel):
        def __init__(self, in_channels: int = DEFAULT_IN_CHANNELS) -> None:
            super().__init__(in_channels=in_channels)
            self.features = self.build_feature_extractor()
            self.regressor = self.build_regressor_head()

        def forward(self, inputs: torch.Tensor) -> torch.Tensor:
            return self.regressor(self.extract_features(inputs))

    class PerStockCNN(SingleHeadCNN):
        model_name = "per_stock"

    class UnifiedCNN(SingleHeadCNN):
        model_name = "unified"

    class UnifiedCNNWithEmbeddings(BaseModel):
        model_name = "unified_with_embeddings"

        def __init__(self, num_stocks: int, embedding_dim: int = 8) -> None:
            super().__init__(in_channels=DEFAULT_IN_CHANNELS)
            self.features = self.build_feature_extractor()
            self.stock_embedding = nn.Embedding(num_stocks, embedding_dim)
            self.regressor = self.build_regressor_head(extra_features=embedding_dim)

        def forward(self, inputs: torch.Tensor, stock_ids: torch.Tensor) -> torch.Tensor:
            features = self.extract_features(inputs)
            embeddings = self.stock_embedding(stock_ids.long())
            return self.regressor(torch.cat((features, embeddings), dim=1))
    """


def _data_pipeline_source() -> str:
    return """
    import numpy as np
    import pandas as pd
    import yfinance as yf
    from scipy.signal import stft

    WINDOW_LENGTH = int(CONFIG["signal_processing"]["stft"]["window_length"])
    HOP_SIZE = int(CONFIG["signal_processing"]["stft"]["hop_size"])
    N_FFT = int(CONFIG["signal_processing"]["stft"]["n_fft"])
    LOOKBACK_DAYS = max(WINDOW_LENGTH * 4, N_FFT)

    def fetch_close_series(stock_config: dict) -> pd.Series:
        ticker = yf.Ticker(stock_config["ticker"])
        period = f"{int(stock_config['model']['training_data_years'])}y"
        history = ticker.history(period=period, interval="1d", auto_adjust=False)
        if history.empty:
            raise ValueError(f"No historical data returned for {stock_config['id']}.")
        close_series = history["Close"].dropna().astype(float)
        if close_series.empty:
            raise ValueError(f"No close prices returned for {stock_config['id']}.")
        return close_series

    def minmax_normalize(values: np.ndarray) -> tuple[np.ndarray, dict]:
        minimum_value = float(np.min(values))
        maximum_value = float(np.max(values))
        scale = maximum_value - minimum_value
        if scale == 0:
            normalized = np.zeros_like(values, dtype=float)
        else:
            normalized = (values - minimum_value) / scale
        return normalized, {"minimum_value": minimum_value, "maximum_value": maximum_value}

    def denormalize(values: np.ndarray, scaler: dict) -> np.ndarray:
        scale = scaler["maximum_value"] - scaler["minimum_value"]
        if scale == 0:
            return np.full_like(values, scaler["minimum_value"], dtype=float)
        return values * scale + scaler["minimum_value"]

    def build_stft_spectrogram(window_values: np.ndarray) -> np.ndarray:
        _, _, spectrum = stft(
            window_values,
            fs=1.0,
            window=CONFIG["signal_processing"]["stft"]["window_function"],
            nperseg=WINDOW_LENGTH,
            noverlap=WINDOW_LENGTH - HOP_SIZE,
            nfft=N_FFT,
            boundary=None,
            padded=False,
        )
        return np.abs(spectrum) ** 2

    def build_samples(stock_config: dict, stock_index: int) -> tuple[list[dict], dict]:
        close_series = fetch_close_series(stock_config)
        raw_values = close_series.to_numpy(dtype=float)
        normalized_values, scaler = minmax_normalize(raw_values)
        timestamps = [pd.Timestamp(timestamp).tz_localize(None).isoformat() for timestamp in close_series.index]
        horizon = int(stock_config["model"]["prediction_horizon_days"])
        upper_bound = len(normalized_values) - LOOKBACK_DAYS - horizon + 1
        if upper_bound <= 0:
            raise ValueError(f"Not enough history to build samples for {stock_config['id']}.")
        samples = []
        for start_index in range(upper_bound):
            stop_index = start_index + LOOKBACK_DAYS
            window_end_index = stop_index - 1
            label_index = window_end_index + horizon
            spectrogram = build_stft_spectrogram(normalized_values[start_index:stop_index]).astype(np.float32)
            samples.append(
                {
                    "inputs": np.expand_dims(spectrogram, axis=0),
                    "target_normalized": float(normalized_values[label_index]),
                    "target_raw": float(raw_values[label_index]),
                    "reference_raw": float(raw_values[window_end_index]),
                    "stock_id": stock_config["id"],
                    "stock_index": stock_index,
                    "window_end_timestamp": timestamps[window_end_index],
                    "label_timestamp": timestamps[label_index],
                }
            )
        return samples, scaler
    """


def _training_loop_source() -> str:
    return """
    import math
    import pickle
    from torch.utils.data import DataLoader, Dataset
    from torch import nn
    from torch.optim import Adam

    class SpectrogramDataset(Dataset):
        def __init__(self, samples: list[dict]) -> None:
            self.samples = list(samples)

        def __len__(self) -> int:
            return len(self.samples)

        def __getitem__(self, index: int) -> dict:
            sample = self.samples[index]
            return {
                "inputs": torch.tensor(sample["inputs"], dtype=torch.float32),
                "target": torch.tensor([sample["target_normalized"]], dtype=torch.float32),
                "stock_index": torch.tensor(sample["stock_index"], dtype=torch.long),
                "stock_id": sample["stock_id"],
                "label_timestamp": sample["label_timestamp"],
                "reference_raw": torch.tensor(sample["reference_raw"], dtype=torch.float32),
                "target_raw": torch.tensor(sample["target_raw"], dtype=torch.float32),
            }

    def time_split(samples: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
        ordered_samples = sorted(samples, key=lambda sample: (sample["label_timestamp"], sample["stock_id"]))
        train_end = int(len(ordered_samples) * float(CONFIG["training"]["split"]["train"]))
        val_end = train_end + int(len(ordered_samples) * float(CONFIG["training"]["split"]["val"]))
        return ordered_samples[:train_end], ordered_samples[train_end:val_end], ordered_samples[val_end:]

    def build_per_stock_bundle(stock_config: dict, stock_index: int) -> dict:
        samples, scaler = build_samples(stock_config, stock_index)
        train_samples, val_samples, test_samples = time_split(samples)
        return {
            "train": SpectrogramDataset(train_samples),
            "val": SpectrogramDataset(val_samples),
            "test": SpectrogramDataset(test_samples),
            "scalers": {stock_config["id"]: scaler},
        }

    def build_unified_bundle(active_stocks: list[dict]) -> dict:
        all_samples = []
        scalers = {}
        for stock_index, stock_config in enumerate(active_stocks):
            stock_samples, scaler = build_samples(stock_config, stock_index)
            all_samples.extend(stock_samples)
            scalers[stock_config["id"]] = scaler
        train_samples, val_samples, test_samples = time_split(all_samples)
        return {
            "train": SpectrogramDataset(train_samples),
            "val": SpectrogramDataset(val_samples),
            "test": SpectrogramDataset(test_samples),
            "scalers": scalers,
        }

    def create_model(mode: str, num_stocks: int) -> BaseModel:
        if mode == "per_stock":
            return PerStockCNN()
        if mode == "unified":
            return UnifiedCNN()
        if mode == "unified_with_embeddings":
            return UnifiedCNNWithEmbeddings(num_stocks=num_stocks)
        raise ValueError(f"Unsupported notebook mode: {mode}")

    def forward_model(model: BaseModel, mode: str, batch: dict) -> torch.Tensor:
        inputs = batch["inputs"]
        if mode == "unified_with_embeddings":
            return model(inputs, batch["stock_index"])
        return model(inputs)

    def train_model(model: BaseModel, datasets: dict, mode: str, checkpoint_path: Path) -> list[dict]:
        optimizer = Adam(model.parameters(), lr=float(CONFIG["training"]["learning_rate"]))
        loss_function = nn.MSELoss()
        train_loader = DataLoader(datasets["train"], batch_size=int(CONFIG["training"]["batch_size"]), shuffle=True)
        val_loader = DataLoader(datasets["val"], batch_size=int(CONFIG["training"]["batch_size"]), shuffle=False)
        history = []
        best_val_loss = float("inf")
        for epoch in range(1, int(CONFIG["training"]["epochs"]) + 1):
            model.train()
            train_loss = 0.0
            train_batches = 0
            for batch in train_loader:
                optimizer.zero_grad()
                predictions = forward_model(model, mode, batch)
                loss = loss_function(predictions, batch["target"])
                loss.backward()
                optimizer.step()
                train_loss += float(loss.item())
                train_batches += 1
            model.eval()
            val_loss = 0.0
            val_batches = 0
            with torch.no_grad():
                for batch in val_loader:
                    predictions = forward_model(model, mode, batch)
                    val_loss += float(loss_function(predictions, batch["target"]).item())
                    val_batches += 1
            epoch_metrics = {
                "epoch": epoch,
                "train_loss": train_loss / max(train_batches, 1),
                "val_loss": val_loss / max(val_batches, 1),
            }
            history.append(epoch_metrics)
            if epoch_metrics["val_loss"] <= best_val_loss:
                best_val_loss = epoch_metrics["val_loss"]
                torch.save(model.state_dict(), checkpoint_path)
        return history

    def evaluate_model(model: BaseModel, dataset: SpectrogramDataset, scalers: dict, mode: str) -> dict:
        loader = DataLoader(dataset, batch_size=int(CONFIG["training"]["batch_size"]), shuffle=False)
        prediction_chunks = []
        target_chunks = []
        reference_chunks = []
        stock_ids = []
        timestamps = []
        model.eval()
        with torch.no_grad():
            for batch in loader:
                prediction_chunks.append(forward_model(model, mode, batch).numpy().reshape(-1))
                target_chunks.append(batch["target"].numpy().reshape(-1))
                reference_chunks.append(batch["reference_raw"].numpy().reshape(-1))
                stock_ids.extend(batch["stock_id"])
                timestamps.extend(batch["label_timestamp"])
        predictions_normalized = np.concatenate(prediction_chunks)
        targets_normalized = np.concatenate(target_chunks)
        reference_prices_raw = np.concatenate(reference_chunks)
        predictions_raw = np.array([
            denormalize(np.array([value]), scalers[stock_id])[0]
            for value, stock_id in zip(predictions_normalized, stock_ids, strict=False)
        ])
        targets_raw = np.array([
            denormalize(np.array([value]), scalers[stock_id])[0]
            for value, stock_id in zip(targets_normalized, stock_ids, strict=False)
        ])
        errors = predictions_raw - targets_raw
        mse = float(np.mean(np.square(errors)))
        rmse = float(math.sqrt(mse))
        mae = float(np.mean(np.abs(errors)))
        mape_mask = targets_raw != 0
        mape = float(np.mean(np.abs(errors[mape_mask]) / np.abs(targets_raw[mape_mask])) * 100.0) if np.any(mape_mask) else 0.0
        directional_accuracy = float(
            np.mean(np.sign(predictions_raw - reference_prices_raw) == np.sign(targets_raw - reference_prices_raw)) * 100.0
        )
        return {
            "mse": mse,
            "rmse": rmse,
            "mae": mae,
            "mape": mape,
            "directional_accuracy": directional_accuracy,
            "timestamps": timestamps,
        }

    def save_scalers(scalers: dict) -> None:
        scaler_dir = OUTPUT_DIR / "scalers"
        scaler_dir.mkdir(exist_ok=True)
        for stock_id, scaler in scalers.items():
            with (scaler_dir / f"{stock_id}_scaler.pkl").open("wb") as handle:
                pickle.dump(scaler, handle)
    """


def _run_training_source(mode: str) -> str:
    return f"""
    from pathlib import Path

    NOTEBOOK_MODE = "{mode}"
    training_report = []

    def train_and_record(mode_name: str, datasets: dict, checkpoint_path: Path) -> None:
        model = create_model(mode_name, num_stocks=len(ACTIVE_STOCKS))
        history = train_model(model, datasets, mode_name, checkpoint_path)
        metrics = evaluate_model(model, datasets["test"], datasets["scalers"], mode_name)
        training_report.append({{
            "mode": mode_name,
            "checkpoint_path": str(checkpoint_path),
            "history": history,
            "metrics": metrics,
        }})

    if NOTEBOOK_MODE == "per_stock":
        for stock_index, stock_config in enumerate(ACTIVE_STOCKS):
            datasets = build_per_stock_bundle(stock_config, stock_index)
            checkpoint_path = OUTPUT_DIR / f"{{stock_config['id']}}_model.pth"
            train_and_record("per_stock", datasets, checkpoint_path)
            save_scalers(datasets["scalers"])
    elif NOTEBOOK_MODE == "both":
        for stock_index, stock_config in enumerate(ACTIVE_STOCKS):
            datasets = build_per_stock_bundle(stock_config, stock_index)
            checkpoint_path = OUTPUT_DIR / f"{{stock_config['id']}}_model.pth"
            train_and_record("per_stock", datasets, checkpoint_path)
        unified_datasets = build_unified_bundle(ACTIVE_STOCKS)
        train_and_record(
            "unified_with_embeddings",
            unified_datasets,
            OUTPUT_DIR / "unified_with_embeddings_model.pth",
        )
        save_scalers(unified_datasets["scalers"])
    else:
        selected_mode = "unified_with_embeddings" if NOTEBOOK_MODE == "unified_with_embeddings" else "unified"
        unified_datasets = build_unified_bundle(ACTIVE_STOCKS)
        checkpoint_name = "unified_with_embeddings_model.pth" if selected_mode == "unified_with_embeddings" else "unified_model.pth"
        train_and_record(selected_mode, unified_datasets, OUTPUT_DIR / checkpoint_name)
        save_scalers(unified_datasets["scalers"])

    report_path = OUTPUT_DIR / "training_report.json"
    report_path.write_text(json.dumps(training_report, indent=2), encoding="utf-8")
    print("Training complete. Report written to", report_path)
    training_report
    """


def _drive_export_source() -> str:
    return """
    import shutil
    from pathlib import Path

    try:
        from google.colab import drive
    except ImportError:
        print("google.colab is unavailable outside Colab; skipping Drive export.")
    else:
        drive.mount("/content/drive")
        drive_target = Path("/content/drive/MyDrive/FinSpectraArtifacts")
        drive_target.mkdir(parents=True, exist_ok=True)

        for artifact_path in OUTPUT_DIR.rglob("*"):
            if artifact_path.is_file():
                relative_path = artifact_path.relative_to(OUTPUT_DIR)
                destination_path = drive_target / relative_path
                destination_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(artifact_path, destination_path)

        print("Artifacts copied to", drive_target)
    """
