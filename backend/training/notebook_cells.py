# flake8: noqa
from __future__ import annotations

import json
from textwrap import dedent
from typing import Any


def build_notebook_cells(app_config: dict[str, Any], mode: str) -> list[dict[str, Any]]:
    config_json = json.dumps(app_config, indent=2)
    return [
        _markdown_cell(
        "ChronoSpectra Training Notebook",
            (
                f"This notebook was generated for `{mode}` mode. "
                "It mirrors the backend model and training architecture so the exported `.pth` "
                "files load into `ModelRegistry` without renaming layers."
            ),
        ),
        _markdown_cell(
            "Mount Google Drive",
            "Run this first in Colab so the export target is ready before training starts.",
        ),
        _code_cell(_drive_mount_source()),
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
            "This section fetches the configured feature channels, aligns daily and quarterly series, normalizes each channel independently, and stacks channel spectrograms into leakage-safe samples.",
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
    !pip install -q yfinance torch scipy matplotlib pandas scikit-learn
    """


def _drive_mount_source() -> str:
    return """
    from pathlib import Path

    try:
        from google.colab import drive
    except ImportError:
        DRIVE_TARGET = None
        print("google.colab is unavailable outside Colab; skipping Drive mount.")
    else:
        drive.mount("/content/drive")
        DRIVE_TARGET = Path("/content/drive/MyDrive/ChronoSpectraArtifacts")
        DRIVE_TARGET.mkdir(parents=True, exist_ok=True)
        print("Google Drive mounted at", DRIVE_TARGET)
    """


def _config_source(config_json: str, mode: str) -> str:
    config_literal = json.dumps(config_json)
    return f"""
import os
import json
import torch
from pathlib import Path

CONFIG = json.loads({config_literal})
ACTIVE_STOCKS = [stock for stock in CONFIG["stocks"] if stock.get("enabled", True)]
SUPPORTED_FEATURE_CHANNELS = {{"price", "index", "usd_inr", "revenue", "profit"}}
FEATURE_CHANNEL_NAMES = []
for channel_name in CONFIG.get("training", {{}}).get("feature_channels", ["price"]):
    if not isinstance(channel_name, str):
        continue
    normalized_channel = channel_name.strip().lower()
    if normalized_channel not in SUPPORTED_FEATURE_CHANNELS:
        continue
    if normalized_channel in FEATURE_CHANNEL_NAMES:
        continue
    FEATURE_CHANNEL_NAMES.append(normalized_channel)
if not FEATURE_CHANNEL_NAMES:
    FEATURE_CHANNEL_NAMES = ["price"]
CONFIG.setdefault("training", {{}})["feature_channels"] = FEATURE_CHANNEL_NAMES
NOTEBOOK_MODE = "{mode}"
SMOKE_MODE = os.environ.get("FINSPECTRA_NOTEBOOK_SMOKE") == "1"
if SMOKE_MODE:
    CONFIG["training"]["epochs"] = 1
    ACTIVE_STOCKS = ACTIVE_STOCKS[:1]

OUTPUT_DIR = Path("chronospectra_artifacts")
OUTPUT_DIR.mkdir(exist_ok=True)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
if DEVICE.type == "cuda":
    torch.backends.cudnn.benchmark = True

print("Notebook mode:", NOTEBOOK_MODE)
print("Smoke mode:", SMOKE_MODE)
print("Configured app mode:", CONFIG["model_mode"])
print("Active stocks:", [stock["id"] for stock in ACTIVE_STOCKS])
print("Feature channels:", FEATURE_CHANNEL_NAMES)
print("Input channels:", len(FEATURE_CHANNEL_NAMES))
print("Training device:", DEVICE)
    """


def _model_architecture_source() -> str:
    return """
    import torch
    from torch import nn

    DEFAULT_IN_CHANNELS = len(FEATURE_CHANNEL_NAMES)
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

        def __init__(
            self,
            num_stocks: int,
            embedding_dim: int = 8,
            in_channels: int = DEFAULT_IN_CHANNELS,
        ) -> None:
            super().__init__(in_channels=in_channels)
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

    STATEMENT_SCALE_TO_CRORES = 10_000_000
    REVENUE_LABELS = ("Total Revenue", "Operating Revenue", "Revenue")
    PROFIT_LABELS = ("Gross Profit", "Net Income", "Net Income Common Stockholders")
    WINDOW_LENGTH = int(CONFIG["signal_processing"]["stft"]["window_length"])
    HOP_SIZE = int(CONFIG["signal_processing"]["stft"]["hop_size"])
    N_FFT = int(CONFIG["signal_processing"]["stft"]["n_fft"])
    LOOKBACK_DAYS = max(WINDOW_LENGTH * 4, N_FFT)

    def fetch_history(ticker_symbol: str, period: str) -> pd.DataFrame:
        history = yf.Ticker(ticker_symbol).history(period=period, interval="1d", auto_adjust=False)
        if isinstance(history, pd.DataFrame):
            return history
        return pd.DataFrame()

    def fetch_daily_close_series(
        ticker_symbol: str,
        period: str,
        stock_id: str,
        label: str,
    ) -> pd.DataFrame:
        history = fetch_history(ticker_symbol, period)
        if history.empty or "Close" not in history.columns:
            raise ValueError(f"No {label} history returned for {stock_id}.")
        close_frame = history[["Close"]].rename(columns={"Close": "close"}).dropna().copy()
        if close_frame.empty:
            raise ValueError(f"No {label} values returned for {stock_id}.")
        close_frame.index = pd.to_datetime(close_frame.index).tz_localize(None)
        return close_frame.sort_index()

    def extract_statement_frame(
        income_statement: pd.DataFrame,
        candidate_labels: tuple[str, ...],
    ) -> pd.DataFrame:
        if income_statement.empty:
            return pd.DataFrame(columns=["quarter", "value_crores"])
        matched_label = next(
            (label for label in candidate_labels if label in income_statement.index),
            None,
        )
        if matched_label is None:
            return pd.DataFrame(columns=["quarter", "value_crores"])
        value_series = income_statement.loc[matched_label].dropna()
        if value_series.empty:
            return pd.DataFrame(columns=["quarter", "value_crores"])
        statement_frame = value_series.rename("value_crores").reset_index()
        statement_frame.columns = ["quarter", "value_crores"]
        statement_frame["quarter"] = pd.to_datetime(
            statement_frame["quarter"]
        ).dt.tz_localize(None)
        statement_frame["value_crores"] = statement_frame["value_crores"].astype(float)
        statement_frame["value_crores"] = (
            statement_frame["value_crores"] / STATEMENT_SCALE_TO_CRORES
        )
        return statement_frame.sort_values("quarter").reset_index(drop=True)

    def prepare_daily_track(track_name: str, frame: pd.DataFrame) -> pd.DataFrame:
        if frame.empty:
            return pd.DataFrame(columns=[track_name])
        normalized_frame = frame.copy()
        normalized_frame.index = pd.to_datetime(normalized_frame.index).tz_localize(None)
        normalized_frame.index = normalized_frame.index.normalize()
        value_column = "close" if "close" in normalized_frame.columns else normalized_frame.columns[0]
        return normalized_frame[[value_column]].rename(columns={value_column: track_name})

    def align_daily_tracks(daily_tracks: dict[str, pd.DataFrame]) -> pd.DataFrame:
        prepared_tracks = [
            prepare_daily_track(track_name, frame)
            for track_name, frame in daily_tracks.items()
        ]
        non_empty_tracks = [frame for frame in prepared_tracks if not frame.empty]
        if not non_empty_tracks:
            return pd.DataFrame()
        return pd.concat(non_empty_tracks, axis=1, join="inner").sort_index().dropna(how="any")

    def prepare_quarterly_track(track_name: str, frame: pd.DataFrame) -> pd.DataFrame:
        if frame.empty:
            return pd.DataFrame(columns=[track_name])
        normalized_frame = frame.copy()
        normalized_frame["quarter"] = pd.to_datetime(
            normalized_frame["quarter"]
        ).dt.tz_localize(None)
        normalized_frame = normalized_frame.set_index("quarter")
        return normalized_frame[["value_crores"]].rename(columns={"value_crores": track_name})

    def align_quarterly_tracks(quarterly_tracks: dict[str, pd.DataFrame]) -> pd.DataFrame:
        prepared_tracks = [
            prepare_quarterly_track(track_name, frame)
            for track_name, frame in quarterly_tracks.items()
        ]
        non_empty_tracks = [frame for frame in prepared_tracks if not frame.empty]
        if not non_empty_tracks:
            return pd.DataFrame()
        return pd.concat(non_empty_tracks, axis=1, join="outer").sort_index()

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

    def normalize_with_scaler(values: np.ndarray, scaler: dict) -> np.ndarray:
        scale = scaler["maximum_value"] - scaler["minimum_value"]
        if scale == 0:
            return np.zeros_like(values, dtype=float)
        return (values - scaler["minimum_value"]) / scale

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

    def load_feature_series(stock_config: dict) -> dict:
        stock_id = stock_config["id"]
        period = f"{int(stock_config['model']['training_data_years'])}y"
        exchange_config = CONFIG["exchanges"][stock_config["exchange"]]
        selected_channels = set(FEATURE_CHANNEL_NAMES)

        daily_tracks = {
            "price": fetch_daily_close_series(
                stock_config["ticker"],
                period,
                stock_id,
                "close-price",
            ),
        }
        if "index" in selected_channels:
            daily_tracks["index"] = fetch_daily_close_series(
                exchange_config["market_index_ticker"],
                period,
                stock_id,
                "market-index",
            )
        if "usd_inr" in selected_channels:
            daily_tracks["usd_inr"] = fetch_daily_close_series(
                exchange_config["currency_pair"],
                period,
                stock_id,
                "currency-pair",
            )

        aligned_daily = align_daily_tracks(daily_tracks)
        if aligned_daily.empty or "price" not in aligned_daily.columns:
            raise ValueError(f"No aligned daily price series found for {stock_id}.")

        working_frame = aligned_daily[["price"]].copy()
        for optional_daily_channel in ("index", "usd_inr"):
            if optional_daily_channel in aligned_daily.columns:
                working_frame[optional_daily_channel] = aligned_daily[optional_daily_channel]

        if "revenue" in selected_channels or "profit" in selected_channels:
            income_statement = yf.Ticker(stock_config["ticker"]).quarterly_income_stmt
            quarterly_tracks = {}
            if "revenue" in selected_channels:
                quarterly_tracks["revenue"] = extract_statement_frame(
                    income_statement,
                    REVENUE_LABELS,
                )
            if "profit" in selected_channels:
                quarterly_tracks["profit"] = extract_statement_frame(
                    income_statement,
                    PROFIT_LABELS,
                )
            aligned_quarterly = align_quarterly_tracks(quarterly_tracks)
            if aligned_quarterly.empty:
                raise ValueError(
                    f"Quarterly fundamentals are unavailable for requested channels on {stock_id}."
                )
            quarterly_on_daily = aligned_quarterly.reindex(working_frame.index).ffill().bfill()
            for column_name in quarterly_on_daily.columns:
                working_frame[column_name] = quarterly_on_daily[column_name]

        required_columns = ["price", *[channel for channel in FEATURE_CHANNEL_NAMES if channel != "price"]]
        filtered_frame = working_frame[required_columns].dropna(how="any").sort_index()
        if filtered_frame.empty:
            raise ValueError(f"No aligned feature rows found for {stock_id}.")

        raw_by_channel = {}
        normalized_by_channel = {}
        minimum_by_channel = {}
        maximum_by_channel = {}
        for channel_name in required_columns:
            values = filtered_frame[channel_name].to_numpy(dtype=float)
            normalized_values, scaler = minmax_normalize(values)
            raw_by_channel[channel_name] = values
            normalized_by_channel[channel_name] = normalized_values
            minimum_by_channel[channel_name] = scaler["minimum_value"]
            maximum_by_channel[channel_name] = scaler["maximum_value"]

        timestamps = [
            pd.Timestamp(timestamp).tz_localize(None).isoformat()
            for timestamp in filtered_frame.index
        ]

        return {
            "timestamps": timestamps,
            "raw_by_channel": raw_by_channel,
            "normalized_by_channel": normalized_by_channel,
            "minimum_by_channel": minimum_by_channel,
            "maximum_by_channel": maximum_by_channel,
        }

    def build_samples(stock_config: dict, stock_index: int) -> tuple[list[dict], dict]:
        feature_series = load_feature_series(stock_config)
        raw_values = feature_series["raw_by_channel"]["price"]
        timestamps = feature_series["timestamps"]
        horizon = int(stock_config["model"]["prediction_horizon_days"])
        upper_bound = len(raw_values) - LOOKBACK_DAYS - horizon + 1
        if upper_bound <= 0:
            raise ValueError(f"Not enough history to build samples for {stock_config['id']}.")
        train_sample_count = int(upper_bound * float(CONFIG["training"]["split"]["train"]))
        if train_sample_count <= 0:
            raise ValueError(
                f"Training split produced zero samples for {stock_config['id']}. "
                "Increase the train split or fetch more history."
            )
        scaling_end = min(
            train_sample_count + LOOKBACK_DAYS + horizon - 1,
            len(feature_series["timestamps"]),
        )
        channel_scalers = {}
        normalized_by_channel = {}
        
        channels_to_normalize = set(FEATURE_CHANNEL_NAMES)
        channels_to_normalize.add("price")

        for channel_name in channels_to_normalize:
            train_values = feature_series["raw_by_channel"][channel_name][:scaling_end]
            channel_scalers[channel_name] = {
                "minimum_value": float(np.min(train_values)),
                "maximum_value": float(np.max(train_values)),
            }
            normalized_by_channel[channel_name] = normalize_with_scaler(
                feature_series["raw_by_channel"][channel_name],
                channel_scalers[channel_name],
            )
        normalized_values = normalized_by_channel["price"]
        samples = []
        for start_index in range(upper_bound):
            stop_index = start_index + LOOKBACK_DAYS
            window_end_index = stop_index - 1
            label_index = window_end_index + horizon
            channel_spectrograms = []
            for channel_name in FEATURE_CHANNEL_NAMES:
                channel_values = normalized_by_channel[channel_name]
                spectrogram = build_stft_spectrogram(
                    channel_values[start_index:stop_index]
                ).astype(np.float32)
                channel_spectrograms.append(spectrogram)
            samples.append(
                {
                    "inputs": np.stack(channel_spectrograms, axis=0),
                    "target_normalized": float(normalized_values[label_index]),
                    "target_raw": float(raw_values[label_index]),
                    "reference_raw": float(raw_values[window_end_index]),
                    "stock_id": stock_config["id"],
                    "stock_index": stock_index,
                    "window_end_timestamp": timestamps[window_end_index],
                    "label_timestamp": timestamps[label_index],
                }
            )
        return samples, {
            "stock_id": stock_config["id"],
            "minimum_value": channel_scalers["price"]["minimum_value"],
            "maximum_value": channel_scalers["price"]["maximum_value"],
            "channel_scalers": channel_scalers,
        }
    """


def _training_loop_source() -> str:
    return """
    import math
    import pickle
    import torch
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

        @property
        def input_shape(self) -> tuple[int, ...]:
            if not self.samples:
                return ()
            return tuple(self.samples[0]["inputs"].shape)

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
            "feature_channels": list(FEATURE_CHANNEL_NAMES),
            "lookback_days": LOOKBACK_DAYS,
            "prediction_horizon_days": int(stock_config["model"]["prediction_horizon_days"]),
        }

    def build_unified_bundle(active_stocks: list[dict]) -> dict:
        all_samples = []
        scalers = {}
        prediction_horizon_days = None
        for stock_index, stock_config in enumerate(active_stocks):
            stock_samples, scaler = build_samples(stock_config, stock_index)
            all_samples.extend(stock_samples)
            scalers[stock_config["id"]] = scaler
            if prediction_horizon_days is None:
                prediction_horizon_days = int(stock_config["model"]["prediction_horizon_days"])
        train_samples, val_samples, test_samples = time_split(all_samples)
        return {
            "train": SpectrogramDataset(train_samples),
            "val": SpectrogramDataset(val_samples),
            "test": SpectrogramDataset(test_samples),
            "scalers": scalers,
            "feature_channels": list(FEATURE_CHANNEL_NAMES),
            "lookback_days": LOOKBACK_DAYS,
            "prediction_horizon_days": prediction_horizon_days or 0,
        }

    def create_model(mode: str, num_stocks: int) -> BaseModel:
        if mode == "per_stock":
            return PerStockCNN(in_channels=len(FEATURE_CHANNEL_NAMES))
        if mode == "unified":
            return UnifiedCNN(in_channels=len(FEATURE_CHANNEL_NAMES))
        if mode == "unified_with_embeddings":
            return UnifiedCNNWithEmbeddings(
                num_stocks=num_stocks,
                in_channels=len(FEATURE_CHANNEL_NAMES),
            )
        raise ValueError(f"Unsupported notebook mode: {mode}")

    def data_loader_for(dataset: SpectrogramDataset, shuffle: bool) -> DataLoader:
        return DataLoader(
            dataset,
            batch_size=int(CONFIG["training"]["batch_size"]),
            shuffle=shuffle,
            pin_memory=DEVICE.type == "cuda",
        )

    def prepare_batch(batch: dict) -> dict:
        prepared_batch = {}
        for key, value in batch.items():
            if isinstance(value, torch.Tensor):
                to_kwargs = {"device": DEVICE}
                if value.is_floating_point():
                    to_kwargs["dtype"] = torch.float32
                if DEVICE.type == "cuda":
                    to_kwargs["non_blocking"] = True
                prepared_batch[key] = value.to(**to_kwargs)
            else:
                prepared_batch[key] = value
        return prepared_batch

    def forward_model(model: BaseModel, mode: str, batch: dict) -> torch.Tensor:
        inputs = batch["inputs"]
        if mode == "unified_with_embeddings":
            return model(inputs, batch["stock_index"])
        return model(inputs)

    def train_model(model: BaseModel, datasets: dict, mode: str, checkpoint_path: Path) -> list[dict]:
        model = model.to(DEVICE)
        optimizer = Adam(model.parameters(), lr=float(CONFIG["training"]["learning_rate"]))
        loss_function = nn.MSELoss()
        train_loader = data_loader_for(datasets["train"], shuffle=True)
        val_loader = data_loader_for(datasets["val"], shuffle=False)
        history = []
        best_val_loss = float("inf")
        for epoch in range(1, int(CONFIG["training"]["epochs"]) + 1):
            model.train()
            train_loss = 0.0
            train_batches = 0
            for batch in train_loader:
                batch = prepare_batch(batch)
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
                    batch = prepare_batch(batch)
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
                state_dict = {
                    key: value.detach().cpu()
                    for key, value in model.state_dict().items()
                }
                torch.save(state_dict, checkpoint_path)
        return history

    def load_trained_model(mode: str, num_stocks: int, checkpoint_path: Path) -> BaseModel:
        model = create_model(mode, num_stocks=num_stocks).to(DEVICE)
        state_dict = torch.load(checkpoint_path, map_location=DEVICE)
        if isinstance(state_dict, dict) and "state_dict" in state_dict:
            state_dict = state_dict["state_dict"]
        if not isinstance(state_dict, dict):
            raise ValueError(f"Unsupported checkpoint format in {checkpoint_path.name}.")
        model.load_state_dict(state_dict)
        model.eval()
        return model

    def evaluate_model(model: BaseModel, dataset: SpectrogramDataset, scalers: dict, mode: str) -> dict:
        model = model.to(DEVICE)
        loader = data_loader_for(dataset, shuffle=False)
        prediction_chunks = []
        target_chunks = []
        reference_chunks = []
        stock_ids = []
        timestamps = []
        model.eval()
        with torch.no_grad():
            for batch in loader:
                batch = prepare_batch(batch)
                prediction_chunks.append(
                    forward_model(model, mode, batch).detach().cpu().numpy().reshape(-1)
                )
                target_chunks.append(batch["target"].detach().cpu().numpy().reshape(-1))
                reference_chunks.append(
                    batch["reference_raw"].detach().cpu().numpy().reshape(-1)
                )
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

    def build_dataset_summary(datasets: dict) -> dict:
        return {
            "train_count": len(datasets["train"]),
            "val_count": len(datasets["val"]),
            "test_count": len(datasets["test"]),
            "input_shape": list(datasets["train"].input_shape),
            "feature_channels": list(datasets["feature_channels"]),
            "lookback_days": int(datasets["lookback_days"]),
            "prediction_horizon_days": int(datasets["prediction_horizon_days"]),
        }
    """


def _run_training_source(mode: str) -> str:
    return f"""
    from pathlib import Path

    NOTEBOOK_MODE = "{mode}"
    training_report = []

    def train_and_record(mode_name: str, datasets: dict, checkpoint_path: Path) -> None:
        model = create_model(mode_name, num_stocks=len(ACTIVE_STOCKS))
        history = train_model(model, datasets, mode_name, checkpoint_path)
        best_model = load_trained_model(mode_name, len(ACTIVE_STOCKS), checkpoint_path)
        metrics = evaluate_model(best_model, datasets["test"], datasets["scalers"], mode_name)
        training_report.append({{
            "mode": mode_name,
            "checkpoint_path": str(checkpoint_path),
            "feature_channels": list(datasets["feature_channels"]),
            "lookback_days": int(datasets["lookback_days"]),
            "prediction_horizon_days": int(datasets["prediction_horizon_days"]),
            "dataset_summary": build_dataset_summary(datasets),
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

if DRIVE_TARGET is None:
    raise ValueError("Run the 'Mount Google Drive' cell first.")

for artifact_path in OUTPUT_DIR.rglob("*"):
    if artifact_path.is_file():
        relative_path = artifact_path.relative_to(OUTPUT_DIR)
        destination_path = DRIVE_TARGET / relative_path
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(artifact_path, destination_path)

print("Artifacts copied to", DRIVE_TARGET)
    """
