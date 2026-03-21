from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from data.cache.data_cache import DataCache
from retraining.drift_detector import DriftDetector
from retraining.retrain_worker import RetrainWorker, RetrainingError

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
except ImportError:  # pragma: no cover - graceful runtime fallback if dependency is absent.
    AsyncIOScheduler = None  # type: ignore[assignment]

_SCHEDULER_STATUS: dict[str, Any] = {
    "enabled": False,
    "running": False,
    "available": AsyncIOScheduler is not None,
    "check_interval_hours": None,
    "last_check_started_at": None,
    "last_check_completed_at": None,
    "last_results": [],
}


def start_retraining_scheduler(config: dict[str, Any]) -> Any | None:
    retraining_config = config.get("retraining", {})
    _SCHEDULER_STATUS["enabled"] = bool(retraining_config.get("enabled", True))
    _SCHEDULER_STATUS["check_interval_hours"] = retraining_config.get("check_interval_hours")
    if not _SCHEDULER_STATUS["enabled"] or AsyncIOScheduler is None:
        _SCHEDULER_STATUS["running"] = False
        return None
    scheduler = AsyncIOScheduler(timezone=str(UTC))
    scheduler.add_job(
        run_retraining_check,
        "interval",
        hours=int(retraining_config["check_interval_hours"]),
        args=[config],
        id="retraining-check",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _SCHEDULER_STATUS["running"] = True
    return scheduler


async def run_retraining_check(config: dict[str, Any]) -> dict[str, Any]:
    started_at = _utc_now_iso()
    _SCHEDULER_STATUS["last_check_started_at"] = started_at
    cache = DataCache(default_ttl_seconds=300)
    results: list[dict[str, Any]] = []
    for stock in config["active_stocks"]:
        worker = RetrainWorker(stock, config, cache)
        detector = DriftDetector(stock["id"], config)
        scheduled_due = worker.is_retrain_due()
        drift_detected = detector.check()
        if not scheduled_due and not drift_detected:
            continue
        reason = "scheduled" if scheduled_due else "drift_detected"
        try:
            result = await worker.retrain(reason=reason)
        except RetrainingError as exc:
            result = {
                "stock_id": stock["id"],
                "timestamp": _utc_now_iso(),
                "reason": reason,
                "status": "failed",
                "error": str(exc),
            }
        results.append(result)
    _SCHEDULER_STATUS["last_check_completed_at"] = _utc_now_iso()
    _SCHEDULER_STATUS["last_results"] = results
    return {"results": results, "started_at": started_at}


def get_scheduler_status() -> dict[str, Any]:
    return dict(_SCHEDULER_STATUS)


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
