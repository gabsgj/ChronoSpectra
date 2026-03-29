from __future__ import annotations

import numpy as np
import pickle
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from models.model_registry import ModelRegistry
from routes.model import coerce_scaling_artifact_or_error, load_scaler_or_error
from training.training_types import ScalingArtifact


class PredictionScalerLoadingTests(unittest.TestCase):
    def test_accepts_legacy_dict_scaler_artifacts(self) -> None:
        scaler = coerce_scaling_artifact_or_error(
            "RELIANCE",
            {
                "minimum_value": 100.0,
                "maximum_value": 250.0,
            },
            Path("legacy_scaler.pkl"),
        )

        self.assertIsInstance(scaler, ScalingArtifact)
        self.assertEqual(scaler.stock_id, "RELIANCE")
        self.assertEqual(scaler.minimum_value, 100.0)
        self.assertEqual(scaler.maximum_value, 250.0)
        self.assertEqual(scaler.channel_scalers, {})

    def test_accepts_channel_scalers_from_dict_artifacts(self) -> None:
        scaler = coerce_scaling_artifact_or_error(
            "RELIANCE",
            {
                "stock_id": "RELIANCE",
                "minimum_value": 100.0,
                "maximum_value": 250.0,
                "channel_scalers": {
                    "price": {"minimum_value": 100.0, "maximum_value": 250.0},
                    "index": {"minimum_value": 18000.0, "maximum_value": 22000.0},
                },
            },
            Path("channel_scaler.pkl"),
        )

        self.assertIsInstance(scaler, ScalingArtifact)
        self.assertTrue(scaler.supports_channels(["price", "index"]))
        self.assertAlmostEqual(
            float(scaler.normalize_channel("index", np.array([20000.0]))[0]),
            0.5,
        )

    def test_load_scaler_or_error_uses_legacy_dict_scaler_on_disk(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            model_store_dir = Path(temp_dir)
            scalers_dir = model_store_dir / "scalers"
            scalers_dir.mkdir(parents=True, exist_ok=True)

            with (scalers_dir / "RELIANCE_scaler.pkl").open("wb") as handle:
                pickle.dump(
                    {
                        "minimum_value": 123.0,
                        "maximum_value": 456.0,
                    },
                    handle,
                )

            registry = ModelRegistry(
                _app_config(),
                model_store_dir=model_store_dir,
            )

            scaler = load_scaler_or_error(registry, "RELIANCE")

            self.assertEqual(scaler.stock_id, "RELIANCE")
            self.assertEqual(scaler.minimum_value, 123.0)
            self.assertEqual(scaler.maximum_value, 456.0)
            self.assertEqual(scaler.channel_scalers, {})


def _app_config() -> dict[str, object]:
    return {
        "model_mode": "per_stock",
        "training": {"feature_channels": ["price"]},
        "active_stocks": [
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
        ],
    }


if __name__ == "__main__":
    unittest.main()
