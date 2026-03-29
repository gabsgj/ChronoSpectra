from __future__ import annotations

from datetime import datetime
from typing import Any

import numpy as np

from config import find_stock
from data.base_fetcher import PricePoint
from data.feature_series_loader import FeatureSeries, FeatureSeriesLoader
from data.cache.data_cache import DataCache
from signal_processing.transforms import get_transform
from training.feature_channels import resolve_feature_channels
from training.training_types import (
    DatasetBundle,
    ScalingArtifact,
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
    ) -> tuple[list[TrainingSampleRecord], dict[str, ScalingArtifact]]:
        samples: list[TrainingSampleRecord] = []
        scalers: dict[str, ScalingArtifact] = {}
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
    ) -> tuple[list[TrainingSampleRecord], ScalingArtifact]:
        feature_series = self._load_feature_series(stock_config)
        upper_bound = (
            len(feature_series.timestamps)
            - lookback_days
            - prediction_horizon_days
            + 1
        )
        if upper_bound <= 0:
            raise ValueError(f"Not enough history to build samples for {stock_config['id']}.")
        scaler = self._fit_scaling_artifact(
            stock_config["id"],
            feature_series,
            upper_bound,
            lookback_days,
            prediction_horizon_days,
        )
        normalized_channels = self._normalize_training_channels(feature_series, scaler)
        samples = [
            self._build_sample_record(
                stock_config["id"],
                start_index,
                lookback_days,
                prediction_horizon_days,
                feature_series,
                normalized_channels,
                transform,
            )
            for start_index in range(upper_bound)
        ]
        return samples, scaler

    def _fit_scaling_artifact(
        self,
        stock_id: str,
        feature_series: FeatureSeries,
        total_samples: int,
        lookback_days: int,
        prediction_horizon_days: int,
    ) -> ScalingArtifact:
        train_end, _ = self._split_bounds(total_samples)
        if train_end <= 0:
            raise ValueError(
                f"Training split produced zero samples for {stock_id}. Increase the "
                "training split ratio or fetch more history."
            )

        training_series_end = min(
            train_end + lookback_days + prediction_horizon_days - 1,
            len(feature_series.timestamps),
        )
        channel_scalers: dict[str, ScalingMetadata] = {}
        
        required_channels = set(self.feature_channels)
        required_channels.add("price")

        for channel_name in required_channels:
            training_values = np.asarray(
                feature_series.raw_by_channel[channel_name][:training_series_end],
                dtype=float,
            )
            channel_scalers[channel_name] = ScalingMetadata(
                stock_id=stock_id,
                minimum_value=float(np.min(training_values)),
                maximum_value=float(np.max(training_values)),
            )

        return ScalingArtifact(
            stock_id=stock_id,
            price_scaler=channel_scalers["price"],
            channel_scalers=channel_scalers,
        )

    def _normalize_training_channels(
        self,
        feature_series: FeatureSeries,
        scaler: ScalingArtifact,
    ) -> dict[str, np.ndarray]:
        required_channels = set(self.feature_channels)
        required_channels.add("price")
        return {
            channel_name: scaler.normalize_channel(
                channel_name,
                feature_series.raw_by_channel[channel_name],
            )
            for channel_name in required_channels
        }

    def _build_sample_record(
        self,
        stock_id: str,
        start_index: int,
        lookback_days: int,
        prediction_horizon_days: int,
        feature_series: FeatureSeries,
        normalized_channels: dict[str, np.ndarray],
        transform: Any,
    ) -> TrainingSampleRecord:
        stop_index = start_index + lookback_days
        window_end_index = stop_index - 1
        label_index = window_end_index + prediction_horizon_days

        channel_spectrograms: list[np.ndarray] = []
        for channel_name in self.feature_channels:
            channel_values = normalized_channels[channel_name]
            window_signal = channel_values[start_index:stop_index]
            spectrogram, _, _ = transform.transform(window_signal)
            channel_spectrograms.append(np.asarray(spectrogram, dtype=np.float32))

        stacked_inputs = np.stack(channel_spectrograms, axis=0)

        price_normalized = normalized_channels["price"]
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

    def build_latest_input_window(
        self,
        stock_config: dict[str, Any],
        live_price: PricePoint | None = None,
        scaler: ScalingArtifact | None = None,
    ) -> dict[str, Any]:
        feature_series = self._load_feature_series(stock_config)
        if live_price is not None:
            feature_series = self._apply_live_price(feature_series, live_price)
        lookback_days = self._resolve_lookback_days()
        if len(feature_series.timestamps) < lookback_days:
            raise ValueError(
                f"Not enough aligned feature history to build a prediction window for {stock_config['id']}."
            )

        transform = get_transform(self.transform_name, self.config)
        normalized_channels = self._normalize_prediction_channels(feature_series, scaler)
        channel_spectrograms: list[np.ndarray] = []
        for channel_name in self.feature_channels:
            channel_values = normalized_channels[channel_name]
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

    def _normalize_prediction_channels(
        self,
        feature_series: FeatureSeries,
        scaler: ScalingArtifact | None,
    ) -> dict[str, np.ndarray]:
        if scaler is not None and scaler.supports_channels(self.feature_channels):
            return {
                channel_name: scaler.normalize_channel(
                    channel_name,
                    feature_series.raw_by_channel[channel_name],
                )
                for channel_name in self.feature_channels
            }
        return {
            channel_name: np.asarray(feature_series.normalized_by_channel[channel_name], dtype=float)
            for channel_name in self.feature_channels
        }

    def _apply_live_price(
        self,
        feature_series: FeatureSeries,
        live_price: PricePoint,
    ) -> FeatureSeries:
        try:
            live_timestamp = datetime.fromisoformat(live_price.timestamp)
            latest_feature_timestamp = datetime.fromisoformat(feature_series.timestamps[-1])
        except (IndexError, ValueError):
            return feature_series

        if live_timestamp.date() < latest_feature_timestamp.date():
            return feature_series

        append_new_row = live_timestamp.date() > latest_feature_timestamp.date()
        updated_timestamps = list(feature_series.timestamps)
        if append_new_row:
            updated_timestamps.append(live_price.timestamp)
        else:
            updated_timestamps[-1] = live_price.timestamp

        raw_by_channel: dict[str, np.ndarray] = {}
        normalized_by_channel: dict[str, np.ndarray] = {}
        minimum_by_channel: dict[str, float] = {}
        maximum_by_channel: dict[str, float] = {}

        for channel_name, raw_values in feature_series.raw_by_channel.items():
            updated_values = np.asarray(raw_values, dtype=float).copy()
            next_value = float(live_price.close) if channel_name == "price" else float(updated_values[-1])
            if append_new_row:
                updated_values = np.concatenate((updated_values, np.array([next_value], dtype=float)))
            else:
                updated_values[-1] = next_value

            minimum_value = float(np.min(updated_values))
            maximum_value = float(np.max(updated_values))
            scale = maximum_value - minimum_value
            if scale == 0:
                normalized_values = np.zeros_like(updated_values, dtype=float)
            else:
                normalized_values = (updated_values - minimum_value) / scale

            raw_by_channel[channel_name] = updated_values
            normalized_by_channel[channel_name] = normalized_values
            minimum_by_channel[channel_name] = minimum_value
            maximum_by_channel[channel_name] = maximum_value

        return FeatureSeries(
            stock_id=feature_series.stock_id,
            ticker=feature_series.ticker,
            timestamps=updated_timestamps,
            raw_by_channel=raw_by_channel,
            normalized_by_channel=normalized_by_channel,
            minimum_by_channel=minimum_by_channel,
            maximum_by_channel=maximum_by_channel,
        )

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
        train_end, val_end = self._split_bounds(total_samples)
        return samples[:train_end], samples[train_end:val_end], samples[val_end:]

    def _split_bounds(self, total_samples: int) -> tuple[int, int]:
        train_ratio = float(self.config["training"]["split"]["train"])
        val_ratio = float(self.config["training"]["split"]["val"])
        train_end = int(total_samples * train_ratio)
        val_end = train_end + int(total_samples * val_ratio)
        return train_end, val_end
