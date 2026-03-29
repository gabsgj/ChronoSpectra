from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.append(str(Path(__file__).resolve().parents[1]))

from data.base_fetcher import PricePoint
from data.cache.data_cache import DataCache
from data.feature_series_loader import FeatureSeries
from training import dataset_builder as dataset_builder_module
from training.dataset_builder import DatasetBuilder
from training.training_types import ScalingArtifact, ScalingMetadata


class IdentityTransform:
    def transform(self, window_signal: np.ndarray) -> tuple[np.ndarray, None, None]:
        return np.asarray([window_signal], dtype=float), None, None


class DatasetBuilderScalingTests(unittest.TestCase):
    def test_build_uses_train_only_scalers_for_targets(self) -> None:
        builder = DatasetBuilder(_dataset_config(), DataCache())
        stock = _dataset_config()["active_stocks"][0]
        feature_series = FeatureSeries(
            stock_id="RELIANCE",
            ticker="RELIANCE.NS",
            timestamps=[f"2026-03-{day:02d}T00:00:00" for day in range(1, 11)],
            raw_by_channel={
                "price": np.array([10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 100.0, 101.0, 102.0]),
            },
            normalized_by_channel={
                "price": np.linspace(0.0, 1.0, num=10, dtype=float),
            },
            minimum_by_channel={"price": 10.0},
            maximum_by_channel={"price": 102.0},
        )

        builder._load_feature_series = lambda stock_config: feature_series  # type: ignore[method-assign]
        original_get_transform = dataset_builder_module.get_transform
        dataset_builder_module.get_transform = lambda *args, **kwargs: IdentityTransform()
        try:
            bundle = builder.build("per_stock", stock["id"])
        finally:
            dataset_builder_module.get_transform = original_get_transform
        scaler = bundle.scalers_by_stock["RELIANCE"]

        self.assertEqual(scaler.minimum_value, 10.0)
        self.assertEqual(scaler.maximum_value, 16.0)
        self.assertGreater(float(bundle.test_dataset[0]["target"].item()), 1.0)

    def test_latest_window_uses_provided_feature_scaler_for_live_values(self) -> None:
        builder = DatasetBuilder(_live_window_config(), DataCache())
        stock = _live_window_config()["active_stocks"][0]
        feature_series = FeatureSeries(
            stock_id="RELIANCE",
            ticker="RELIANCE.NS",
            timestamps=[
                "2026-03-12T00:00:00",
                "2026-03-13T00:00:00",
                "2026-03-16T00:00:00",
                "2026-03-17T00:00:00",
            ],
            raw_by_channel={
                "price": np.array([10.0, 11.0, 12.0, 13.0]),
            },
            normalized_by_channel={
                "price": np.array([0.0, 1 / 3, 2 / 3, 1.0], dtype=float),
            },
            minimum_by_channel={"price": 10.0},
            maximum_by_channel={"price": 13.0},
        )
        scaler = ScalingArtifact(
            stock_id="RELIANCE",
            price_scaler=ScalingMetadata(
                stock_id="RELIANCE",
                minimum_value=10.0,
                maximum_value=13.0,
            ),
            channel_scalers={
                "price": ScalingMetadata(
                    stock_id="RELIANCE",
                    minimum_value=10.0,
                    maximum_value=13.0,
                )
            },
        )

        builder._load_feature_series = lambda stock_config: feature_series  # type: ignore[method-assign]

        original_get_transform = dataset_builder_module.get_transform
        dataset_builder_module.get_transform = lambda *args, **kwargs: IdentityTransform()
        try:
            baseline_window = builder.build_latest_input_window(
                stock,
                live_price=PricePoint(
                    timestamp="2026-03-18T09:21:00",
                    open=13.5,
                    high=20.5,
                    low=13.0,
                    close=20.0,
                    volume=12345,
                ),
            )
            scaled_window = builder.build_latest_input_window(
                stock,
                live_price=PricePoint(
                    timestamp="2026-03-18T09:21:00",
                    open=13.5,
                    high=20.5,
                    low=13.0,
                    close=20.0,
                    volume=12345,
                ),
                scaler=scaler,
            )
        finally:
            dataset_builder_module.get_transform = original_get_transform

        self.assertEqual(float(baseline_window["inputs"][0, 0, 0, -1]), 1.0)
        self.assertGreater(float(scaled_window["inputs"][0, 0, 0, -1]), 3.0)


def _dataset_config() -> dict[str, object]:
    active_stocks = [
        {
            "id": "RELIANCE",
            "ticker": "RELIANCE.NS",
            "display_name": "Reliance Industries",
            "exchange": "NSE",
            "enabled": True,
            "model": {
                "prediction_horizon_days": 1,
                "training_data_years": 7,
                "retrain_interval_days": 30,
            },
        }
    ]
    return {
        "model_mode": "per_stock",
        "signal_processing": {
            "default_transform": "stft",
            "stft": {
                "window_length": 1,
                "hop_size": 1,
                "window_function": "hann",
                "n_fft": 1,
            },
        },
        "training": {
            "feature_channels": ["price"],
            "split": {
                "train": 0.5,
                "val": 0.25,
                "test": 0.25,
            },
            "epochs": 1,
            "batch_size": 1,
            "learning_rate": 0.001,
            "split_strategy": "time_based",
        },
        "stocks": active_stocks,
        "active_stocks": active_stocks,
    }


def _live_window_config() -> dict[str, object]:
    active_stocks = [
        {
            "id": "RELIANCE",
            "ticker": "RELIANCE.NS",
            "display_name": "Reliance Industries",
            "exchange": "NSE",
            "enabled": True,
            "model": {
                "prediction_horizon_days": 1,
                "training_data_years": 7,
                "retrain_interval_days": 30,
            },
        }
    ]
    return {
        "model_mode": "per_stock",
        "signal_processing": {
            "default_transform": "stft",
            "stft": {
                "window_length": 1,
                "hop_size": 1,
                "window_function": "hann",
                "n_fft": 1,
            },
        },
        "training": {
            "feature_channels": ["price"],
            "split": {
                "train": 0.7,
                "val": 0.15,
                "test": 0.15,
            },
            "epochs": 1,
            "batch_size": 1,
            "learning_rate": 0.001,
            "split_strategy": "time_based",
        },
        "stocks": active_stocks,
        "active_stocks": active_stocks,
    }


if __name__ == "__main__":
    unittest.main()
