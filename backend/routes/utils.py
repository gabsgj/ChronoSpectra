from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request

from config import find_exchange, find_stock


def not_implemented_response(
    feature: str,
    *,
    stock_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "status": "not_implemented",
        "feature": feature,
        "phase": "Phase 1 scaffold",
    }
    if stock_id is not None:
        payload["stock_id"] = stock_id
    if extra is not None:
        payload.update(extra)
    return payload


def require_stock(request: Request, stock_id: str) -> dict[str, Any]:
    stock = find_stock(request.app.state.config, stock_id)
    if stock is None:
        available_stocks = ", ".join(request.app.state.config.get("stock_ids", []))
        raise HTTPException(
            status_code=404,
            detail=structured_error_payload(
                "unknown_stock",
                f"Unknown stock '{stock_id}'.",
                hint=(
                    f"Use one of the configured stock IDs: {available_stocks}."
                    if available_stocks
                    else None
                ),
            ),
        )
    return stock


def require_exchange(request: Request, exchange_name: str) -> dict[str, Any]:
    exchange = find_exchange(request.app.state.config, exchange_name)
    if exchange is None:
        available_exchanges = ", ".join(
            sorted(request.app.state.config.get("exchanges", {}).keys())
        )
        raise HTTPException(
            status_code=404,
            detail=structured_error_payload(
                "unknown_exchange",
                f"Unknown exchange '{exchange_name}'.",
                hint=(
                    f"Use one of the configured exchanges: {available_exchanges}."
                    if available_exchanges
                    else None
                ),
            ),
        )
    return exchange


async def one_shot_sse(payload: dict[str, Any]):
    yield f"data: {json.dumps(payload)}\n\n"


def structured_error_payload(
    error: str,
    detail: str,
    *,
    hint: str | None = None,
    artifact_path: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "error": error,
        "detail": detail,
    }
    if hint is not None:
        payload["hint"] = hint
    if artifact_path is not None:
        payload["artifact_path"] = artifact_path
    return payload


def raise_structured_http_error(
    status_code: int,
    error: str,
    detail: str,
    *,
    hint: str | None = None,
    artifact_path: str | None = None,
) -> None:
    raise HTTPException(
        status_code=status_code,
        detail=structured_error_payload(
            error,
            detail,
            hint=hint,
            artifact_path=artifact_path,
        ),
    )


def load_json_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    raw_text = path.read_text(encoding="utf-8").strip()
    if not raw_text:
        return {}
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError:
        return {}
    if isinstance(payload, dict):
        return payload
    return {}
