from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI

from retraining.scheduler import run_retraining_check
from training.runtime_state import TrainingAlreadyRunningError, start_training_run

logger = logging.getLogger(__name__)


def plan_startup_actions(config: dict[str, Any]) -> list[dict[str, Any]]:
    planned_actions: list[dict[str, Any]] = []
    local_training = config.get("local_training", {})
    retrain_on_startup = config.get("retrain_on_startup", {})

    if bool(local_training.get("enabled", False)):
        planned_actions.append(
            {
                "name": "local_training",
                "status": "scheduled",
                "auto_place_models": bool(local_training.get("auto_place_models", True)),
                "scheduled_at": _utc_now_iso(),
            }
        )
        if bool(retrain_on_startup.get("enabled", False)):
            planned_actions.append(
                {
                    "name": "retrain_on_startup",
                    "status": "skipped",
                    "reason": "local_training_enabled",
                    "scheduled_at": _utc_now_iso(),
                }
            )
        return planned_actions

    if bool(retrain_on_startup.get("enabled", False)):
        planned_actions.append(
            {
                "name": "retrain_on_startup",
                "status": "scheduled",
                "scheduled_at": _utc_now_iso(),
            }
        )

    return planned_actions


def schedule_startup_actions(app: FastAPI) -> list[asyncio.Task[Any]]:
    planned_actions = plan_startup_actions(app.state.config)
    app.state.startup_actions = [dict(action) for action in planned_actions]
    tasks: list[asyncio.Task[Any]] = []

    for index, action in enumerate(planned_actions):
        if action.get("status") != "scheduled":
            continue
        action_name = str(action["name"])
        if action_name == "local_training":
            tasks.append(
                asyncio.create_task(
                    _run_local_training(app, index),
                    name="startup-local-training",
                )
            )
            continue
        if action_name == "retrain_on_startup":
            tasks.append(
                asyncio.create_task(
                    _run_retraining_refresh(app, index),
                    name="startup-retraining-refresh",
                )
            )

    return tasks


async def _run_local_training(app: FastAPI, action_index: int) -> None:
    _update_action(app, action_index, status="running", started_at=_utc_now_iso())
    try:
        runtime_state = await asyncio.to_thread(start_training_run, app.state.config)
    except TrainingAlreadyRunningError as exc:
        logger.warning("Startup local training skipped: %s", exc)
        _update_action(
            app,
            action_index,
            status="skipped",
            reason="training_already_running",
            detail=str(exc),
            finished_at=_utc_now_iso(),
        )
        return
    except Exception as exc:  # pragma: no cover - defensive logging for real startup failures.
        logger.exception("Startup local training failed.")
        _update_action(
            app,
            action_index,
            status="failed",
            detail=str(exc),
            finished_at=_utc_now_iso(),
        )
        return

    _update_action(
        app,
        action_index,
        status="started",
        run_id=str(runtime_state["run_id"]),
        requested_stock_ids=list(runtime_state["requested_stock_ids"]),
        planned_modes=list(runtime_state.get("planned_modes", [])),
        total_jobs=int(runtime_state.get("total_jobs", runtime_state["total_stocks"])),
        finished_at=_utc_now_iso(),
    )


async def _run_retraining_refresh(app: FastAPI, action_index: int) -> None:
    _update_action(app, action_index, status="running", started_at=_utc_now_iso())
    try:
        result = await run_retraining_check(app.state.config)
    except Exception as exc:  # pragma: no cover - defensive logging for real startup failures.
        logger.exception("Startup retraining refresh failed.")
        _update_action(
            app,
            action_index,
            status="failed",
            detail=str(exc),
            finished_at=_utc_now_iso(),
        )
        return

    _update_action(
        app,
        action_index,
        status="completed",
        results=result.get("results", []),
        finished_at=_utc_now_iso(),
    )


def _update_action(app: FastAPI, action_index: int, **fields: Any) -> None:
    startup_actions = getattr(app.state, "startup_actions", None)
    if not isinstance(startup_actions, list):
        return
    if action_index >= len(startup_actions):
        return
    startup_actions[action_index].update(fields)


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
