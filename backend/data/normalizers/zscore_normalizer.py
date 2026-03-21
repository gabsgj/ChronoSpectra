from __future__ import annotations

import numpy as np


class ZScoreNormalizer:
    def __init__(self) -> None:
        self.mean_value: float | None = None
        self.standard_deviation: float | None = None

    def fit(self, values: np.ndarray) -> "ZScoreNormalizer":
        numeric_values = self._coerce_values(values)
        self.mean_value = float(numeric_values.mean())
        self.standard_deviation = float(numeric_values.std())
        return self

    def transform(self, values: np.ndarray) -> np.ndarray:
        self._validate_state()
        numeric_values = self._coerce_values(values)
        mean_value = self.mean_value
        standard_deviation = self.standard_deviation
        assert mean_value is not None
        assert standard_deviation is not None
        if standard_deviation == 0:
            return np.zeros_like(numeric_values, dtype=float)
        return (numeric_values - mean_value) / standard_deviation

    def fit_transform(self, values: np.ndarray) -> np.ndarray:
        self.fit(values)
        return self.transform(values)

    def inverse_transform(self, values: np.ndarray) -> np.ndarray:
        self._validate_state()
        numeric_values = self._coerce_values(values)
        mean_value = self.mean_value
        standard_deviation = self.standard_deviation
        assert mean_value is not None
        assert standard_deviation is not None
        if standard_deviation == 0:
            return np.full_like(numeric_values, mean_value, dtype=float)
        return numeric_values * standard_deviation + mean_value

    def _validate_state(self) -> None:
        if self.mean_value is None or self.standard_deviation is None:
            raise ValueError("ZScoreNormalizer must be fitted before use.")

    def _coerce_values(self, values: np.ndarray) -> np.ndarray:
        numeric_values = np.asarray(values, dtype=float)
        if numeric_values.size == 0:
            raise ValueError("ZScoreNormalizer requires at least one value.")
        return numeric_values
