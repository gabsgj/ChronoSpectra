from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, time, timedelta
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from data.fetchers import get_fetcher
from routes.api_models import APIErrorResponse, MarketStatusResponse
from routes.model import build_prediction_response
from routes.utils import raise_structured_http_error, require_exchange, require_stock

router = APIRouter(tags=["live"])
LIVE_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    404: {"model": APIErrorResponse},
    503: {"model": APIErrorResponse},
}
LOGGER = logging.getLogger(__name__)
STREAM_INTERVAL_SECONDS = 15
MAX_CONSECUTIVE_STREAM_FAILURES = 4


@router.get("/stream/{stock_id}", responses=LIVE_ERROR_RESPONSES)
async def live_stream(
    stock_id: str,
    request: Request,
    mode: str | None = None,
) -> StreamingResponse:
    stock = require_stock(request, stock_id)
    config = request.app.state.config
    fetcher = get_fetcher(stock, config)
    try:
        initial_price = fetcher.get_latest_price()
    except ValueError as exc:
        raise_structured_http_error(
            503,
            "live_data_unavailable",
            f"Live market data is currently unavailable for '{stock['id']}'.",
            hint=str(exc),
        )
    initial_prediction = build_prediction_response(
        stock_id,
        request,
        mode=mode,
        live_price=initial_price,
    )

    async def event_generator():
        latest_price = initial_price
        latest_prediction = initial_prediction
        consecutive_failures = 0
        yield ": connected\n\n"
        while True:
            if await request.is_disconnected():
                break
            status_payload = build_market_status_payload(
                stock["exchange"],
                config["exchanges"][stock["exchange"]],
            )
            if status_payload["market_open"]:
                try:
                    latest_price = fetcher.get_latest_price()
                except ValueError as exc:
                    consecutive_failures += 1
                    LOGGER.warning(
                        "Live price fetch failed for %s (%s/%s): %s",
                        stock["id"],
                        consecutive_failures,
                        MAX_CONSECUTIVE_STREAM_FAILURES,
                        exc,
                    )
                    if consecutive_failures >= MAX_CONSECUTIVE_STREAM_FAILURES:
                        break
                    yield ": live-price-unavailable\n\n"
                    await asyncio.sleep(STREAM_INTERVAL_SECONDS)
                    continue
                try:
                    latest_prediction = build_prediction_response(
                        stock_id,
                        request,
                        mode=mode,
                        live_price=latest_price,
                    )
                    consecutive_failures = 0
                except Exception as exc:
                    consecutive_failures += 1
                    LOGGER.warning(
                        "Live prediction refresh failed for %s (%s/%s): %s",
                        stock["id"],
                        consecutive_failures,
                        MAX_CONSECUTIVE_STREAM_FAILURES,
                        exc,
                    )
                    if consecutive_failures >= MAX_CONSECUTIVE_STREAM_FAILURES:
                        break
            else:
                latest_prediction = initial_prediction
                consecutive_failures = 0
            payload = {
                "stock_id": stock["id"],
                "ticker": stock["ticker"],
                "exchange": stock["exchange"],
                "timestamp": latest_price.timestamp,
                "actual": latest_price.close,
                "predicted": latest_prediction.predicted_price,
                "prediction_mode": latest_prediction.resolved_mode,
                "prediction_as_of": latest_prediction.as_of_timestamp,
                "prediction_horizon_days": latest_prediction.prediction_horizon_days,
                "prediction_target_at": latest_prediction.prediction_target_at,
                "market_open": status_payload["market_open"],
                "next_open_at": status_payload["next_open_at"],
                "seconds_until_open": status_payload["seconds_until_open"],
                "live_data_provider": (
                    config["exchanges"][stock["exchange"]]["live_data_provider"]
                ),
            }
            yield f"data: {json.dumps(payload)}\n\n"
            if not status_payload["market_open"]:
                break
            await asyncio.sleep(STREAM_INTERVAL_SECONDS)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/market-status/{exchange}",
    response_model=MarketStatusResponse,
    responses={404: {"model": APIErrorResponse}},
)
def market_status(exchange: str, request: Request) -> MarketStatusResponse:
    exchange_name = exchange.upper()
    exchange_config = require_exchange(request, exchange_name)
    payload = build_market_status_payload(exchange_name, exchange_config)
    return MarketStatusResponse(**payload)


def build_market_status_payload(
    exchange_name: str,
    exchange_config: dict[str, Any],
) -> dict[str, Any]:
    market_hours = exchange_config["market_hours"]
    timezone_name = str(market_hours["timezone"])
    now = datetime.now(tz=_resolve_timezone(timezone_name))
    open_time = time.fromisoformat(str(market_hours["open"]))
    close_time = time.fromisoformat(str(market_hours["close"]))
    current_session_open_at = datetime.combine(now.date(), open_time, tzinfo=now.tzinfo)
    current_session_close_at = datetime.combine(now.date(), close_time, tzinfo=now.tzinfo)
    is_weekday = now.weekday() < 5
    market_open = bool(is_weekday and current_session_open_at <= now <= current_session_close_at)
    next_open_at = resolve_next_open_at(now, open_time, close_time)
    seconds_until_open = max(int((next_open_at - now).total_seconds()), 0)
    return {
        "exchange": exchange_name,
        "timezone": timezone_name,
        "checked_at": now.isoformat(),
        "market_open": market_open,
        "session_open_time": open_time.isoformat(timespec="minutes"),
        "session_close_time": close_time.isoformat(timespec="minutes"),
        "current_session_open_at": current_session_open_at.isoformat(),
        "current_session_close_at": current_session_close_at.isoformat(),
        "next_open_at": next_open_at.isoformat(),
        "seconds_until_open": 0 if market_open else seconds_until_open,
        "live_data_provider": str(exchange_config.get("live_data_provider", "yfinance")),
    }


def resolve_next_open_at(now: datetime, open_time: time, close_time: time) -> datetime:
    current_open = datetime.combine(now.date(), open_time, tzinfo=now.tzinfo)
    current_close = datetime.combine(now.date(), close_time, tzinfo=now.tzinfo)
    if now.weekday() < 5 and now < current_open:
        return current_open
    next_date = now.date() + timedelta(days=1 if now <= current_close else 1)
    while next_date.weekday() >= 5:
        next_date += timedelta(days=1)
    return datetime.combine(next_date, open_time, tzinfo=now.tzinfo)


def _resolve_timezone(timezone_name: str):
    from zoneinfo import ZoneInfo

    return ZoneInfo(timezone_name)
