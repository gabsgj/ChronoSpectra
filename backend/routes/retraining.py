from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from data.cache.data_cache import DataCache
from retraining.drift_detector import DriftDetector
from retraining.runtime_state import (
    RetrainingRunAlreadyRunningError,
    build_progress_payload,
    get_retraining_events,
    get_retraining_state,
    start_retraining_run,
)
from retraining.retrain_worker import (
    RETRAIN_REASON_MANUAL,
    RetrainingAlreadyRunningError,
    RetrainingExecutionError,
    RetrainWorker,
    get_retraining_status,
    load_retraining_log,
)
from retraining.scheduler import get_scheduler_status
from routes.api_models import (
    APIErrorResponse,
    RetrainingLogCollectionResponse,
    RetrainingStartResponse,
    RetrainingStatusResponse,
    RetrainingTriggerAllResponse,
    RetrainingTriggerResponse,
)
from routes.utils import raise_structured_http_error, require_stock

router = APIRouter(tags=["retraining"])
RETRAINING_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    404: {"model": APIErrorResponse},
    409: {"model": APIErrorResponse},
    500: {"model": APIErrorResponse},
}


@router.post(
    "/trigger/{stock_id}",
    response_model=RetrainingTriggerResponse,
    responses=RETRAINING_ERROR_RESPONSES,
)
async def trigger_retraining(stock_id: str, request: Request) -> RetrainingTriggerResponse:
    stock = require_stock(request, stock_id)
    worker = RetrainWorker(stock, request.app.state.config, _cache_from_request(request))
    try:
        result = await worker.retrain(reason=RETRAIN_REASON_MANUAL)
    except RetrainingAlreadyRunningError as exc:
        raise_structured_http_error(409, "retraining_already_running", str(exc))
    except RetrainingExecutionError as exc:
        raise_structured_http_error(500, "retraining_failed", str(exc))
    return {"status": "completed", "result": result}


@router.post(
    "/start/{stock_id}",
    response_model=RetrainingStartResponse,
    responses={404: {"model": APIErrorResponse}, 409: {"model": APIErrorResponse}},
)
def start_retraining(
    stock_id: str,
    request: Request,
) -> RetrainingStartResponse:
    stock = require_stock(request, stock_id)
    try:
        runtime_state = start_retraining_run(stock, request.app.state.config)
    except RetrainingRunAlreadyRunningError as exc:
        raise_structured_http_error(409, "retraining_already_running", str(exc))
    return RetrainingStartResponse(
        status="started",
        run_id=str(runtime_state["run_id"]),
        stock_id=str(runtime_state["stock_id"]),
        mode=(str(runtime_state["mode"]) if runtime_state["mode"] else None),
        started_at=str(runtime_state["started_at"]),
    )


@router.post("/trigger-all", response_model=RetrainingTriggerAllResponse)
async def trigger_all(request: Request) -> RetrainingTriggerAllResponse:
    cache = _cache_from_request(request)
    results: list[dict[str, Any]] = []
    for stock in request.app.state.config["active_stocks"]:
        worker = RetrainWorker(stock, request.app.state.config, cache)
        try:
            result = await worker.retrain(reason=RETRAIN_REASON_MANUAL)
        except (RetrainingAlreadyRunningError, RetrainingExecutionError) as exc:
            result = {
                "stock_id": stock["id"],
                "status": "failed",
                "reason": RETRAIN_REASON_MANUAL,
                "error": str(exc),
            }
        results.append(result)
    return {"status": "completed", "results": results}


@router.get("/status", response_model=RetrainingStatusResponse)
def retraining_status(request: Request) -> RetrainingStatusResponse:
    config = request.app.state.config
    stock_statuses = []
    for stock in config["active_stocks"]:
        worker = RetrainWorker(stock, config, _cache_from_request(request))
        detector = DriftDetector(stock["id"], config)
        stock_statuses.append(
            {
                "stock_id": stock["id"],
                "mode": worker.resolve_training_mode(),
                "retrain_due": worker.is_retrain_due(),
                "drift": detector.diagnostics(),
            }
        )
    return {
        "scheduler": get_scheduler_status(),
        "runtime": get_retraining_status(),
        "stocks": stock_statuses,
    }


@router.get("/progress")
async def retraining_progress(
    run_id: str | None = Query(None),
) -> StreamingResponse:
    async def event_generator():
        last_event_id = 0
        initial_payload = build_progress_payload(run_id=run_id)
        yield f"event: snapshot\ndata: {json.dumps(initial_payload)}\n\n"
        while True:
            new_events = get_retraining_events(last_event_id, run_id=run_id)
            if new_events:
                for event in new_events:
                    last_event_id = int(event["event_id"])
                    yield f"id: {last_event_id}\ndata: {json.dumps(event)}\n\n"
            current_state = get_retraining_state()
            if not current_state["is_running"] and not get_retraining_events(
                last_event_id,
                run_id=run_id,
            ):
                yield (
                    "event: completed\ndata: "
                    f"{json.dumps(build_progress_payload(run_id=run_id))}\n\n"
                )
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/logs", response_model=RetrainingLogCollectionResponse)
def retraining_logs() -> RetrainingLogCollectionResponse:
    return load_retraining_log()


def _cache_from_request(request: Request) -> DataCache:
    cache = getattr(request.app.state, "data_cache", None)
    if isinstance(cache, DataCache):
        return cache
    return DataCache(default_ttl_seconds=300)
