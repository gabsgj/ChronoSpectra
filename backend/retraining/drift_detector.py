from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from retraining.retrain_worker import PREDICTION_HISTORY_DIR, REPORT_STORE_DIR

RECENT_WINDOW_DAYS = 14


class DriftDetector:
    """Detects drift from recent prediction-vs-actual history for a single stock."""

    def __init__(
        self,
        stock_id: str,
        app_config: dict[str, Any],
        report_store_dir: Path | None = None,
        prediction_history_dir: Path | None = None,
    ) -> None:
        self.stock_id = stock_id
        self.config = app_config
        self.report_store_dir = report_store_dir or REPORT_STORE_DIR
        self.prediction_history_dir = prediction_history_dir or PREDICTION_HISTORY_DIR

    def check(self) -> bool:
        diagnostics = self.diagnostics()
        baseline_mse = diagnostics["baseline_mse"]
        recent_mse = diagnostics["recent_mse"]
        threshold_mse = diagnostics["threshold_mse"]
        if baseline_mse is None or recent_mse is None or threshold_mse is None:
            return False
        return recent_mse > threshold_mse

    def diagnostics(self) -> dict[str, Any]:
        baseline_mse = self._load_baseline_mse()
        recent_mse = self._compute_recent_mse(window_days=RECENT_WINDOW_DAYS)
        multiplier = float(self.config["retraining"]["drift_threshold_multiplier"])
        threshold_mse = baseline_mse * multiplier if baseline_mse is not None else None
        return {
            "stock_id": self.stock_id,
            "window_days": RECENT_WINDOW_DAYS,
            "baseline_mse": baseline_mse,
            "recent_mse": recent_mse,
            "threshold_multiplier": multiplier,
            "threshold_mse": threshold_mse,
            "drift_detected": bool(
                baseline_mse is not None
                and recent_mse is not None
                and threshold_mse is not None
                and recent_mse > threshold_mse
            ),
        }

    def _load_baseline_mse(self) -> float | None:
        report_path = self.report_store_dir / f"{self.stock_id}_training_report.json"
        report = self._read_json(report_path)
        baseline_mse = report.get("baseline_mse")
        if isinstance(baseline_mse, (int, float)):
            return float(baseline_mse)
        metrics = report.get("metrics")
        if isinstance(metrics, dict):
            mse = metrics.get("mse")
            if isinstance(mse, (int, float)):
                return float(mse)
        return None

    def _compute_recent_mse(self, window_days: int) -> float | None:
        history_path = self.prediction_history_dir / f"{self.stock_id}.json"
        history_payload = self._read_json(history_path)
        predictions = history_payload.get("predictions")
        if not isinstance(predictions, list):
            return None
        cutoff = _utc_now() - timedelta(days=window_days)
        squared_errors: list[float] = []
        for record in predictions:
            if not isinstance(record, dict):
                continue
            timestamp = record.get("timestamp")
            predicted_price = record.get("predicted_price")
            actual_price = record.get("actual_price")
            if not isinstance(timestamp, str):
                continue
            if (
                not isinstance(predicted_price, (int, float))
                or not isinstance(actual_price, (int, float))
            ):
                continue
            if _parse_timestamp(timestamp) < cutoff:
                continue
            squared_errors.append(float(predicted_price - actual_price) ** 2)
        if not squared_errors:
            return None
        return sum(squared_errors) / len(squared_errors)

    def _read_json(self, path: Path) -> dict[str, Any]:
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


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _parse_timestamp(value: str) -> datetime:
    normalized_value = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized_value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
