from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import numpy as np


class BaseTransform(ABC):
    def __init__(
        self,
        app_config: dict[str, Any],
        overrides: dict[str, Any] | None = None,
    ) -> None:
        self.config = app_config
        self.overrides = overrides or {}

    @property
    @abstractmethod
    def name(self) -> str:
        """Return the transform identifier used in config and routing."""

    @abstractmethod
    def transform(
        self,
        signal: np.ndarray,
        sampling_interval: float = 1.0,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Return (spectrogram_2d, frequency_axis, time_axis)."""

    def get_parameter(self, key: str) -> Any:
        if key in self.overrides:
            return self.overrides[key]
        section = self.config["signal_processing"].get(self.name, {})
        if key not in section:
            raise ValueError(f"Missing '{key}' for transform '{self.name}'.")
        return section[key]

    def validate_signal(self, signal: np.ndarray) -> np.ndarray:
        numeric_signal = np.asarray(signal, dtype=float)
        if numeric_signal.ndim != 1:
            raise ValueError("Transforms require a 1D signal array.")
        if numeric_signal.size == 0:
            raise ValueError("Transforms require at least one signal value.")
        return numeric_signal
