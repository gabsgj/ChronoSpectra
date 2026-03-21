from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import torch
from torch import Tensor, nn

DEFAULT_IN_CHANNELS = 1
FEATURE_CHANNELS = (16, 32, 64)
FEATURE_MAP_SIZE = (4, 4)
HIDDEN_LAYER_SIZE = 128
MODEL_STORE_DIR = Path(__file__).resolve().parent / "model_store"
PER_STOCK_MODEL_DIR = MODEL_STORE_DIR / "per_stock"
UNIFIED_MODEL_DIR = MODEL_STORE_DIR / "unified"
SCALER_STORE_DIR = MODEL_STORE_DIR / "scalers"


class BaseModel(nn.Module, ABC):
    model_name = "base"
    features: nn.Module
    regressor: nn.Module

    def __init__(self, in_channels: int = DEFAULT_IN_CHANNELS) -> None:
        super().__init__()
        self.in_channels = in_channels

    @property
    def feature_vector_size(self) -> int:
        return FEATURE_CHANNELS[-1] * FEATURE_MAP_SIZE[0] * FEATURE_MAP_SIZE[1]

    def build_feature_extractor(self, in_channels: int | None = None) -> nn.Sequential:
        resolved_channels = in_channels or self.in_channels
        return nn.Sequential(
            nn.Conv2d(resolved_channels, FEATURE_CHANNELS[0], kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2),
            nn.Conv2d(FEATURE_CHANNELS[0], FEATURE_CHANNELS[1], kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2),
            nn.Conv2d(FEATURE_CHANNELS[1], FEATURE_CHANNELS[2], kernel_size=3, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d(FEATURE_MAP_SIZE),
        )

    def build_regressor_head(self, extra_features: int = 0) -> nn.Sequential:
        input_features = self.feature_vector_size + extra_features
        return nn.Sequential(
            nn.Linear(input_features, HIDDEN_LAYER_SIZE),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(HIDDEN_LAYER_SIZE, 1),
        )

    def validate_inputs(self, inputs: Tensor) -> Tensor:
        if inputs.ndim != 4:
            raise ValueError(
                "Model inputs must have shape (batch, channels, freq_bins, time_steps)."
            )
        if inputs.shape[1] != self.in_channels:
            raise ValueError(
                f"Model expected {self.in_channels} input channel(s) "
                f"but received {inputs.shape[1]}."
            )
        return inputs.float()

    def extract_features(self, inputs: Tensor) -> Tensor:
        normalized_inputs = self.validate_inputs(inputs)
        if not hasattr(self, "features"):
            raise ValueError("Model is missing the 'features' extractor.")
        feature_maps = self.features(normalized_inputs)
        return torch.flatten(feature_maps, start_dim=1)

    def predict(self, inputs: Tensor, *args: Any, **kwargs: Any) -> Tensor:
        self.eval()
        with torch.no_grad():
            return self.forward(inputs, *args, **kwargs)

    @abstractmethod
    def forward(self, inputs: Tensor, *args: Any, **kwargs: Any) -> Tensor:
        """Run a forward pass and return a scalar prediction per batch row."""


class SingleHeadCNN(BaseModel):
    def __init__(self, in_channels: int = DEFAULT_IN_CHANNELS) -> None:
        super().__init__(in_channels=in_channels)
        self.features = self.build_feature_extractor()
        self.regressor = self.build_regressor_head()

    def forward(self, inputs: Tensor) -> Tensor:
        features = self.extract_features(inputs)
        return self.regressor(features)
