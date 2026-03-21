from __future__ import annotations

import numpy as np
from PyEMD import EMD
from scipy.signal import hilbert

from signal_processing.base_transform import BaseTransform


class HHTTransform(BaseTransform):
    @property
    def name(self) -> str:
        return "hht"

    def transform(
        self,
        signal: np.ndarray,
        sampling_interval: float = 1.0,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        numeric_signal = self.validate_signal(signal)
        if numeric_signal.size < 3:
            return self._build_short_signal_response(numeric_signal, sampling_interval)
        intrinsic_mode_functions = self._decompose_signal(numeric_signal)
        if intrinsic_mode_functions.size == 0:
            return self._build_short_signal_response(numeric_signal, sampling_interval)
        return self._build_hilbert_spectrum(
            intrinsic_mode_functions,
            numeric_signal.size,
            sampling_interval,
        )

    def _decompose_signal(self, signal: np.ndarray) -> np.ndarray:
        emd = EMD()
        imfs = np.asarray(emd.emd(signal, max_imf=self._resolve_max_imfs()), dtype=float)
        if imfs.ndim == 1:
            return imfs[np.newaxis, :]
        return imfs

    def _build_hilbert_spectrum(
        self,
        intrinsic_mode_functions: np.ndarray,
        signal_size: int,
        sampling_interval: float,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        max_frequency = 0.5 / sampling_interval
        frequency_axis = np.linspace(0.0, max_frequency, self._resolve_frequency_bins())
        time_axis = np.arange(signal_size - 1, dtype=float) * sampling_interval
        spectrogram = np.zeros((frequency_axis.size, time_axis.size), dtype=float)
        for imf in intrinsic_mode_functions:
            self._accumulate_imf_energy(spectrogram, imf, max_frequency, sampling_interval)
        return spectrogram, frequency_axis, time_axis

    def _accumulate_imf_energy(
        self,
        spectrogram: np.ndarray,
        intrinsic_mode_function: np.ndarray,
        max_frequency: float,
        sampling_interval: float,
    ) -> None:
        analytic_signal = hilbert(intrinsic_mode_function)
        amplitude = np.abs(analytic_signal)
        phase = np.unwrap(np.angle(analytic_signal))
        instantaneous_frequency = np.diff(phase) / (2.0 * np.pi * sampling_interval)
        energy = np.square(amplitude[:-1])
        for time_index, (frequency_value, energy_value) in enumerate(
            zip(instantaneous_frequency, energy, strict=False)
        ):
            if not np.isfinite(frequency_value) or not np.isfinite(energy_value):
                continue
            if frequency_value < 0:
                continue
            bucket_index = self._resolve_bucket_index(frequency_value, max_frequency, spectrogram)
            spectrogram[bucket_index, time_index] += float(energy_value)

    def _resolve_bucket_index(
        self,
        frequency_value: float,
        max_frequency: float,
        spectrogram: np.ndarray,
    ) -> int:
        if max_frequency <= 0:
            return 0
        normalized_frequency = min(frequency_value, max_frequency) / max_frequency
        bucket_index = int(round(normalized_frequency * (spectrogram.shape[0] - 1)))
        return min(max(bucket_index, 0), spectrogram.shape[0] - 1)

    def _build_short_signal_response(
        self,
        signal: np.ndarray,
        sampling_interval: float,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        frequency_axis = np.linspace(0.0, 0.5 / sampling_interval, self._resolve_frequency_bins())
        time_axis = np.arange(max(signal.size - 1, 1), dtype=float) * sampling_interval
        spectrogram = np.zeros((frequency_axis.size, time_axis.size), dtype=float)
        return spectrogram, frequency_axis, time_axis

    def _resolve_max_imfs(self) -> int:
        configured_max_imfs = int(self.get_parameter("max_imfs"))
        if configured_max_imfs < 1:
            raise ValueError("HHT max_imfs must be at least 1.")
        return configured_max_imfs

    def _resolve_frequency_bins(self) -> int:
        configured_frequency_bins = int(self.get_parameter("frequency_bins"))
        if configured_frequency_bins < 2:
            raise ValueError("HHT frequency_bins must be at least 2.")
        return configured_frequency_bins
