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

MODEL_NOT_TRAINED_HINT = (
    "Trigger local training or run the Colab notebook to generate the checkpoint in "
    "model_store/."
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
        self.map_location = map_location
        self.stock_ids = [stock["id"] for stock in app_config["active_stocks"]]
        self.stock_index = {stock_id: index for index, stock_id in enumerate(self.stock_ids)}

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
        state_dict = self._load_state_dict(artifact_path)
        model.load_state_dict(state_dict)
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
            return PerStockCNN()
        if mode == "unified":
            return UnifiedCNN()
        if mode == "unified_with_embeddings":
            return UnifiedCNNWithEmbeddings(num_stocks=len(self.stock_ids))
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

    def _require_stock(self, stock_id: str) -> None:
        if stock_id not in self.stock_index:
            raise ValueError(f"Unknown stock '{stock_id}' for model registry.")
