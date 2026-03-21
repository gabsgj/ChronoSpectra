from __future__ import annotations

from typing import Any

from data.base_fetcher import BaseDataFetcher
from data.fetchers.angel_one_fetcher import AngelOneFetcher
from data.fetchers.yfinance_fetcher import YFinanceFetcher
from data.fetchers.zerodha_fetcher import ZerodhaFetcher


def get_fetcher(stock_config: dict[str, Any], app_config: dict[str, Any]) -> BaseDataFetcher:
    exchange_name = stock_config["exchange"]
    provider_name = app_config["exchanges"][exchange_name].get("live_data_provider", "yfinance")
    if provider_name == "zerodha":
        return ZerodhaFetcher(stock_config, app_config)
    if provider_name == "angel_one":
        return AngelOneFetcher(stock_config, app_config)
    return YFinanceFetcher(stock_config, app_config)
