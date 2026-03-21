from __future__ import annotations

import logging
import threading
from datetime import datetime, time

import pandas as pd
import yfinance as yf

from data.base_fetcher import BaseDataFetcher, FundamentalsData, PriceCallback, PricePoint

LOGGER = logging.getLogger(__name__)
STATEMENT_SCALE_TO_CRORES = 10_000_000
REVENUE_LABELS = ("Total Revenue", "Operating Revenue", "Revenue")
PROFIT_LABELS = ("Gross Profit", "Net Income", "Net Income Common Stockholders")


class YFinanceFetcher(BaseDataFetcher):
    """
    Primary data provider for FinSpectra.

    Historical and reference data are fetched from yfinance. Live-price support
    uses polling because yfinance does not provide a WebSocket API.

    # yfinance is 15-min delayed. Change live_data_provider in stocks.json to
    # "zerodha" or "angel_one" for real-time.
    """

    def __init__(self, stock_config: dict[str, object], app_config: dict[str, object]) -> None:
        super().__init__(stock_config, app_config)
        self._stop_event = threading.Event()
        self._stream_thread: threading.Thread | None = None

    def fetch_historical_ohlcv(self, years: int) -> pd.DataFrame:
        history_frame = self._get_history(
            ticker_symbol=self.get_resolved_ticker(),
            period=f"{max(years, 1)}y",
            interval="1d",
        )
        if history_frame.empty:
            raise ValueError(f"No historical OHLCV data found for {self.stock['id']}.")
        selected_columns = ["Open", "High", "Low", "Close", "Volume"]
        renamed_columns = {column: column.lower() for column in selected_columns}
        return history_frame[selected_columns].rename(columns=renamed_columns)

    def fetch_fundamentals(self) -> FundamentalsData:
        ticker = yf.Ticker(self.get_resolved_ticker())
        income_statement = ticker.quarterly_income_stmt
        revenue_frame = self._extract_statement_frame(income_statement, REVENUE_LABELS)
        profit_frame = self._extract_statement_frame(income_statement, PROFIT_LABELS)
        return FundamentalsData(
            ticker=self.get_resolved_ticker(),
            quarterly_revenue=revenue_frame,
            quarterly_profit=profit_frame,
        )

    def fetch_market_index(self) -> pd.DataFrame:
        exchange_config = self.get_exchange_config()
        years = self.stock["model"]["training_data_years"]
        return self._get_single_value_history(
            ticker_symbol=exchange_config["market_index_ticker"],
            period=f"{max(years, 1)}y",
        )

    def fetch_currency_pair(self) -> pd.DataFrame:
        exchange_config = self.get_exchange_config()
        years = self.stock["model"]["training_data_years"]
        return self._get_single_value_history(
            ticker_symbol=exchange_config["currency_pair"],
            period=f"{max(years, 1)}y",
        )

    def get_latest_price(self) -> PricePoint:
        intraday_frame = self._get_history(
            ticker_symbol=self.get_resolved_ticker(),
            period="1d",
            interval="1m",
        )
        if intraday_frame.empty:
            intraday_frame = self._get_history(
                ticker_symbol=self.get_resolved_ticker(),
                period="5d",
                interval="1d",
            )
        if intraday_frame.empty:
            raise ValueError(f"No latest price data found for {self.stock['id']}.")
        latest_row = intraday_frame.iloc[-1]
        timestamp = pd.Timestamp(latest_row.name).tz_localize(None).isoformat()
        return PricePoint(
            timestamp=timestamp,
            open=float(latest_row["Open"]),
            high=float(latest_row["High"]),
            low=float(latest_row["Low"]),
            close=float(latest_row["Close"]),
            volume=int(latest_row["Volume"] or 0),
        )

    def is_market_open(self) -> bool:
        market_hours = self.get_exchange_config()["market_hours"]
        current_time = datetime.now(self.get_market_timezone())
        if current_time.weekday() >= 5:
            return False
        open_time = time.fromisoformat(market_hours["open"])
        close_time = time.fromisoformat(market_hours["close"])
        return open_time <= current_time.time() <= close_time

    def start_live_stream(self, callback: PriceCallback) -> None:
        if self._stream_thread is not None and self._stream_thread.is_alive():
            return
        self._stop_event.clear()

        def poll_latest_price() -> None:
            while not self._stop_event.is_set():
                try:
                    callback(self.get_latest_price())
                except Exception as exc:
                    LOGGER.warning("YFinance polling failed: %s", exc)
                self._stop_event.wait(15)

        self._stream_thread = threading.Thread(
            target=poll_latest_price,
            name=f"{self.stock['id']}-yfinance-stream",
            daemon=True,
        )
        self._stream_thread.start()

    def stop_live_stream(self) -> None:
        self._stop_event.set()
        if self._stream_thread is None:
            return
        self._stream_thread.join(timeout=1)
        self._stream_thread = None

    def _get_single_value_history(self, ticker_symbol: str, period: str) -> pd.DataFrame:
        history_frame = self._get_history(
            ticker_symbol=ticker_symbol,
            period=period,
            interval="1d",
        )
        if history_frame.empty:
            raise ValueError(f"No historical data found for {ticker_symbol}.")
        return history_frame[["Close"]].rename(columns={"Close": "close"})

    def _get_history(self, ticker_symbol: str, period: str, interval: str) -> pd.DataFrame:
        ticker = yf.Ticker(ticker_symbol)
        history_frame = self._attempt_history_load(
            ticker,
            period=period,
            interval=interval,
        )
        if history_frame is not None and not history_frame.empty:
            return history_frame
        fallback_period = "1mo" if interval == "1d" else "5d"
        fallback_interval = "1d"
        fallback_history = self._attempt_history_load(
            ticker,
            period=fallback_period,
            interval=fallback_interval,
        )
        if fallback_history is not None and not fallback_history.empty:
            return fallback_history
        return pd.DataFrame()

    def _attempt_history_load(
        self,
        ticker: yf.Ticker,
        *,
        period: str,
        interval: str,
    ) -> pd.DataFrame | None:
        try:
            history_frame = ticker.history(period=period, interval=interval, auto_adjust=False)
        except Exception as exc:
            LOGGER.warning(
                "yfinance history fetch failed for %s period=%s interval=%s: %s",
                self.stock["id"],
                period,
                interval,
                exc,
            )
            return None
        if isinstance(history_frame, pd.DataFrame):
            return history_frame
        return None

    def _extract_statement_frame(
        self,
        income_statement: pd.DataFrame,
        candidate_labels: tuple[str, ...],
    ) -> pd.DataFrame:
        if income_statement.empty:
            return self._empty_fundamental_frame()
        matched_label = next(
            (label for label in candidate_labels if label in income_statement.index),
            None,
        )
        if matched_label is None:
            return self._empty_fundamental_frame()
        value_series = income_statement.loc[matched_label].dropna()
        if value_series.empty:
            return self._empty_fundamental_frame()
        statement_frame = value_series.rename("value_crores").reset_index()
        statement_frame.columns = ["quarter", "value_crores"]
        statement_frame["quarter"] = pd.to_datetime(
            statement_frame["quarter"]
        ).dt.tz_localize(None)
        statement_frame["value_crores"] = statement_frame["value_crores"].astype(float)
        statement_frame["value_crores"] = (
            statement_frame["value_crores"] / STATEMENT_SCALE_TO_CRORES
        )
        return statement_frame.sort_values("quarter").reset_index(drop=True)

    def _empty_fundamental_frame(self) -> pd.DataFrame:
        return pd.DataFrame(columns=["quarter", "value_crores"])
