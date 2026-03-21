from __future__ import annotations

import numpy as np
import pywt

from signal_processing.base_transform import BaseTransform


class CWTTransform(BaseTransform):
    @property
    def name(self) -> str:
        return "cwt"

    def transform(
        self,
        signal: np.ndarray,
        sampling_interval: float = 1.0,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        numeric_signal = self.validate_signal(signal)
        scales = np.arange(1, self._resolve_scale_count() + 1, dtype=float)
        coefficients, frequency_axis = pywt.cwt(
            numeric_signal,
            scales,
            self.get_parameter("wavelet"),
            sampling_period=sampling_interval,
        )
        spectrogram = np.abs(coefficients) ** 2
        sorted_indices = np.argsort(frequency_axis)
        time_axis = np.arange(numeric_signal.size, dtype=float) * sampling_interval
        return spectrogram[sorted_indices], frequency_axis[sorted_indices], time_axis

    def _resolve_scale_count(self) -> int:
        configured_scales = int(self.get_parameter("scales"))
        if configured_scales < 1:
            raise ValueError("CWT scales must be at least 1.")
        return configured_scales
