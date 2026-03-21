from __future__ import annotations

import pandas as pd

from data.base_fetcher import BaseDataFetcher, FundamentalsData, PriceCallback, PricePoint
from data.fetchers.yfinance_fetcher import YFinanceFetcher

ANGEL_ONE_ENV_VARS = (
    "ANGEL_ONE_API_KEY, ANGEL_ONE_CLIENT_ID, ANGEL_ONE_PASSWORD, "
    "ANGEL_ONE_TOTP_SECRET"
)
ANGEL_ONE_AUTH_FLOW = (
    "Initialize SmartConnect(api_key), generate a TOTP with pyotp using "
    "ANGEL_ONE_TOTP_SECRET, call generateSession(client_id, password, totp), and "
    "reuse the returned auth/feed tokens for REST and SmartWebSocketV2 sessions."
)
ANGEL_ONE_WEBSOCKET_PATTERN = (
    "Load symbol tokens from OpenAPIScripMaster.json, open SmartWebSocketV2 with auth "
    "and feed tokens, then subscribe using the exchangeType/token list payload."
)


class AngelOneFetcher(BaseDataFetcher):
    """
    Angel One SmartAPI fetcher stub for future real-time activation.

    Required environment variables:
    - ANGEL_ONE_API_KEY
    - ANGEL_ONE_CLIENT_ID
    - ANGEL_ONE_PASSWORD
    - ANGEL_ONE_TOTP_SECRET

    Authentication flow:
    - Create SmartConnect(api_key)
    - Generate TOTP using pyotp and ANGEL_ONE_TOTP_SECRET
    - Call generateSession(client_id, password, totp)
    - Reuse authToken, refreshToken, and feedToken for SmartAPI calls

    Streaming pattern:
    - Resolve symbol tokens from OpenAPIScripMaster.json
    - Use SmartWebSocketV2 for market streaming
    - Subscribe with the exchangeType/token list for the target instrument
    """

    def fetch_historical_ohlcv(self, years: int) -> pd.DataFrame:
        _ = years
        raise NotImplementedError(self._build_error_message(
            endpoint=(
                "POST https://apiconnect.angelbroking.com/rest/secure/angelbroking/"
                "historical/v1/getCandleData"
            ),
            action="historical candles",
        ))

    def fetch_fundamentals(self) -> FundamentalsData:
        return YFinanceFetcher(self.stock, self.config).fetch_fundamentals()

    def fetch_market_index(self) -> pd.DataFrame:
        raise NotImplementedError(self._build_error_message(
            endpoint=(
                "POST https://apiconnect.angelbroking.com/rest/secure/angelbroking/"
                "historical/v1/getCandleData"
            ),
            action="market-index history",
        ))

    def fetch_currency_pair(self) -> pd.DataFrame:
        raise NotImplementedError(self._build_error_message(
            endpoint=(
                "POST https://apiconnect.angelbroking.com/rest/secure/angelbroking/"
                "historical/v1/getCandleData"
            ),
            action="currency-pair history",
        ))

    def get_latest_price(self) -> PricePoint:
        raise NotImplementedError(self._build_error_message(
            endpoint=(
                "POST https://apiconnect.angelbroking.com/rest/secure/angelbroking/"
                "market/v1/quote/"
            ),
            action="latest quote",
        ))

    def is_market_open(self) -> bool:
        return YFinanceFetcher(self.stock, self.config).is_market_open()

    def start_live_stream(self, callback: PriceCallback) -> None:
        _ = callback
        raise NotImplementedError(self._build_error_message(
            endpoint="SmartWebSocketV2.subscribe(correlation_id, mode, token_list)",
            action="WebSocket live stream",
        ))

    def stop_live_stream(self) -> None:
        raise NotImplementedError(self._build_error_message(
            endpoint="SmartWebSocketV2.close_connection()",
            action="WebSocket shutdown",
        ))

    def _build_error_message(self, endpoint: str, action: str) -> str:
        return (
            f"Angel One {action} is not implemented. Endpoint: {endpoint}. "
            f"Required env vars: {ANGEL_ONE_ENV_VARS}. Auth flow: {ANGEL_ONE_AUTH_FLOW}. "
            f"WebSocket pattern: {ANGEL_ONE_WEBSOCKET_PATTERN}"
        )
