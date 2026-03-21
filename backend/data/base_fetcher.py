from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable
from zoneinfo import ZoneInfo

import pandas as pd

PriceCallback = Callable[["PricePoint"], None]


@dataclass(slots=True)
class PricePoint:
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass(slots=True)
class FundamentalsData:
    ticker: str
    quarterly_revenue: pd.DataFrame
    quarterly_profit: pd.DataFrame


class BaseDataFetcher(ABC):
    def __init__(self, stock_config: dict[str, Any], app_config: dict[str, Any]) -> None:
        self.stock = stock_config
        self.config = app_config

    @abstractmethod
    def fetch_historical_ohlcv(self, years: int) -> pd.DataFrame:
        """Return a daily OHLCV dataframe with a DatetimeIndex."""

    @abstractmethod
    def fetch_fundamentals(self) -> FundamentalsData:
        """Return quarterly revenue and profit data."""

    @abstractmethod
    def fetch_market_index(self) -> pd.DataFrame:
        """Return the configured daily market-index series."""

    @abstractmethod
    def fetch_currency_pair(self) -> pd.DataFrame:
        """Return the configured daily currency-pair series."""

    @abstractmethod
    def get_latest_price(self) -> PricePoint:
        """Return the most recent available price point."""

    @abstractmethod
    def is_market_open(self) -> bool:
        """Return whether the stock's exchange is currently open."""

    @abstractmethod
    def start_live_stream(self, callback: PriceCallback) -> None:
        """Start a live stream and invoke the callback for each new price."""

    @abstractmethod
    def stop_live_stream(self) -> None:
        """Stop the active live stream, if any."""

    def get_exchange_config(self) -> dict[str, Any]:
        return self.config["exchanges"][self.stock["exchange"]]

    def get_market_timezone(self) -> ZoneInfo:
        timezone_name = self.get_exchange_config()["market_hours"]["timezone"]
        return ZoneInfo(timezone_name)

    def get_resolved_ticker(self) -> str:
        ticker = self.stock["ticker"]
        suffix = self.get_exchange_config().get("suffix", "")
        if suffix and not ticker.endswith(suffix):
            return f"{ticker}{suffix}"
        return ticker
