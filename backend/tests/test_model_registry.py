from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import torch

sys.path.append(str(Path(__file__).resolve().parents[1]))

from models.per_stock_cnn import PerStockCNN
from models.model_registry import ModelRegistry


class ModelRegistryCompatibilityTests(unittest.TestCase):
    def test_returns_incompatible_error_for_mismatched_checkpoint_channels(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            model_store_dir = Path(temp_dir)
            per_stock_dir = model_store_dir / "per_stock"
            per_stock_dir.mkdir(parents=True, exist_ok=True)

            checkpoint_path = per_stock_dir / "RELIANCE_model.pth"
            torch.save(PerStockCNN(in_channels=1).state_dict(), checkpoint_path)

            registry = ModelRegistry(
                _app_config(feature_channels=["price", "index", "usd_inr", "revenue", "profit"]),
                model_store_dir=model_store_dir,
            )

            load_result = registry.load_model("per_stock", "RELIANCE")

            self.assertFalse(load_result.is_available)
            self.assertIsNotNone(load_result.error)
            assert load_result.error is not None
            self.assertEqual(load_result.error["error"], "incompatible_model_artifact")
            self.assertIn("1 input channel", load_result.error["detail"])
            self.assertIn("5 channel", load_result.error["detail"])

    def test_returns_incompatible_error_for_report_channel_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            model_store_dir = Path(temp_dir)
            per_stock_dir = model_store_dir / "per_stock"
            report_dir = model_store_dir / "reports"
            per_stock_dir.mkdir(parents=True, exist_ok=True)
            report_dir.mkdir(parents=True, exist_ok=True)

            checkpoint_path = per_stock_dir / "RELIANCE_model.pth"
            torch.save(PerStockCNN(in_channels=5).state_dict(), checkpoint_path)
            report_path = report_dir / "RELIANCE_training_report.json"
            report_path.write_text(
                json.dumps({"feature_channels": ["price"]}),
                encoding="utf-8",
            )

            registry = ModelRegistry(
                _app_config(feature_channels=["price", "index", "usd_inr", "revenue", "profit"]),
                model_store_dir=model_store_dir,
            )

            load_result = registry.load_model("per_stock", "RELIANCE")

            self.assertFalse(load_result.is_available)
            self.assertIsNotNone(load_result.error)
            assert load_result.error is not None
            self.assertEqual(load_result.error["error"], "incompatible_model_artifact")
            self.assertIn("trained with feature channels ['price']", load_result.error["detail"])


def _app_config(feature_channels: list[str]) -> dict[str, object]:
    stocks = [
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
        "training": {"feature_channels": feature_channels},
        "active_stocks": stocks,
    }


if __name__ == "__main__":
    unittest.main()
