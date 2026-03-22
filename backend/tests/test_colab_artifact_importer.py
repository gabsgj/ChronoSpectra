from __future__ import annotations

import json
import pickle
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

import torch

sys.path.append(str(Path(__file__).resolve().parents[1]))

from models.per_stock_cnn import PerStockCNN
from training.colab_artifact_importer import import_colab_artifact_bundle
from training.training_types import ScalingMetadata


class ColabArtifactImporterTests(unittest.TestCase):
    def test_imports_per_stock_bundle_into_model_store_layout(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            bundle_root = temp_path / "chronospectra_artifacts"
            scalers_dir = bundle_root / "scalers"
            scalers_dir.mkdir(parents=True, exist_ok=True)

            checkpoint_path = bundle_root / "RELIANCE_model.pth"
            torch.save(PerStockCNN(in_channels=5).state_dict(), checkpoint_path)

            scaler_path = scalers_dir / "RELIANCE_scaler.pkl"
            with scaler_path.open("wb") as handle:
                pickle.dump(
                    ScalingMetadata(
                        stock_id="RELIANCE",
                        minimum_value=100.0,
                        maximum_value=200.0,
                    ),
                    handle,
                )

            training_report_path = bundle_root / "training_report.json"
            training_report_path.write_text(
                json.dumps(
                    [
                        {
                            "mode": "per_stock",
                            "checkpoint_path": "chronospectra_artifacts/RELIANCE_model.pth",
                            "feature_channels": [
                                "price",
                                "index",
                                "usd_inr",
                                "revenue",
                                "profit",
                            ],
                            "lookback_days": 256,
                            "prediction_horizon_days": 5,
                            "dataset_summary": {
                                "train_count": 10,
                                "val_count": 2,
                                "test_count": 3,
                                "input_shape": [5, 65, 13],
                                "feature_channels": [
                                    "price",
                                    "index",
                                    "usd_inr",
                                    "revenue",
                                    "profit",
                                ],
                            },
                            "history": [
                                {"epoch": 1, "train_loss": 0.5, "val_loss": 0.4},
                                {"epoch": 2, "train_loss": 0.3, "val_loss": 0.2},
                            ],
                            "metrics": {
                                "mse": 1.25,
                                "rmse": 1.118,
                                "mae": 0.9,
                                "mape": 2.4,
                                "directional_accuracy": 55.0,
                            },
                        }
                    ],
                    indent=2,
                ),
                encoding="utf-8",
            )

            bundle_zip_path = temp_path / "colab_bundle.zip"
            with zipfile.ZipFile(bundle_zip_path, "w") as archive:
                for file_path in bundle_root.rglob("*"):
                    if file_path.is_file():
                        archive.write(file_path, file_path.relative_to(temp_path))

            destination_store = temp_path / "model_store"
            result = import_colab_artifact_bundle(
                bundle_zip_path,
                _app_config(),
                model_store_dir=destination_store,
            )

            expected_checkpoint = destination_store / "per_stock" / "RELIANCE_model.pth"
            expected_report = destination_store / "reports" / "RELIANCE_training_report.json"
            expected_scaler = destination_store / "scalers" / "RELIANCE_scaler.pkl"
            expected_aggregate_report = destination_store / "reports" / "training_report.json"

            self.assertTrue(expected_checkpoint.exists())
            self.assertTrue(expected_report.exists())
            self.assertTrue(expected_scaler.exists())
            self.assertTrue(expected_aggregate_report.exists())
            self.assertEqual(result.imported_modes, ["per_stock"])
            self.assertEqual(result.imported_stock_ids, ["RELIANCE"])

            imported_report = json.loads(expected_report.read_text(encoding="utf-8"))
            self.assertEqual(imported_report["stock_id"], "RELIANCE")
            self.assertEqual(imported_report["mode"], "per_stock")
            self.assertEqual(imported_report["feature_channels"], _feature_channels())
            self.assertEqual(
                imported_report["artifacts"]["checkpoint_path"],
                str(expected_checkpoint),
            )


def _app_config() -> dict[str, object]:
    return {
        "model_mode": "per_stock",
        "stock_ids": ["RELIANCE"],
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
        "signal_processing": {"default_transform": "stft"},
        "training": {"feature_channels": _feature_channels()},
    }


def _feature_channels() -> list[str]:
    return ["price", "index", "usd_inr", "revenue", "profit"]


if __name__ == "__main__":
    unittest.main()
