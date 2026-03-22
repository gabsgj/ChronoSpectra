from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch

from models.base_model import (
    MODEL_STORE_DIR,
    PER_STOCK_MODEL_DIR,
    SCALER_STORE_DIR,
    UNIFIED_MODEL_DIR,
    BaseModel,
)
from models.per_stock_cnn import PerStockCNN
from models.unified_cnn import UnifiedCNN
from models.unified_cnn_with_embeddings import UnifiedCNNWithEmbeddings
from training.feature_channels import resolve_feature_channels

MODEL_NOT_TRAINED_HINT = (
    "Trigger local training or run the Colab notebook to generate the checkpoint in "
    "model_store/."
)
MODEL_INCOMPATIBLE_HINT = (
    "Retrain the model artifacts so they match the current backend config before "
    "requesting predictions."
)
SUPPORTED_MODEL_MODES = {"per_stock", "unified", "unified_with_embeddings", "both"}


@dataclass(slots=True)
class ModelLoadResult:
    mode: str
    model: BaseModel | None
    artifact_path: Path
    error: dict[str, str] | None = None

    @property
    def is_available(self) -> bool:
        return self.model is not None


class ModelRegistry:
    def __init__(
        self,
        app_config: dict[str, Any],
        model_store_dir: Path | None = None,
        map_location: str | torch.device = "cpu",
    ) -> None:
        self.config = app_config
        self.model_mode = self._resolve_model_mode()
        self.model_store_dir = (model_store_dir or MODEL_STORE_DIR).resolve()
        self.per_stock_dir = self._resolve_store_subdir(PER_STOCK_MODEL_DIR, "per_stock")
        self.unified_dir = self._resolve_store_subdir(UNIFIED_MODEL_DIR, "unified")
        self.scaler_dir = self._resolve_store_subdir(SCALER_STORE_DIR, "scalers")
        self.report_dir = self.model_store_dir / "reports"
        self.map_location = map_location
        self.stock_ids = [stock["id"] for stock in app_config["active_stocks"]]
        self.stock_index = {stock_id: index for index, stock_id in enumerate(self.stock_ids)}
        self.feature_channels = resolve_feature_channels(app_config)
        self.input_channels = len(self.feature_channels)

    def configured_modes(self) -> list[str]:
        if self.model_mode == "both":
            return ["per_stock", "unified", "unified_with_embeddings"]
        return [self.model_mode]

    def get_prediction_mode(self) -> str:
        if self.model_mode == "both":
            return "unified_with_embeddings"
        return self.model_mode

    def load_model(self, mode: str, stock_id: str) -> ModelLoadResult:
        self._require_stock(stock_id)
        artifact_path = self.resolve_model_path(mode, stock_id)
        if not artifact_path.exists():
            return ModelLoadResult(
                mode=mode,
                model=None,
                artifact_path=artifact_path,
                error=self.build_model_not_trained_response(),
            )
        model = self._instantiate_model(mode)
        try:
            state_dict = self._load_state_dict(artifact_path)
        except ValueError as exc:
            return ModelLoadResult(
                mode=mode,
                model=None,
                artifact_path=artifact_path,
                error=self.build_invalid_model_artifact_response(str(exc)),
            )

        compatibility_error = self._validate_checkpoint_compatibility(
            mode,
            stock_id,
            state_dict,
        )
        if compatibility_error is not None:
            return ModelLoadResult(
                mode=mode,
                model=None,
                artifact_path=artifact_path,
                error=compatibility_error,
            )

        try:
            model.load_state_dict(state_dict)
        except RuntimeError as exc:
            return ModelLoadResult(
                mode=mode,
                model=None,
                artifact_path=artifact_path,
                error=self.build_incompatible_model_response(str(exc)),
            )
        model.eval()
        return ModelLoadResult(mode=mode, model=model, artifact_path=artifact_path)

    def load_configured_models(self, stock_id: str) -> dict[str, ModelLoadResult]:
        return {mode: self.load_model(mode, stock_id) for mode in self.configured_modes()}

    def load_prediction_model(self, stock_id: str) -> ModelLoadResult:
        return self.load_model(self.get_prediction_mode(), stock_id)

    def resolve_model_path(self, mode: str, stock_id: str) -> Path:
        candidate_paths = self._candidate_model_paths(mode, stock_id)
        existing_path = next((path for path in candidate_paths if path.exists()), None)
        if existing_path is not None:
            return existing_path
        return candidate_paths[0]

    def resolve_scaler_path(self, stock_id: str) -> Path:
        self._require_stock(stock_id)
        return self.scaler_dir / f"{stock_id}_scaler.pkl"

    def resolve_stock_index(self, stock_id: str) -> int:
        self._require_stock(stock_id)
        return self.stock_index[stock_id]

    def build_model_not_trained_response(self) -> dict[str, str]:
        return {
            "error": "model_not_trained",
            "hint": MODEL_NOT_TRAINED_HINT,
        }

    def build_invalid_model_artifact_response(self, reason: str) -> dict[str, str]:
        return {
            "error": "invalid_model_artifact",
            "detail": reason,
            "hint": MODEL_INCOMPATIBLE_HINT,
        }

    def build_incompatible_model_response(self, reason: str) -> dict[str, str]:
        return {
            "error": "incompatible_model_artifact",
            "detail": reason,
            "hint": MODEL_INCOMPATIBLE_HINT,
        }

    def _resolve_model_mode(self) -> str:
        mode = str(self.config.get("model_mode", "per_stock"))
        if mode not in SUPPORTED_MODEL_MODES:
            supported_modes = ", ".join(sorted(SUPPORTED_MODEL_MODES))
            raise ValueError(
                f"Unsupported model_mode '{mode}'. Expected one of: {supported_modes}."
            )
        return mode

    def _resolve_store_subdir(self, default_path: Path, leaf_name: str) -> Path:
        resolved_default_path = default_path.resolve()
        if resolved_default_path.parent == self.model_store_dir:
            return resolved_default_path
        return self.model_store_dir / leaf_name

    def _candidate_model_paths(self, mode: str, stock_id: str) -> list[Path]:
        if mode == "per_stock":
            return [self.per_stock_dir / f"{stock_id}_model.pth"]
        if mode == "unified":
            return [self.unified_dir / "unified_model.pth"]
        if mode == "unified_with_embeddings":
            return [
                self.unified_dir / "unified_with_embeddings_model.pth",
                self.unified_dir / "unified_model_with_embeddings.pth",
            ]
        raise ValueError(f"Unsupported model mode '{mode}'.")

    def _instantiate_model(self, mode: str) -> BaseModel:
        if mode == "per_stock":
            return PerStockCNN(in_channels=self.input_channels)
        if mode == "unified":
            return UnifiedCNN(in_channels=self.input_channels)
        if mode == "unified_with_embeddings":
            return UnifiedCNNWithEmbeddings(
                num_stocks=len(self.stock_ids),
                in_channels=self.input_channels,
            )
        raise ValueError(f"Unsupported model mode '{mode}'.")

    def _load_state_dict(self, artifact_path: Path) -> dict[str, torch.Tensor]:
        loaded_artifact = torch.load(artifact_path, map_location=self.map_location)
        if isinstance(loaded_artifact, dict) and "state_dict" in loaded_artifact:
            nested_state_dict = loaded_artifact["state_dict"]
            if isinstance(nested_state_dict, dict):
                return nested_state_dict
        if isinstance(loaded_artifact, dict):
            return loaded_artifact
        raise ValueError(f"Unsupported model artifact format in '{artifact_path.name}'.")

    def _validate_checkpoint_compatibility(
        self,
        mode: str,
        stock_id: str,
        state_dict: dict[str, torch.Tensor],
    ) -> dict[str, str] | None:
        report_channels = self._load_report_feature_channels(mode, stock_id)
        if report_channels is not None and report_channels != self.feature_channels:
            return self.build_incompatible_model_response(
                "Checkpoint was trained with feature channels "
                f"{report_channels}, but the current config expects {self.feature_channels}."
            )

        checkpoint_input_channels = self._extract_checkpoint_input_channels(state_dict)
        if checkpoint_input_channels is not None and checkpoint_input_channels != self.input_channels:
            return self.build_incompatible_model_response(
                "Checkpoint expects "
                f"{checkpoint_input_channels} input channel(s), but the current config provides "
                f"{self.input_channels} channel(s): {self.feature_channels}."
            )

        if mode == "unified_with_embeddings":
            checkpoint_stock_count = self._extract_checkpoint_stock_count(state_dict)
            if checkpoint_stock_count is not None and checkpoint_stock_count != len(self.stock_ids):
                return self.build_incompatible_model_response(
                    "Checkpoint was trained for "
                    f"{checkpoint_stock_count} stock embedding(s), but the current config has "
                    f"{len(self.stock_ids)} active stock(s)."
                )

        return None

    def _load_report_feature_channels(self, mode: str, stock_id: str) -> list[str] | None:
        report_path = self._resolve_report_path(mode, stock_id)
        if not report_path.exists():
            return None
        try:
            import json

            payload = json.loads(report_path.read_text(encoding="utf-8"))
        except Exception:
            return None
        feature_channels = payload.get("feature_channels") if isinstance(payload, dict) else None
        if isinstance(feature_channels, list) and all(
            isinstance(channel, str) for channel in feature_channels
        ):
            return list(feature_channels)
        return None

    def _resolve_report_path(self, mode: str, stock_id: str) -> Path:
        if mode == "per_stock":
            return self.report_dir / f"{stock_id}_training_report.json"
        if mode == "unified":
            return self.report_dir / "unified_training_report.json"
        if mode == "unified_with_embeddings":
            return self.report_dir / "unified_with_embeddings_training_report.json"
        raise ValueError(f"Unsupported model mode '{mode}'.")

    def _extract_checkpoint_input_channels(
        self,
        state_dict: dict[str, torch.Tensor],
    ) -> int | None:
        feature_weight = state_dict.get("features.0.weight")
        if isinstance(feature_weight, torch.Tensor) and feature_weight.ndim >= 2:
            return int(feature_weight.shape[1])
        return None

    def _extract_checkpoint_stock_count(
        self,
        state_dict: dict[str, torch.Tensor],
    ) -> int | None:
        embedding_weight = state_dict.get("stock_embedding.weight")
        if isinstance(embedding_weight, torch.Tensor) and embedding_weight.ndim >= 1:
            return int(embedding_weight.shape[0])
        return None

    def _require_stock(self, stock_id: str) -> None:
        if stock_id not in self.stock_index:
            raise ValueError(f"Unknown stock '{stock_id}' for model registry.")
