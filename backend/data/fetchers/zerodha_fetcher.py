from __future__ import annotations

import pandas as pd

from data.base_fetcher import BaseDataFetcher, FundamentalsData, PriceCallback, PricePoint
from data.fetchers.yfinance_fetcher import YFinanceFetcher

ZERODHA_ENV_VARS = "ZERODHA_API_KEY, ZERODHA_ACCESS_TOKEN"
ZERODHA_AUTH_FLOW = (
    "Login via https://kite.trade/connect/login?api_key={api_key}&v=3, exchange the "
    "request_token at POST https://api.kite.trade/session/token, and persist the daily "
    "access_token for subsequent API and WebSocket calls."
)
ZERODHA_WEBSOCKET_PATTERN = (
    "Use KiteTicker, subscribe with instrument_token values, and handle ticks via "
    "ws.subscribe([instrument_token]); ws.set_mode(ws.MODE_FULL, [instrument_token])."
)


class ZerodhaFetcher(BaseDataFetcher):
    """
    Zerodha Kite Connect fetcher stub for future real-time activation.

    Required environment variables:
    - ZERODHA_API_KEY
    - ZERODHA_ACCESS_TOKEN

    Authentication flow:
    - GET https://kite.trade/connect/login?api_key={api_key}&v=3
    - Receive request_token on redirect
    - POST https://api.kite.trade/session/token to exchange request_token
    - Use the returned access_token for REST and KiteTicker sessions

    Streaming pattern:
    - Fetch instrument tokens from https://api.kite.trade/instruments/NSE
    - Subscribe through KiteTicker with instrument_token values
    - Process ticks from the WebSocket callback for live prices
    """

    def fetch_historical_ohlcv(self, years: int) -> pd.DataFrame:
        _ = years
        raise NotImplementedError(self._build_error_message(
            endpoint="GET https://api.kite.trade/instruments/historical/{instrument_token}/day",
            action="historical candles",
        ))

    def fetch_fundamentals(self) -> FundamentalsData:
        return YFinanceFetcher(self.stock, self.config).fetch_fundamentals()

    def fetch_market_index(self) -> pd.DataFrame:
        raise NotImplementedError(self._build_error_message(
            endpoint="GET https://api.kite.trade/instruments/historical/{instrument_token}/day",
            action="market-index history",
        ))

    def fetch_currency_pair(self) -> pd.DataFrame:
        raise NotImplementedError(self._build_error_message(
            endpoint="GET https://api.kite.trade/instruments/historical/{instrument_token}/day",
            action="currency-pair history",
        ))

    def get_latest_price(self) -> PricePoint:
        raise NotImplementedError(self._build_error_message(
            endpoint="GET https://api.kite.trade/quote",
            action="latest quote",
        ))

    def is_market_open(self) -> bool:
        return YFinanceFetcher(self.stock, self.config).is_market_open()

    def start_live_stream(self, callback: PriceCallback) -> None:
        _ = callback
        raise NotImplementedError(self._build_error_message(
            endpoint="wss://ws.kite.trade",
            action="WebSocket live stream",
        ))

    def stop_live_stream(self) -> None:
        raise NotImplementedError(self._build_error_message(
            endpoint="KiteTicker.close()",
            action="WebSocket shutdown",
        ))

    def _build_error_message(self, endpoint: str, action: str) -> str:
        return (
            f"Zerodha {action} is not implemented. Endpoint: {endpoint}. "
            f"Required env vars: {ZERODHA_ENV_VARS}. Auth flow: {ZERODHA_AUTH_FLOW}. "
            f"WebSocket pattern: {ZERODHA_WEBSOCKET_PATTERN}"
        )
