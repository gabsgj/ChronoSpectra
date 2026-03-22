from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np
import pandas as pd

from data.aligners.daily_aligner import DailyAligner
from data.aligners.quarterly_aligner import QuarterlyAligner
from data.cache.data_cache import DataCache
from data.fetchers import get_fetcher
from data.normalizers.minmax_normalizer import MinMaxNormalizer
from training.feature_channels import (
    DEFAULT_FEATURE_CHANNELS,
    SUPPORTED_FEATURE_CHANNELS,
    resolve_feature_channels,
)

CACHE_TTL_SECONDS = 900


@dataclass(slots=True)
class FeatureSeries:
    stock_id: str
    ticker: str
    timestamps: list[str]
    raw_by_channel: dict[str, np.ndarray]
    normalized_by_channel: dict[str, np.ndarray]
    minimum_by_channel: dict[str, float]
    maximum_by_channel: dict[str, float]

    @property
    def raw_price_values(self) -> np.ndarray:
        return self.raw_by_channel["price"]

    @property
    def normalized_price_values(self) -> np.ndarray:
        return self.normalized_by_channel["price"]

    @property
    def price_minimum_value(self) -> float:
        return self.minimum_by_channel["price"]

    @property
    def price_maximum_value(self) -> float:
        return self.maximum_by_channel["price"]


class FeatureSeriesLoader:
    def __init__(self, app_config: dict[str, object], cache: DataCache) -> None:
        self.config = app_config
        self.cache = cache

    def load(
        self,
        stock_config: dict[str, object],
        channels: Sequence[str] | None = None,
    ) -> FeatureSeries:
        requested_channels = self._resolve_requested_channels(channels)
        years = int(stock_config["model"]["training_data_years"])
        cache_key = (
            f"feature-series:{stock_config['id']}:{years}:"
            f"{','.join(requested_channels)}"
        )
        return self.cache.get_or_set(
            cache_key,
            lambda: self._build_feature_series(stock_config, requested_channels),
            CACHE_TTL_SECONDS,
        )

    def _resolve_requested_channels(self, channels: Sequence[str] | None) -> list[str]:
        if channels is None:
            resolved = resolve_feature_channels(self.config)
        else:
            resolved = []
            for channel in channels:
                normalized_channel = str(channel).strip().lower()
                if normalized_channel not in SUPPORTED_FEATURE_CHANNELS:
                    continue
                if normalized_channel in resolved:
                    continue
                resolved.append(normalized_channel)

        if not resolved:
            resolved = list(DEFAULT_FEATURE_CHANNELS)
        if "price" not in resolved:
            resolved = ["price", *resolved]
        return resolved

    def _build_feature_series(
        self,
        stock_config: dict[str, object],
        requested_channels: list[str],
    ) -> FeatureSeries:
        years = int(stock_config["model"]["training_data_years"])
        fetcher = get_fetcher(stock_config, self.config)
        stock_id = str(stock_config["id"])

        ohlcv_frame = self.cache.get_or_set(
            f"ohlcv:{stock_id}:{years}",
            lambda: fetcher.fetch_historical_ohlcv(years),
            CACHE_TTL_SECONDS,
        )

        selected_channels = set(requested_channels)
        include_index = "index" in selected_channels
        include_usd_inr = "usd_inr" in selected_channels
        include_revenue = "revenue" in selected_channels
        include_profit = "profit" in selected_channels

        market_index_frame = pd.DataFrame()
        if include_index:
            market_index_frame = self.cache.get_or_set(
                f"market-index:{stock_id}:{years}",
                fetcher.fetch_market_index,
                CACHE_TTL_SECONDS,
            )

        currency_frame = pd.DataFrame()
        if include_usd_inr:
            currency_frame = self.cache.get_or_set(
                f"currency:{stock_id}:{years}",
                fetcher.fetch_currency_pair,
                CACHE_TTL_SECONDS,
            )

        daily_tracks: dict[str, pd.DataFrame] = {
            "price": ohlcv_frame[["close"]],
        }
        if include_index:
            daily_tracks["index"] = market_index_frame
        if include_usd_inr:
            daily_tracks["usd_inr"] = currency_frame

        aligned_daily = DailyAligner().align(daily_tracks)
        if aligned_daily.empty or "price" not in aligned_daily.columns:
            raise ValueError(f"No aligned daily price series found for {stock_id}.")

        working_frame = aligned_daily[["price"]].copy()
        for optional_daily_channel in ("index", "usd_inr"):
            if optional_daily_channel in aligned_daily.columns:
                working_frame[optional_daily_channel] = aligned_daily[optional_daily_channel]

        if include_revenue or include_profit:
            fundamentals = self.cache.get_or_set(
                f"fundamentals:{stock_id}",
                fetcher.fetch_fundamentals,
                CACHE_TTL_SECONDS,
            )
            quarterly_tracks: dict[str, pd.DataFrame] = {}
            if include_revenue:
                quarterly_tracks["revenue"] = fundamentals.quarterly_revenue
            if include_profit:
                quarterly_tracks["profit"] = fundamentals.quarterly_profit
            aligned_quarterly = QuarterlyAligner().align(quarterly_tracks)
            if aligned_quarterly.empty:
                raise ValueError(
                    f"Quarterly fundamentals are unavailable for requested channels on {stock_id}."
                )
            quarterly_on_daily = aligned_quarterly.reindex(working_frame.index).ffill().bfill()
            for column_name in quarterly_on_daily.columns:
                working_frame[column_name] = quarterly_on_daily[column_name]

        required_columns = list(dict.fromkeys(["price", *requested_channels]))
        missing_columns = sorted(
            column_name
            for column_name in required_columns
            if column_name not in working_frame.columns
        )
        if missing_columns:
            raise ValueError(
                f"Missing required feature channels for {stock_id}: {', '.join(missing_columns)}."
            )

        filtered_frame = working_frame[required_columns].dropna(how="any").sort_index()
        if filtered_frame.empty:
            raise ValueError(f"No aligned feature rows found for {stock_id}.")

        raw_by_channel: dict[str, np.ndarray] = {}
        normalized_by_channel: dict[str, np.ndarray] = {}
        minimum_by_channel: dict[str, float] = {}
        maximum_by_channel: dict[str, float] = {}
        for channel_name in required_columns:
            values = filtered_frame[channel_name].to_numpy(dtype=float)
            normalizer = MinMaxNormalizer().fit(values)
            raw_by_channel[channel_name] = values
            normalized_by_channel[channel_name] = normalizer.transform(values)
            minimum_by_channel[channel_name] = float(normalizer.minimum_value or 0.0)
            maximum_by_channel[channel_name] = float(normalizer.maximum_value or 0.0)

        timestamps = [
            pd.Timestamp(timestamp).tz_localize(None).isoformat()
            for timestamp in filtered_frame.index
        ]

        return FeatureSeries(
            stock_id=stock_id,
            ticker=fetcher.get_resolved_ticker(),
            timestamps=timestamps,
            raw_by_channel=raw_by_channel,
            normalized_by_channel=normalized_by_channel,
            minimum_by_channel=minimum_by_channel,
            maximum_by_channel=maximum_by_channel,
        )
