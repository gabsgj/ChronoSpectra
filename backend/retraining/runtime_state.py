from __future__ import annotations

import asyncio
import copy
import threading
import uuid
from datetime import UTC, datetime
from typing import Any

from data.cache.data_cache import DataCache
from retraining.retrain_worker import RETRAIN_REASON_MANUAL, RetrainWorker

_STATE_LOCK = threading.Lock()
_EVENT_RETENTION = 500
_RETRAINING_STATE: dict[str, Any] = {
    "run_id": None,
    "is_running": False,
    "stock_id": None,
    "mode": None,
    "started_at": None,
    "finished_at": None,
    "latest_event_id": 0,
    "events": [],
    "result": None,
}


class RetrainingRunAlreadyRunningError(Exception):
    """Raised when a retraining run is already active."""


def start_retraining_run(
    stock_config: dict[str, Any],
    app_config: dict[str, Any],
) -> dict[str, Any]:
    run_id = uuid.uuid4().hex
    started_at = _utc_now_iso()
    initial_mode = RetrainWorker(
        stock_config,
        app_config,
        DataCache(default_ttl_seconds=300),
    ).resolve_training_mode()
    initial_state = {
        "run_id": run_id,
        "is_running": True,
        "stock_id": stock_config["id"],
        "mode": initial_mode,
        "started_at": started_at,
        "finished_at": None,
        "latest_event_id": 0,
        "events": [],
        "result": None,
    }
    with _STATE_LOCK:
        if bool(_RETRAINING_STATE["is_running"]):
            raise RetrainingRunAlreadyRunningError(
                "A retraining job is already in progress."
            )
        _RETRAINING_STATE.clear()
        _RETRAINING_STATE.update(initial_state)
    _emit_event(
        "retraining_started",
        run_id=run_id,
        stock_id=stock_config["id"],
        mode=initial_mode,
        total_stocks=1,
    )
    worker_thread = threading.Thread(
        target=_run_retraining_job,
        args=(run_id, stock_config, app_config),
        name=f"retraining-run-{run_id}",
        daemon=True,
    )
    worker_thread.start()
    return get_retraining_state()


def get_retraining_state() -> dict[str, Any]:
    with _STATE_LOCK:
        state_copy = copy.deepcopy(_RETRAINING_STATE)
    state_copy.pop("events", None)
    return state_copy


def get_retraining_events(
    after_event_id: int = 0,
    run_id: str | None = None,
) -> list[dict[str, Any]]:
    with _STATE_LOCK:
        events = copy.deepcopy(_RETRAINING_STATE["events"])
    filtered_events = [event for event in events if int(event["event_id"]) > after_event_id]
    if run_id is None:
        return filtered_events
    return [event for event in filtered_events if event.get("run_id") == run_id]


def build_progress_payload(run_id: str | None = None) -> dict[str, Any]:
    with _STATE_LOCK:
        state_copy = copy.deepcopy(_RETRAINING_STATE)
    events = state_copy.pop("events", [])
    if run_id is not None:
        events = [event for event in events if event.get("run_id") == run_id]
    state_copy["recent_events"] = events[-10:]
    return state_copy


def _run_retraining_job(
    run_id: str,
    stock_config: dict[str, Any],
    app_config: dict[str, Any],
) -> None:
    worker = RetrainWorker(
        stock_config,
        app_config,
        DataCache(default_ttl_seconds=300),
    )
    _set_mode(worker.resolve_training_mode())
    try:
        result = asyncio.run(
            worker.retrain(
                reason=RETRAIN_REASON_MANUAL,
                progress_callback=_build_epoch_callback(
                    run_id,
                    stock_config["id"],
                    worker.resolve_training_mode(),
                ),
            )
        )
    except Exception as exc:
        result = {
            "stock_id": stock_config["id"],
            "status": "failed",
            "reason": RETRAIN_REASON_MANUAL,
            "mode": worker.resolve_training_mode(),
            "timestamp": _utc_now_iso(),
            "error": str(exc),
        }
    _set_result(result)
    _finish_run()
    completed_state = get_retraining_state()
    _emit_event(
        "retraining_completed",
        run_id=run_id,
        stock_id=stock_config["id"],
        mode=result.get("mode"),
        status=result.get("status"),
        after_mse=result.get("after_mse"),
        duration_seconds=result.get("duration_seconds"),
        finished_at=completed_state["finished_at"],
    )


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
        next_event_id = int(_RETRAINING_STATE["latest_event_id"]) + 1
        _RETRAINING_STATE["latest_event_id"] = next_event_id
        event = {
            "event_id": next_event_id,
            "event": event_name,
            "timestamp": _utc_now_iso(),
            **payload,
        }
        _RETRAINING_STATE["events"].append(event)
        _RETRAINING_STATE["events"] = _RETRAINING_STATE["events"][-_EVENT_RETENTION:]


def _set_mode(mode: str) -> None:
    with _STATE_LOCK:
        _RETRAINING_STATE["mode"] = mode


def _set_result(result: dict[str, Any]) -> None:
    with _STATE_LOCK:
        _RETRAINING_STATE["result"] = _sanitize_result(result)


def _finish_run() -> None:
    with _STATE_LOCK:
        _RETRAINING_STATE["is_running"] = False
        _RETRAINING_STATE["finished_at"] = _utc_now_iso()


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
