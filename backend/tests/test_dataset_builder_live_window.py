from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.append(str(Path(__file__).resolve().parents[1]))

from data.base_fetcher import PricePoint
from data.cache.data_cache import DataCache
from data.feature_series_loader import FeatureSeries
from training.dataset_builder import DatasetBuilder


class DatasetBuilderLiveWindowTests(unittest.TestCase):
    def test_live_price_extends_latest_input_window_to_current_session(self) -> None:
        builder = DatasetBuilder(_app_config(), DataCache())
        stock = _app_config()["active_stocks"][0]
        base_series = FeatureSeries(
            stock_id="RELIANCE",
            ticker="RELIANCE.NS",
            timestamps=[
                "2026-03-12T00:00:00",
                "2026-03-13T00:00:00",
                "2026-03-16T00:00:00",
                "2026-03-17T00:00:00",
                "2026-03-18T00:00:00",
                "2026-03-19T00:00:00",
                "2026-03-20T00:00:00",
                "2026-03-23T00:00:00",
            ],
            raw_by_channel={
                "price": np.array([101.0, 102.5, 103.0, 104.0, 105.5, 106.0, 107.0, 108.0]),
            },
            normalized_by_channel={
                "price": np.linspace(0.0, 1.0, num=8, dtype=float),
            },
            minimum_by_channel={"price": 101.0},
            maximum_by_channel={"price": 108.0},
        )

        builder._load_feature_series = lambda stock_config: base_series  # type: ignore[method-assign]

        baseline_window = builder.build_latest_input_window(stock)
        live_window = builder.build_latest_input_window(
            stock,
            live_price=PricePoint(
                timestamp="2026-03-24T09:21:00",
                open=108.5,
                high=109.5,
                low=108.0,
                close=112.0,
                volume=12345,
            ),
        )

        self.assertEqual(baseline_window["as_of_timestamp"], "2026-03-23T00:00:00")
        self.assertEqual(live_window["as_of_timestamp"], "2026-03-24T09:21:00")
        self.assertEqual(live_window["latest_close"], 112.0)
        self.assertFalse(np.allclose(baseline_window["inputs"], live_window["inputs"]))


def _app_config() -> dict[str, object]:
    active_stocks = [
        {
            "id": "RELIANCE",
            "ticker": "RELIANCE.NS",
            "display_name": "Reliance Industries",
            "exchange": "NSE",
            "enabled": True,
            "model": {
                "prediction_horizon_days": 5,
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
                "window_length": 2,
                "hop_size": 1,
                "window_function": "hann",
                "n_fft": 2,
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
        "active_stocks": active_stocks,
    }


if __name__ == "__main__":
    unittest.main()
