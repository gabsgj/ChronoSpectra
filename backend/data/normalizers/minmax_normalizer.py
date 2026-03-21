from __future__ import annotations

import numpy as np


class MinMaxNormalizer:
    def __init__(self) -> None:
        self.minimum_value: float | None = None
        self.maximum_value: float | None = None

    def fit(self, values: np.ndarray) -> "MinMaxNormalizer":
        numeric_values = self._coerce_values(values)
        self.minimum_value = float(numeric_values.min())
        self.maximum_value = float(numeric_values.max())
        return self

    def transform(self, values: np.ndarray) -> np.ndarray:
        self._validate_state()
        numeric_values = self._coerce_values(values)
        minimum_value = self.minimum_value
        maximum_value = self.maximum_value
        assert minimum_value is not None
        assert maximum_value is not None
        scale = maximum_value - minimum_value
        if scale == 0:
            return np.zeros_like(numeric_values, dtype=float)
        return (numeric_values - minimum_value) / scale

    def fit_transform(self, values: np.ndarray) -> np.ndarray:
        self.fit(values)
        return self.transform(values)

    def inverse_transform(self, values: np.ndarray) -> np.ndarray:
        self._validate_state()
        numeric_values = self._coerce_values(values)
        minimum_value = self.minimum_value
        maximum_value = self.maximum_value
        assert minimum_value is not None
        assert maximum_value is not None
        scale = maximum_value - minimum_value
        if scale == 0:
            return np.full_like(numeric_values, minimum_value, dtype=float)
        return numeric_values * scale + minimum_value

    def _validate_state(self) -> None:
        if self.minimum_value is None or self.maximum_value is None:
            raise ValueError("MinMaxNormalizer must be fitted before use.")

    def _coerce_values(self, values: np.ndarray) -> np.ndarray:
        numeric_values = np.asarray(values, dtype=float)
        if numeric_values.size == 0:
            raise ValueError("MinMaxNormalizer requires at least one value.")
        return numeric_values
