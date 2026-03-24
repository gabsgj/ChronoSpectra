from __future__ import annotations

import pickle
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from models.model_registry import ModelRegistry
from routes.model import coerce_scaling_metadata_or_error, load_scaler_or_error
from training.training_types import ScalingMetadata


class PredictionScalerLoadingTests(unittest.TestCase):
    def test_accepts_legacy_dict_scaler_artifacts(self) -> None:
        scaler = coerce_scaling_metadata_or_error(
            "RELIANCE",
            {
                "minimum_value": 100.0,
                "maximum_value": 250.0,
            },
            Path("legacy_scaler.pkl"),
        )

        self.assertIsInstance(scaler, ScalingMetadata)
        self.assertEqual(scaler.stock_id, "RELIANCE")
        self.assertEqual(scaler.minimum_value, 100.0)
        self.assertEqual(scaler.maximum_value, 250.0)

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
