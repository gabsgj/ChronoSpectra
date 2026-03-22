from __future__ import annotations

from typing import Any

import numpy as np

from data.cache.data_cache import DataCache
from signal_processing.price_signal_loader import FeatureSignalLoader
from signal_processing.signal_payloads import FFTSpectrumArtifact


class FFTVisualizer:
    def __init__(self, app_config: dict[str, Any], cache: DataCache) -> None:
        self.signal_loader = FeatureSignalLoader(app_config, cache)

    def generate(
        self,
        stock_config: dict[str, Any],
        feature_channel: str = "price",
    ) -> FFTSpectrumArtifact:
        feature_signal = self.signal_loader.load(stock_config, feature_channel=feature_channel)
        centered_signal = feature_signal.normalized_values - feature_signal.normalized_values.mean()
        frequency_axis = np.fft.rfftfreq(centered_signal.size, d=1.0)
        amplitude = np.abs(np.fft.rfft(centered_signal)) / max(centered_signal.size, 1)
        trimmed_frequency_axis = frequency_axis[1:]
        trimmed_amplitude = amplitude[1:]
        return FFTSpectrumArtifact(
            stock_id=feature_signal.stock_id,
            ticker=feature_signal.ticker,
            feature_channel=feature_signal.feature_channel,
            frequency_axis=trimmed_frequency_axis.astype(float).tolist(),
            amplitude=trimmed_amplitude.astype(float).tolist(),
            signal_timestamps=feature_signal.timestamps,
            normalized_signal=feature_signal.normalized_values.astype(float).tolist(),
            dc_component_removed=True,
        )
