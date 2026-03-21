from __future__ import annotations

from typing import Any

import pandas as pd

from data.cache.data_cache import DataCache
from data.fetchers import get_fetcher
from data.normalizers.minmax_normalizer import MinMaxNormalizer
from signal_processing.signal_payloads import PriceSignal

CACHE_TTL_SECONDS = 900


class PriceSignalLoader:
    def __init__(self, app_config: dict[str, Any], cache: DataCache) -> None:
        self.config = app_config
        self.cache = cache

    def load(self, stock_config: dict[str, Any]) -> PriceSignal:
        years = stock_config["model"]["training_data_years"]
        cache_key = f"price-signal:{stock_config['id']}:{years}"
        return self.cache.get_or_set(
            cache_key,
            lambda: self._build_signal(stock_config, years),
            CACHE_TTL_SECONDS,
        )

    def _build_signal(self, stock_config: dict[str, Any], years: int) -> PriceSignal:
        fetcher = get_fetcher(stock_config, self.config)
        ohlcv_frame = fetcher.fetch_historical_ohlcv(years)
        close_frame = self._prepare_close_frame(ohlcv_frame, stock_config["id"])
        raw_values = close_frame["close"].to_numpy(dtype=float)
        normalizer = MinMaxNormalizer().fit(raw_values)
        normalized_values = normalizer.transform(raw_values)
        timestamps = [
            pd.Timestamp(timestamp).tz_localize(None).isoformat()
            for timestamp in close_frame.index
        ]
        return PriceSignal(
            stock_id=stock_config["id"],
            ticker=fetcher.get_resolved_ticker(),
            timestamps=timestamps,
            raw_values=raw_values,
            normalized_values=normalized_values,
            minimum_value=float(normalizer.minimum_value or 0.0),
            maximum_value=float(normalizer.maximum_value or 0.0),
        )

    def _prepare_close_frame(self, ohlcv_frame: pd.DataFrame, stock_id: str) -> pd.DataFrame:
        if ohlcv_frame.empty or "close" not in ohlcv_frame.columns:
            raise ValueError(f"No close-price series found for {stock_id}.")
        close_frame = ohlcv_frame[["close"]].dropna().copy()
        if close_frame.empty:
            raise ValueError(f"No non-null close-price series found for {stock_id}.")
        close_frame.index = pd.to_datetime(close_frame.index).tz_localize(None)
        return close_frame.sort_index()
