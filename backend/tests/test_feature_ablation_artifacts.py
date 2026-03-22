from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from training.feature_ablation_importer import import_feature_ablation_bundle
from training.feature_ablation_notebook_generator import FeatureAblationNotebookGenerator


class FeatureAblationArtifactTests(unittest.TestCase):
    def test_imports_feature_ablation_bundle_into_store_layout(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            bundle_root = temp_path / "chronospectra_feature_ablation_artifacts" / "reports"
            bundle_root.mkdir(parents=True, exist_ok=True)

            report_path = bundle_root / "RELIANCE_per_stock_feature_ablation_report.json"
            report_path.write_text(
                json.dumps(
                    {
                        "stock_id": "RELIANCE",
                        "mode": "per_stock",
                        "generated_at": "2026-03-22T12:00:00Z",
                        "configured_channels": _feature_channels(),
                        "transform_name": "stft",
                        "entries": [
                            {
                                "label": "baseline",
                                "channels": _feature_channels(),
                                "removed_channel": None,
                                "mse": 1.2,
                                "rmse": 1.1,
                                "mae": 0.9,
                                "mape": 2.2,
                                "directional_accuracy": 61.0,
                                "delta_mse": None,
                                "delta_rmse": None,
                                "delta_mae": None,
                                "delta_mape": None,
                                "delta_directional_accuracy": None,
                            }
                        ],
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

            bundle_zip_path = temp_path / "feature_ablation_bundle.zip"
            with zipfile.ZipFile(bundle_zip_path, "w") as archive:
                for file_path in report_path.parent.parent.rglob("*"):
                    if file_path.is_file():
                        archive.write(file_path, file_path.relative_to(temp_path))

            destination_dir = temp_path / "model_store" / "feature_ablation"
            result = import_feature_ablation_bundle(
                bundle_zip_path,
                _app_config(),
                destination_dir=destination_dir,
            )

            expected_report = (
                destination_dir / "RELIANCE_per_stock_feature_ablation_report.json"
            )
            expected_aggregate = destination_dir / "feature_ablation_report.json"

            self.assertTrue(expected_report.exists())
            self.assertTrue(expected_aggregate.exists())
            self.assertEqual(result.imported_stock_ids, ["RELIANCE"])
            self.assertEqual(result.imported_modes, ["per_stock"])

            stored_payload = json.loads(expected_report.read_text(encoding="utf-8"))
            self.assertEqual(stored_payload["stock_id"], "RELIANCE")
            self.assertEqual(stored_payload["configured_channels"], _feature_channels())

    def test_generates_feature_ablation_notebook_in_dedicated_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            generator = FeatureAblationNotebookGenerator(
                _app_config(),
                output_dir=Path(temp_dir),
            )
            output_path = generator.generate("per_stock")

            self.assertTrue(output_path.exists())
            self.assertEqual(output_path.name, "chronospectra_per_stock_feature_ablation.ipynb")
            notebook_payload = json.loads(output_path.read_text(encoding="utf-8"))
            cells = notebook_payload.get("cells", [])
            joined_sources = "\n".join(str(cell.get("source", "")) for cell in cells)
            self.assertIn("Feature Ablation Notebook", joined_sources)
            self.assertIn("chronospectra_feature_ablation_artifacts", joined_sources)


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
