from __future__ import annotations

import json
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from typing import Any

from training.feature_ablation_store import (
    FEATURE_ABLATION_REPORT_DIR,
    persist_feature_ablation_payload,
    utc_now_iso,
)
from training.feature_channels import resolve_feature_channels

SUPPORTED_ABLATION_IMPORT_MODES = {
    "per_stock",
    "unified",
    "unified_with_embeddings",
}


@dataclass(slots=True)
class FeatureAblationImportResult:
    imported_at: str
    imported_stock_ids: list[str]
    imported_modes: list[str]
    imported_reports: list[str]
    aggregate_report_path: str | None
    skipped_entries: list[str]


def import_feature_ablation_bundle(
    bundle_path: Path,
    app_config: dict[str, Any],
    destination_dir: Path | None = None,
) -> FeatureAblationImportResult:
    source_bundle_path = bundle_path.expanduser().resolve()
    if not source_bundle_path.exists():
        raise ValueError(f"Feature ablation bundle '{source_bundle_path.name}' does not exist.")
    if not zipfile.is_zipfile(source_bundle_path):
        raise ValueError("Uploaded file is not a valid zip archive.")

    configured_channels = resolve_feature_channels(app_config)
    active_stock_ids = {str(stock_id).upper() for stock_id in app_config.get("stock_ids", [])}
    resolved_destination_dir = (destination_dir or FEATURE_ABLATION_REPORT_DIR).resolve()
    resolved_destination_dir.mkdir(parents=True, exist_ok=True)

    imported_at = utc_now_iso()
    imported_reports: list[str] = []
    imported_modes: set[str] = set()
    imported_stock_ids: set[str] = set()
    skipped_entries: list[str] = []

    with TemporaryDirectory(prefix="chronospectra-feature-ablation-import-") as temp_dir:
        extracted_root = Path(temp_dir)
        _safe_extract_zip(source_bundle_path, extracted_root)
        report_payloads = _collect_report_payloads(extracted_root)
        if not report_payloads:
            raise ValueError(
                "Bundle does not contain any '*_feature_ablation_report.json' files."
            )

        for payload in report_payloads:
            stock_id = str(payload.get("stock_id", "")).strip().upper()
            if not stock_id:
                skipped_entries.append("Skipped a report with no stock_id.")
                continue
            if stock_id not in active_stock_ids:
                skipped_entries.append(
                    f"Skipped feature ablation report for '{stock_id}' because it is not active in stocks.json."
                )
                continue

            mode = str(payload.get("mode", "")).strip().lower()
            if mode not in SUPPORTED_ABLATION_IMPORT_MODES:
                skipped_entries.append(
                    f"Skipped feature ablation report for '{stock_id}' with unsupported mode '{mode or 'unknown'}'."
                )
                continue

            payload_channels = _normalize_channels(payload.get("configured_channels"))
            if payload_channels != configured_channels:
                raise ValueError(
                    "Feature ablation report channels do not match the current app config. "
                    f"Bundle channels: {payload_channels}. Config channels: {configured_channels}."
                )

            entries = payload.get("entries")
            if not isinstance(entries, list) or not entries:
                raise ValueError(
                    f"Feature ablation report for '{stock_id}' is missing entry data."
                )

            stored_payload = persist_feature_ablation_payload(
                stock_id=stock_id,
                mode=mode,
                configured_channels=configured_channels,
                transform_name=str(
                    payload.get(
                        "transform_name",
                        app_config["signal_processing"]["default_transform"],
                    )
                ),
                entries=[entry for entry in entries if isinstance(entry, dict)],
                generated_at=(
                    str(payload.get("generated_at"))
                    if isinstance(payload.get("generated_at"), str)
                    else imported_at
                ),
                base_dir=resolved_destination_dir,
            )
            report_path = stored_payload.get("report_path")
            if isinstance(report_path, str):
                imported_reports.append(report_path)
            imported_stock_ids.add(stock_id)
            imported_modes.add(mode)

    aggregate_report_path = str(resolved_destination_dir / "feature_ablation_report.json")
    return FeatureAblationImportResult(
        imported_at=imported_at,
        imported_stock_ids=sorted(imported_stock_ids),
        imported_modes=sorted(imported_modes),
        imported_reports=sorted(imported_reports),
        aggregate_report_path=aggregate_report_path if Path(aggregate_report_path).exists() else None,
        skipped_entries=skipped_entries,
    )


def _safe_extract_zip(bundle_path: Path, destination_dir: Path) -> None:
    with zipfile.ZipFile(bundle_path) as archive:
        for member in archive.infolist():
            member_path = PurePosixPath(member.filename)
            if not member.filename or member_path.is_absolute() or ".." in member_path.parts:
                raise ValueError("Zip archive contains an unsafe file path.")
            destination_path = destination_dir.joinpath(*member_path.parts).resolve()
            if (
                destination_path != destination_dir.resolve()
                and destination_dir.resolve() not in destination_path.parents
            ):
                raise ValueError("Zip archive contains a path outside the extraction directory.")
            if member.is_dir():
                destination_path.mkdir(parents=True, exist_ok=True)
                continue
            destination_path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source_handle, destination_path.open("wb") as destination_handle:
                shutil.copyfileobj(source_handle, destination_handle)


def _collect_report_payloads(extracted_root: Path) -> list[dict[str, Any]]:
    report_payloads: list[dict[str, Any]] = []
    for candidate_path in sorted(extracted_root.rglob("*_feature_ablation_report.json")):
        payload = _load_payload(candidate_path)
        if payload:
            report_payloads.append(payload)

    if report_payloads:
        return report_payloads

    aggregate_path = next(
        (
            path
            for path in sorted(extracted_root.rglob("feature_ablation_report.json"))
            if path.is_file()
        ),
        None,
    )
    if aggregate_path is None:
        return []

    try:
        aggregate_payload = json.loads(aggregate_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Feature ablation aggregate report is not valid JSON.") from exc

    if isinstance(aggregate_payload, dict):
        return [aggregate_payload]
    if isinstance(aggregate_payload, list):
        return [entry for entry in aggregate_payload if isinstance(entry, dict)]
    raise ValueError("Feature ablation aggregate report must be a JSON object or list.")


def _load_payload(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if isinstance(payload, dict):
        return payload
    return {}


def _normalize_channels(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip().lower() for item in value if isinstance(item, str)]
