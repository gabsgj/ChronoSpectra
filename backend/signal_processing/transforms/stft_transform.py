from __future__ import annotations

from typing import Sequence

import numpy as np
from scipy.signal import stft

from signal_processing.base_transform import BaseTransform
from signal_processing.signal_payloads import STFTFrameArtifact


class STFTTransform(BaseTransform):
    @property
    def name(self) -> str:
        return "stft"

    def transform(
        self,
        signal: np.ndarray,
        sampling_interval: float = 1.0,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        numeric_signal = self.validate_signal(signal)
        window_length = self._resolve_window_length(numeric_signal.size)
        hop_size = self._resolve_hop_size(window_length)
        n_fft = self._resolve_n_fft(window_length)
        frequency_axis, time_axis, spectrum = stft(
            numeric_signal,
            fs=1.0 / sampling_interval,
            window=self.get_parameter("window_function"),
            nperseg=window_length,
            noverlap=window_length - hop_size,
            nfft=n_fft,
            boundary=None,
            padded=False,
        )
        spectrogram = np.abs(spectrum) ** 2
        return spectrogram, frequency_axis, time_axis

    def build_frames(
        self,
        raw_signal: np.ndarray,
        normalized_signal: np.ndarray,
        timestamps: Sequence[str],
        sampling_interval: float = 1.0,
    ) -> tuple[list[STFTFrameArtifact], np.ndarray]:
        spectrogram, frequency_axis, _ = self.transform(normalized_signal, sampling_interval)
        window_length = self._resolve_window_length(normalized_signal.size)
        hop_size = self._resolve_hop_size(window_length)
        frames = [
            self._build_frame(
                frame_index,
                window_length,
                hop_size,
                raw_signal,
                normalized_signal,
                timestamps,
                spectrogram[:, frame_index],
            )
            for frame_index in range(spectrogram.shape[1])
        ]
        return frames, frequency_axis

    def _build_frame(
        self,
        frame_index: int,
        window_length: int,
        hop_size: int,
        raw_signal: np.ndarray,
        normalized_signal: np.ndarray,
        timestamps: Sequence[str],
        fft_column: np.ndarray,
    ) -> STFTFrameArtifact:
        segment_start = frame_index * hop_size
        segment_end = min(segment_start + window_length, normalized_signal.size)
        frame_timestamps = list(timestamps[segment_start:segment_end])
        center_index = segment_start + max((segment_end - segment_start - 1) // 2, 0)
        return STFTFrameArtifact(
            frame_index=frame_index,
            frame_timestamp=timestamps[min(center_index, len(timestamps) - 1)],
            segment_start=segment_start,
            segment_end=segment_end,
            segment_timestamps=frame_timestamps,
            segment=raw_signal[segment_start:segment_end].astype(float).tolist(),
            normalized_segment=normalized_signal[segment_start:segment_end].astype(float).tolist(),
            fft_column=fft_column.astype(float).tolist(),
        )

    def _resolve_window_length(self, signal_size: int) -> int:
        configured_length = int(self.get_parameter("window_length"))
        if configured_length < 2:
            raise ValueError("STFT window_length must be at least 2.")
        return min(configured_length, signal_size)

    def _resolve_hop_size(self, window_length: int) -> int:
        configured_hop = int(self.get_parameter("hop_size"))
        if configured_hop < 1:
            raise ValueError("STFT hop_size must be at least 1.")
        return min(configured_hop, max(window_length - 1, 1))

    def _resolve_n_fft(self, window_length: int) -> int:
        configured_n_fft = int(self.get_parameter("n_fft"))
        if configured_n_fft < 2:
            raise ValueError("STFT n_fft must be at least 2.")
        return max(configured_n_fft, window_length)
