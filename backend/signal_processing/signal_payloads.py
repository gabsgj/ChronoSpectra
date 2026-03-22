from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(slots=True)
class FeatureSignal:
    stock_id: str
    ticker: str
    feature_channel: str
    timestamps: list[str]
    raw_values: np.ndarray
    normalized_values: np.ndarray
    minimum_value: float
    maximum_value: float


@dataclass(slots=True)
class SpectrogramArtifact:
    stock_id: str
    ticker: str
    feature_channel: str
    transform: str
    signal_timestamps: list[str]
    raw_signal: list[float]
    normalized_signal: list[float]
    frequency_axis: list[float]
    time_axis: list[float]
    time_timestamps: list[str]
    spectrogram: list[list[float]]
    png_bytes: bytes


@dataclass(slots=True)
class STFTFrameArtifact:
    frame_index: int
    frame_timestamp: str
    segment_start: int
    segment_end: int
    segment_timestamps: list[str]
    segment: list[float]
    normalized_segment: list[float]
    fft_column: list[float]


@dataclass(slots=True)
class STFTFramesArtifact:
    stock_id: str
    ticker: str
    feature_channel: str
    transform: str
    frequency_axis: list[float]
    frames: list[STFTFrameArtifact]


@dataclass(slots=True)
class FFTSpectrumArtifact:
    stock_id: str
    ticker: str
    feature_channel: str
    frequency_axis: list[float]
    amplitude: list[float]
    signal_timestamps: list[str]
    normalized_signal: list[float]
    dc_component_removed: bool
