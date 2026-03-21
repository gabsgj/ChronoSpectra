from __future__ import annotations

import asyncio
import copy
import threading
import uuid
from datetime import UTC, datetime
from typing import Any

from config import find_stock
from data.cache.data_cache import DataCache
from retraining.retrain_worker import RetrainWorker

MANUAL_TRAINING_REASON = "manual_training"
_STATE_LOCK = threading.Lock()
_EVENT_RETENTION = 1000
_TRAINING_STATE: dict[str, Any] = {
    "run_id": None,
    "is_running": False,
    "started_at": None,
    "finished_at": None,
    "requested_stock_ids": [],
    "active_stock_id": None,
    "total_stocks": 0,
    "completed_stocks": 0,
    "latest_event_id": 0,
    "events": [],
    "results": [],
}


class TrainingAlreadyRunningError(Exception):
    """Raised when a training run is already active."""


def start_training_run(
    app_config: dict[str, Any],
    stock_id: str | None = None,
) -> dict[str, Any]:
    stock_configs = _resolve_stock_configs(app_config, stock_id)
    run_id = uuid.uuid4().hex
    started_at = _utc_now_iso()
    initial_state = {
        "run_id": run_id,
        "is_running": True,
        "started_at": started_at,
        "finished_at": None,
        "requested_stock_ids": [stock["id"] for stock in stock_configs],
        "active_stock_id": None,
        "total_stocks": len(stock_configs),
        "completed_stocks": 0,
        "latest_event_id": 0,
        "events": [],
        "results": [],
    }
    with _STATE_LOCK:
        if bool(_TRAINING_STATE["is_running"]):
            raise TrainingAlreadyRunningError("A training job is already in progress.")
        _TRAINING_STATE.clear()
        _TRAINING_STATE.update(initial_state)
    _emit_event(
        "training_started",
        run_id=run_id,
        requested_stock_ids=initial_state["requested_stock_ids"],
        total_stocks=initial_state["total_stocks"],
    )
    worker_thread = threading.Thread(
        target=_run_training_job,
        args=(run_id, stock_configs, app_config),
        name=f"training-run-{run_id}",
        daemon=True,
    )
    worker_thread.start()
    return get_training_state()


def get_training_state() -> dict[str, Any]:
    with _STATE_LOCK:
        state_copy = copy.deepcopy(_TRAINING_STATE)
    state_copy.pop("events", None)
    return state_copy


def get_training_events(after_event_id: int = 0) -> list[dict[str, Any]]:
    with _STATE_LOCK:
        events = copy.deepcopy(_TRAINING_STATE["events"])
    return [event for event in events if int(event["event_id"]) > after_event_id]


def build_progress_payload() -> dict[str, Any]:
    with _STATE_LOCK:
        state_copy = copy.deepcopy(_TRAINING_STATE)
    events = state_copy.pop("events", [])
    state_copy["recent_events"] = events[-10:]
    return state_copy


def _run_training_job(
    run_id: str,
    stock_configs: list[dict[str, Any]],
    app_config: dict[str, Any],
) -> None:
    cache = DataCache(default_ttl_seconds=300)
    try:
        for index, stock in enumerate(stock_configs, start=1):
            _set_active_stock(stock["id"])
            _emit_event(
                "stock_started",
                run_id=run_id,
                stock_id=stock["id"],
                stock_index=index,
                total_stocks=len(stock_configs),
            )
            worker = RetrainWorker(stock, app_config, cache)
            try:
                result = asyncio.run(
                    worker.retrain(
                        reason=MANUAL_TRAINING_REASON,
                        progress_callback=_build_epoch_callback(
                            run_id,
                            stock["id"],
                            worker.resolve_training_mode(),
                        ),
                    )
                )
            except Exception as exc:
                result = {
                    "stock_id": stock["id"],
                    "status": "failed",
                    "reason": MANUAL_TRAINING_REASON,
                    "mode": worker.resolve_training_mode(),
                    "timestamp": _utc_now_iso(),
                    "error": str(exc),
                }
            _append_result(result)
            _increment_completed_stock()
            _emit_event(
                "stock_completed",
                run_id=run_id,
                stock_id=stock["id"],
                status=result.get("status"),
                mode=result.get("mode"),
                after_mse=result.get("after_mse"),
                duration_seconds=result.get("duration_seconds"),
            )
    finally:
        _clear_active_stock()
        _finish_run()
        completed_state = get_training_state()
        _emit_event(
            "training_completed",
            run_id=run_id,
            completed_stocks=completed_state["completed_stocks"],
            total_stocks=completed_state["total_stocks"],
        )


def _resolve_stock_configs(
    app_config: dict[str, Any],
    stock_id: str | None,
) -> list[dict[str, Any]]:
    if stock_id is None:
        return list(app_config["active_stocks"])
    stock = find_stock(app_config, stock_id)
    if stock is None:
        raise ValueError(f"Unknown stock '{stock_id}'.")
    return [stock]


def _build_epoch_callback(run_id: str, stock_id: str, mode: str):
    def callback(payload: dict[str, Any]) -> None:
        _emit_event(
            "epoch",
            run_id=run_id,
            stock_id=stock_id,
            mode=mode,
            epoch=payload.get("epoch"),
            train_loss=payload.get("train_loss"),
            val_loss=payload.get("val_loss"),
        )

    return callback


def _emit_event(event_name: str, **payload: Any) -> None:
    with _STATE_LOCK:
        next_event_id = int(_TRAINING_STATE["latest_event_id"]) + 1
        _TRAINING_STATE["latest_event_id"] = next_event_id
        event = {
            "event_id": next_event_id,
            "event": event_name,
            "timestamp": _utc_now_iso(),
            **payload,
        }
        _TRAINING_STATE["events"].append(event)
        _TRAINING_STATE["events"] = _TRAINING_STATE["events"][-_EVENT_RETENTION:]


def _append_result(result: dict[str, Any]) -> None:
    with _STATE_LOCK:
        _TRAINING_STATE["results"].append(_sanitize_result(result))


def _increment_completed_stock() -> None:
    with _STATE_LOCK:
        _TRAINING_STATE["completed_stocks"] = int(_TRAINING_STATE["completed_stocks"]) + 1


def _set_active_stock(stock_id: str) -> None:
    with _STATE_LOCK:
        _TRAINING_STATE["active_stock_id"] = stock_id


def _clear_active_stock() -> None:
    with _STATE_LOCK:
        _TRAINING_STATE["active_stock_id"] = None


def _finish_run() -> None:
    with _STATE_LOCK:
        _TRAINING_STATE["is_running"] = False
        _TRAINING_STATE["finished_at"] = _utc_now_iso()


def _sanitize_result(result: dict[str, Any]) -> dict[str, Any]:
    safe_keys = {
        "stock_id",
        "status",
        "reason",
        "mode",
        "timestamp",
        "before_mse",
        "after_mse",
        "duration_seconds",
        "error",
    }
    return {key: value for key, value in result.items() if key in safe_keys}


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
