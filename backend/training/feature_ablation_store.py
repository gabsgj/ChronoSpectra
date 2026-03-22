from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from models.base_model import MODEL_STORE_DIR

FEATURE_ABLATION_REPORT_DIR = MODEL_STORE_DIR / "feature_ablation"


def resolve_feature_ablation_report_path(
    stock_id: str,
    mode: str,
    base_dir: Path | None = None,
) -> Path:
    normalized_stock_id = stock_id.strip().upper()
    normalized_mode = mode.strip().lower()
    return (base_dir or FEATURE_ABLATION_REPORT_DIR) / (
        f"{normalized_stock_id}_{normalized_mode}_feature_ablation_report.json"
    )


def load_feature_ablation_payload(
    stock_id: str,
    mode: str,
    base_dir: Path | None = None,
) -> dict[str, Any]:
    report_path = resolve_feature_ablation_report_path(stock_id, mode, base_dir=base_dir)
    if not report_path.exists():
        return {}
    try:
        payload = json.loads(report_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, dict):
        return {}
    return payload


def persist_feature_ablation_payload(
    *,
    stock_id: str,
    mode: str,
    configured_channels: list[str],
    transform_name: str,
    entries: list[dict[str, Any]],
    generated_at: str | None = None,
    base_dir: Path | None = None,
) -> dict[str, Any]:
    resolved_base_dir = base_dir or FEATURE_ABLATION_REPORT_DIR
    report_path = resolve_feature_ablation_report_path(stock_id, mode, base_dir=resolved_base_dir)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "stock_id": stock_id.strip().upper(),
        "mode": mode.strip().lower(),
        "generated_at": generated_at or utc_now_iso(),
        "report_path": str(report_path),
        "configured_channels": list(configured_channels),
        "transform_name": transform_name,
        "entries": list(entries),
    }
    report_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _write_aggregate_report(base_dir=resolved_base_dir)
    return payload


def _write_aggregate_report(base_dir: Path | None = None) -> None:
    resolved_base_dir = base_dir or FEATURE_ABLATION_REPORT_DIR
    resolved_base_dir.mkdir(parents=True, exist_ok=True)
    aggregate_path = resolved_base_dir / "feature_ablation_report.json"
    aggregate_payload: list[dict[str, Any]] = []
    for candidate_path in sorted(
        resolved_base_dir.glob("*_feature_ablation_report.json")
    ):
        try:
            payload = json.loads(candidate_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            aggregate_payload.append(payload)
    aggregate_path.write_text(json.dumps(aggregate_payload, indent=2), encoding="utf-8")


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
