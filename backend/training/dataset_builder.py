from __future__ import annotations

from typing import Any

import numpy as np

from config import find_stock
from data.feature_series_loader import FeatureSeries, FeatureSeriesLoader
from data.cache.data_cache import DataCache
from signal_processing.transforms import get_transform
from training.feature_channels import resolve_feature_channels
from training.training_types import (
    DatasetBundle,
    ScalingMetadata,
    SpectrogramDataset,
    TrainingSampleRecord,
)

LOOKBACK_MULTIPLIER = 4
SUPPORTED_DATASET_MODES = {"per_stock", "unified", "unified_with_embeddings"}


class DatasetBuilder:
    def __init__(
        self,
        app_config: dict[str, Any],
        cache: DataCache,
        transform_name: str | None = None,
    ) -> None:
        self.config = app_config
        self.cache = cache
        self.transform_name = (
            transform_name or app_config["signal_processing"]["default_transform"]
        ).lower()
        self.feature_channels = resolve_feature_channels(app_config)
        self.feature_series_loader = FeatureSeriesLoader(app_config, cache)
        self.stock_index = {
            stock["id"]: index for index, stock in enumerate(app_config["active_stocks"])
        }

    def build(self, mode: str, stock_id: str | None = None) -> DatasetBundle:
        resolved_mode = self._validate_mode(mode)
        stock_configs = self._resolve_stock_configs(resolved_mode, stock_id)
        prediction_horizon_days = self._resolve_prediction_horizon_days(stock_configs)
        lookback_days = self._resolve_lookback_days()
        transform = get_transform(self.transform_name, self.config)
        samples, scalers = self._collect_samples(
            stock_configs,
            transform,
            lookback_days,
            prediction_horizon_days,
        )
        train_samples, val_samples, test_samples = self._split_samples(samples)
        return DatasetBundle(
            train_dataset=SpectrogramDataset(train_samples),
            val_dataset=SpectrogramDataset(val_samples),
            test_dataset=SpectrogramDataset(test_samples),
            scalers_by_stock=scalers,
            feature_channels=list(self.feature_channels),
            transform_name=self.transform_name,
            lookback_days=lookback_days,
            prediction_horizon_days=prediction_horizon_days,
        )

    def _validate_mode(self, mode: str) -> str:
        resolved_mode = mode.lower()
        if resolved_mode not in SUPPORTED_DATASET_MODES:
            supported_modes = ", ".join(sorted(SUPPORTED_DATASET_MODES))
            raise ValueError(
                f"Unsupported dataset mode '{mode}'. Expected: {supported_modes}."
            )
        return resolved_mode

    def _resolve_stock_configs(
        self,
        mode: str,
        stock_id: str | None,
    ) -> list[dict[str, Any]]:
        if mode == "per_stock":
            if stock_id is None:
                raise ValueError("DatasetBuilder requires stock_id for per_stock mode.")
            stock = find_stock(self.config, stock_id)
            if stock is None:
                raise ValueError(f"Unknown stock '{stock_id}'.")
            return [stock]
        return list(self.config["active_stocks"])

    def _resolve_prediction_horizon_days(self, stock_configs: list[dict[str, Any]]) -> int:
        horizons = {int(stock["model"]["prediction_horizon_days"]) for stock in stock_configs}
        if len(horizons) != 1:
            raise ValueError("All selected stocks must share the same prediction horizon.")
        return horizons.pop()

    def _resolve_lookback_days(self) -> int:
        stft_config = self.config["signal_processing"]["stft"]
        return max(
            int(stft_config["window_length"]) * LOOKBACK_MULTIPLIER,
            int(stft_config["n_fft"]),
        )

    def _collect_samples(
        self,
        stock_configs: list[dict[str, Any]],
        transform: Any,
        lookback_days: int,
        prediction_horizon_days: int,
    ) -> tuple[list[TrainingSampleRecord], dict[str, ScalingMetadata]]:
        samples: list[TrainingSampleRecord] = []
        scalers: dict[str, ScalingMetadata] = {}
        expected_shape: tuple[int, ...] | None = None
        for stock_config in stock_configs:
            stock_samples, scaler = self._build_stock_samples(
                stock_config,
                transform,
                lookback_days,
                prediction_horizon_days,
            )
            samples.extend(stock_samples)
            scalers[stock_config["id"]] = scaler
            expected_shape = self._check_input_shape(stock_samples, expected_shape)
        if not samples:
            raise ValueError("DatasetBuilder produced zero samples.")
        return self._sort_samples(samples), scalers

    def _build_stock_samples(
        self,
        stock_config: dict[str, Any],
        transform: Any,
        lookback_days: int,
        prediction_horizon_days: int,
    ) -> tuple[list[TrainingSampleRecord], ScalingMetadata]:
        feature_series = self._load_feature_series(stock_config)
        scaler = ScalingMetadata(
            stock_id=stock_config["id"],
            minimum_value=feature_series.price_minimum_value,
            maximum_value=feature_series.price_maximum_value,
        )
        upper_bound = (
            len(feature_series.timestamps)
            - lookback_days
            - prediction_horizon_days
            + 1
        )
        if upper_bound <= 0:
            raise ValueError(f"Not enough history to build samples for {stock_config['id']}.")
        samples = [
            self._build_sample_record(
                stock_config["id"],
                start_index,
                lookback_days,
                prediction_horizon_days,
                feature_series,
                transform,
            )
            for start_index in range(upper_bound)
        ]
        return samples, scaler

    def _build_sample_record(
        self,
        stock_id: str,
        start_index: int,
        lookback_days: int,
        prediction_horizon_days: int,
        feature_series: FeatureSeries,
        transform: Any,
    ) -> TrainingSampleRecord:
        stop_index = start_index + lookback_days
        window_end_index = stop_index - 1
        label_index = window_end_index + prediction_horizon_days

        channel_spectrograms: list[np.ndarray] = []
        for channel_name in self.feature_channels:
            channel_values = feature_series.normalized_by_channel[channel_name]
            window_signal = channel_values[start_index:stop_index]
            spectrogram, _, _ = transform.transform(window_signal)
            channel_spectrograms.append(np.asarray(spectrogram, dtype=np.float32))

        stacked_inputs = np.stack(channel_spectrograms, axis=0)

        price_normalized = feature_series.normalized_price_values
        price_raw = feature_series.raw_price_values
        timestamps = feature_series.timestamps

        return TrainingSampleRecord(
            stock_id=stock_id,
            stock_index=self.stock_index[stock_id],
            inputs=stacked_inputs,
            target_normalized=float(price_normalized[label_index]),
            target_raw=float(price_raw[label_index]),
            reference_normalized=float(price_normalized[window_end_index]),
            reference_raw=float(price_raw[window_end_index]),
            window_end_timestamp=timestamps[window_end_index],
            label_timestamp=timestamps[label_index],
        )

    def build_latest_input_window(self, stock_config: dict[str, Any]) -> dict[str, Any]:
        feature_series = self._load_feature_series(stock_config)
        lookback_days = self._resolve_lookback_days()
        if len(feature_series.timestamps) < lookback_days:
            raise ValueError(
                f"Not enough aligned feature history to build a prediction window for {stock_config['id']}."
            )

        transform = get_transform(self.transform_name, self.config)
        channel_spectrograms: list[np.ndarray] = []
        for channel_name in self.feature_channels:
            channel_values = feature_series.normalized_by_channel[channel_name]
            window_signal = channel_values[-lookback_days:]
            spectrogram, _, _ = transform.transform(window_signal)
            channel_spectrograms.append(np.asarray(spectrogram, dtype=np.float32))

        stacked_inputs = np.stack(channel_spectrograms, axis=0)
        return {
            "inputs": np.expand_dims(stacked_inputs, axis=0),
            "ticker": feature_series.ticker,
            "transform_name": self.transform_name,
            "latest_close": float(feature_series.raw_price_values[-1]),
            "as_of_timestamp": feature_series.timestamps[-1],
            "signal_window_length": lookback_days,
            "feature_channels": list(self.feature_channels),
        }

    def _load_feature_series(self, stock_config: dict[str, Any]) -> FeatureSeries:
        return self.feature_series_loader.load(stock_config, self.feature_channels)

    def _check_input_shape(
        self,
        samples: list[TrainingSampleRecord],
        expected_shape: tuple[int, ...] | None,
    ) -> tuple[int, ...] | None:
        if not samples:
            return expected_shape
        sample_shape = tuple(samples[0].inputs.shape)
        if expected_shape is None:
            return sample_shape
        if sample_shape != expected_shape:
            raise ValueError(
                f"Inconsistent spectrogram shape {sample_shape}; expected {expected_shape}."
            )
        return expected_shape

    def _sort_samples(self, samples: list[TrainingSampleRecord]) -> list[TrainingSampleRecord]:
        return sorted(
            samples,
            key=lambda sample: (
                sample.label_timestamp,
                sample.stock_id,
                sample.window_end_timestamp,
            ),
        )

    def _split_samples(
        self,
        samples: list[TrainingSampleRecord],
    ) -> tuple[list[TrainingSampleRecord], list[TrainingSampleRecord], list[TrainingSampleRecord]]:
        total_samples = len(samples)
        train_ratio = float(self.config["training"]["split"]["train"])
        val_ratio = float(self.config["training"]["split"]["val"])
        train_end = int(total_samples * train_ratio)
        val_end = train_end + int(total_samples * val_ratio)
        return samples[:train_end], samples[train_end:val_end], samples[val_end:]
