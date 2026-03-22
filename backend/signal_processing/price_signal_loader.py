from __future__ import annotations

from typing import Any

from data.cache.data_cache import DataCache
from data.feature_series_loader import FeatureSeriesLoader
from signal_processing.signal_payloads import FeatureSignal
from training.feature_channels import SUPPORTED_FEATURE_CHANNELS

CACHE_TTL_SECONDS = 900


class FeatureSignalLoader:
    def __init__(self, app_config: dict[str, Any], cache: DataCache) -> None:
        self.config = app_config
        self.cache = cache
        self.series_loader = FeatureSeriesLoader(app_config, cache)

    def load(
        self,
        stock_config: dict[str, Any],
        feature_channel: str = "price",
    ) -> FeatureSignal:
        resolved_channel = self._resolve_feature_channel(feature_channel)
        years = int(stock_config["model"]["training_data_years"])
        cache_key = f"feature-signal:{stock_config['id']}:{years}:{resolved_channel}"
        return self.cache.get_or_set(
            cache_key,
            lambda: self._build_signal(stock_config, resolved_channel),
            CACHE_TTL_SECONDS,
        )

    def _build_signal(
        self,
        stock_config: dict[str, Any],
        feature_channel: str,
    ) -> FeatureSignal:
        feature_series = self.series_loader.load(stock_config, [feature_channel])
        raw_values = feature_series.raw_by_channel[feature_channel]
        normalized_values = feature_series.normalized_by_channel[feature_channel]
        return FeatureSignal(
            stock_id=stock_config["id"],
            ticker=feature_series.ticker,
            feature_channel=feature_channel,
            timestamps=feature_series.timestamps,
            raw_values=raw_values,
            normalized_values=normalized_values,
            minimum_value=feature_series.minimum_by_channel[feature_channel],
            maximum_value=feature_series.maximum_by_channel[feature_channel],
        )

    def _resolve_feature_channel(self, feature_channel: str) -> str:
        normalized_channel = feature_channel.strip().lower()
        if normalized_channel not in SUPPORTED_FEATURE_CHANNELS:
            supported = ", ".join(SUPPORTED_FEATURE_CHANNELS)
            raise ValueError(
                f"Unsupported feature channel '{feature_channel}'. Expected one of: {supported}."
            )
        return normalized_channel


class PriceSignalLoader(FeatureSignalLoader):
    def load(self, stock_config: dict[str, Any]) -> FeatureSignal:
        return super().load(stock_config, feature_channel="price")
