from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter, Request

from data.aligners.daily_aligner import DailyAligner
from data.aligners.quarterly_aligner import QuarterlyAligner
from data.base_fetcher import FundamentalsData
from data.fetchers import get_fetcher
from routes.api_models import (
    APIErrorResponse,
    MarketDataResponse,
    StockFetchCollectionResponse,
    StockFetchResponse,
)
from routes.utils import raise_structured_http_error, require_stock

router = APIRouter(tags=["data"])

CACHE_TTL_SECONDS = 900
DATA_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    404: {"model": APIErrorResponse},
    503: {"model": APIErrorResponse},
}


@router.get(
    "/fetch/{stock_id}",
    response_model=StockFetchResponse,
    responses=DATA_ERROR_RESPONSES,
)
def fetch_stock(stock_id: str, request: Request) -> StockFetchResponse:
    stock = require_stock(request, stock_id)
    try:
        stock_fetch_payload = build_fetch_payload(request, stock)
    except ValueError as exc:
        raise_data_unavailable_error(stock["id"], exc)
    return stock_fetch_payload


@router.get("/fetch-all", response_model=StockFetchCollectionResponse)
def fetch_all(request: Request) -> StockFetchCollectionResponse:
    try:
        stock_payloads = [
            build_fetch_payload(request, stock)
            for stock in request.app.state.config["active_stocks"]
        ]
    except ValueError as exc:
        raise_data_unavailable_error("all_active_stocks", exc)
    return {"data": stock_payloads, "count": len(stock_payloads)}


@router.get(
    "/market-data/{stock_id}",
    response_model=MarketDataResponse,
    responses=DATA_ERROR_RESPONSES,
)
def market_data(stock_id: str, request: Request) -> MarketDataResponse:
    stock = require_stock(request, stock_id)
    try:
        fetcher = get_fetcher(stock, request.app.state.config)
        years = stock["model"]["training_data_years"]
        ohlcv_frame = load_historical_ohlcv(request, stock["id"], years, fetcher)
        fundamentals = load_fundamentals(request, stock["id"], fetcher)
        market_index_frame = load_market_index(request, stock["id"], years, fetcher)
        currency_frame = load_currency_pair(request, stock["id"], years, fetcher)
    except ValueError as exc:
        raise_data_unavailable_error(stock["id"], exc)

    aligned_daily = DailyAligner().align({
        "price": ohlcv_frame[["close"]],
        "index": market_index_frame,
        "usd_inr": currency_frame,
    })
    aligned_quarterly = QuarterlyAligner().align({
        "revenue": fundamentals.quarterly_revenue,
        "profit": fundamentals.quarterly_profit,
    })

    return {
        "stock_id": stock["id"],
        "ticker": fetcher.get_resolved_ticker(),
        "tracks": {
            "price": serialize_aligned_track(aligned_daily, "price", "daily"),
            "revenue": serialize_aligned_track(aligned_quarterly, "revenue", "quarterly"),
            "profit": serialize_aligned_track(aligned_quarterly, "profit", "quarterly"),
            "index": serialize_aligned_track(aligned_daily, "index", "daily"),
            "usd_inr": serialize_aligned_track(aligned_daily, "usd_inr", "daily"),
        },
    }


def build_fetch_payload(request: Request, stock: dict[str, Any]) -> dict[str, Any]:
    fetcher = get_fetcher(stock, request.app.state.config)
    years = stock["model"]["training_data_years"]
    ohlcv_frame = load_historical_ohlcv(request, stock["id"], years, fetcher)
    fundamentals = load_fundamentals(request, stock["id"], fetcher)
    return {
        "stock_id": stock["id"],
        "ticker": fetcher.get_resolved_ticker(),
        "historical_ohlcv": serialize_ohlcv_frame(ohlcv_frame),
        "fundamentals": {
            "revenue": serialize_statement_frame(fundamentals.quarterly_revenue),
            "profit": serialize_statement_frame(fundamentals.quarterly_profit),
        },
    }


def load_historical_ohlcv(
    request: Request,
    stock_id: str,
    years: int,
    fetcher: Any,
) -> pd.DataFrame:
    cache_key = f"ohlcv:{stock_id}:{years}"
    return request.app.state.data_cache.get_or_set(
        cache_key,
        lambda: fetcher.fetch_historical_ohlcv(years),
        CACHE_TTL_SECONDS,
    )


def load_fundamentals(request: Request, stock_id: str, fetcher: Any) -> FundamentalsData:
    cache_key = f"fundamentals:{stock_id}"
    return request.app.state.data_cache.get_or_set(
        cache_key,
        fetcher.fetch_fundamentals,
        CACHE_TTL_SECONDS,
    )


def load_market_index(
    request: Request,
    stock_id: str,
    years: int,
    fetcher: Any,
) -> pd.DataFrame:
    cache_key = f"market-index:{stock_id}:{years}"
    return request.app.state.data_cache.get_or_set(
        cache_key,
        fetcher.fetch_market_index,
        CACHE_TTL_SECONDS,
    )


def load_currency_pair(
    request: Request,
    stock_id: str,
    years: int,
    fetcher: Any,
) -> pd.DataFrame:
    cache_key = f"currency:{stock_id}:{years}"
    return request.app.state.data_cache.get_or_set(
        cache_key,
        fetcher.fetch_currency_pair,
        CACHE_TTL_SECONDS,
    )


def serialize_ohlcv_frame(ohlcv_frame: pd.DataFrame) -> list[dict[str, Any]]:
    if ohlcv_frame.empty:
        return []
    serialized_points: list[dict[str, Any]] = []
    normalized_frame = ohlcv_frame.copy()
    normalized_frame.index = pd.to_datetime(normalized_frame.index).tz_localize(None)
    for timestamp, row in normalized_frame.iterrows():
        serialized_points.append(
            {
                "timestamp": timestamp.isoformat(),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            }
        )
    return serialized_points


def serialize_statement_frame(statement_frame: pd.DataFrame) -> list[dict[str, Any]]:
    if statement_frame.empty:
        return []
    serialized_points: list[dict[str, Any]] = []
    for _, row in statement_frame.iterrows():
        quarter_timestamp = pd.Timestamp(row["quarter"]).tz_localize(None)
        serialized_points.append({
            "timestamp": quarter_timestamp.isoformat(),
            "value_crores": float(row["value_crores"]),
        })
    return serialized_points


def serialize_aligned_track(
    aligned_frame: pd.DataFrame,
    column_name: str,
    frequency: str,
) -> dict[str, Any]:
    if aligned_frame.empty or column_name not in aligned_frame.columns:
        return {"frequency": frequency, "points": []}
    serialized_points = [
        {
            "timestamp": pd.Timestamp(timestamp).tz_localize(None).isoformat(),
            "value": float(value),
        }
        for timestamp, value in aligned_frame[column_name].dropna().items()
    ]
    return {"frequency": frequency, "points": serialized_points}


def raise_data_unavailable_error(stock_id: str, exc: ValueError) -> None:
    raise_structured_http_error(
        503,
        "data_unavailable",
        f"Market or fundamentals data is currently unavailable for '{stock_id}'.",
        hint=str(exc),
    )
