from __future__ import annotations

import json
from textwrap import dedent
from typing import Any

from training.notebook_cells import (
    _code_cell,
    _config_source,
    _data_pipeline_source,
    _dependency_install_source,
    _drive_mount_source,
    _drive_export_source,
    _markdown_cell,
    _model_architecture_source,
    _training_loop_source,
)


def build_feature_ablation_notebook_cells(
    app_config: dict[str, Any],
    mode: str,
) -> list[dict[str, Any]]:
    config_json = json.dumps(app_config, indent=2)
    return [
        _markdown_cell(
            "ChronoSpectra Feature Ablation Notebook",
            (
                f"This notebook was generated for `{mode}` mode. It trains a baseline and "
                "channel-drop variants, saves reusable feature-ablation reports for every "
                "active stock, and keeps the artifact layout compatible with the app importer."
            ),
        ),
        _markdown_cell(
            "Mount Google Drive",
            "Run this first in Colab so the export target is ready before the ablation run starts.",
        ),
        _code_cell(_drive_mount_source()),
        _code_cell(_dependency_install_source()),
        _markdown_cell(
            "Configuration Snapshot",
            "The full `stocks.json` payload is embedded below so the notebook can run in Colab without edits.",
        ),
        _code_cell(_config_source(config_json, mode)),
        _code_cell(_feature_ablation_output_dir_source()),
        _markdown_cell(
            "Model Definitions",
            "These definitions mirror the backend models so the feature-ablation training path uses the same architecture.",
        ),
        _code_cell(_model_architecture_source()),
        _markdown_cell(
            "Data Pipeline",
            "This section builds the multi-channel spectrogram datasets that the ablation runs compare.",
        ),
        _code_cell(_data_pipeline_source()),
        _markdown_cell(
            "Training And Evaluation",
            "These helpers handle time splits, training, metrics, and dataset summaries needed by the ablation reports.",
        ),
        _code_cell(_training_loop_source()),
        _markdown_cell(
            "Run Feature Ablation",
            "Execute this cell to build reusable feature-ablation reports for all active stocks in the selected mode. This can take several minutes because it retrains baseline and channel-drop variants.",
        ),
        _code_cell(_run_feature_ablation_source(mode)),
        _markdown_cell(
            "Export To Google Drive",
            "Run this after the notebook finishes to copy the feature-ablation bundle to Drive for download and later import into the app.",
        ),
        _code_cell(_drive_export_source()),
    ]


def _feature_ablation_output_dir_source(
    output_dir_var: str = "OUTPUT_DIR",
    output_dir_name: str = "chronospectra_feature_ablation_artifacts",
    reports_dir_var: str = "REPORTS_DIR",
) -> str:
    return f"""
from pathlib import Path

{output_dir_var} = Path("{output_dir_name}")
{output_dir_var}.mkdir(exist_ok=True)
{reports_dir_var} = {output_dir_var} / "reports"
{reports_dir_var}.mkdir(exist_ok=True)

print("Feature ablation output dir:", {output_dir_var})
    """


def _run_feature_ablation_source(
    mode: str,
    output_dir_var: str = "OUTPUT_DIR",
    reports_dir_var: str = "REPORTS_DIR",
) -> str:
    return dedent(
        f"""
from datetime import datetime, timezone

NOTEBOOK_MODE = "{mode}"
ORIGINAL_FEATURE_CHANNELS = list(FEATURE_CHANNEL_NAMES)


def build_channel_sets() -> list[tuple[str, list[str], str | None]]:
    channel_sets = [("baseline", list(ORIGINAL_FEATURE_CHANNELS), None)]
    for removed_channel in ORIGINAL_FEATURE_CHANNELS:
        remaining_channels = [
            channel for channel in ORIGINAL_FEATURE_CHANNELS if channel != removed_channel
        ]
        if remaining_channels:
            channel_sets.append(
                (f"minus_{{removed_channel}}", remaining_channels, removed_channel)
            )
    return channel_sets


def select_test_dataset_for_stock(mode_name: str, datasets: dict, stock_id: str) -> SpectrogramDataset:
    if mode_name == "per_stock":
        return datasets["test"]
    filtered_samples = [
        sample for sample in datasets["test"].samples if sample["stock_id"] == stock_id
    ]
    if not filtered_samples:
        raise ValueError(f"No evaluation samples found for {{stock_id}}.")
    return SpectrogramDataset(filtered_samples)


def build_report_entries(results: list[dict]) -> list[dict]:
    baseline = next((result for result in results if result["removed_channel"] is None), None)
    if baseline is None:
        raise ValueError("Baseline ablation result is missing.")
    baseline_metrics = baseline["metrics"]
    entries = []
    for result in results:
        metrics = result["metrics"]
        is_baseline = result["removed_channel"] is None
        entries.append(
            {{
                "label": result["label"],
                "channels": list(result["channels"]),
                "removed_channel": result["removed_channel"],
                "mse": float(metrics["mse"]),
                "rmse": float(metrics["rmse"]),
                "mae": float(metrics["mae"]),
                "mape": float(metrics["mape"]),
                "directional_accuracy": float(metrics["directional_accuracy"]),
                "delta_mse": None if is_baseline else float(metrics["mse"] - baseline_metrics["mse"]),
                "delta_rmse": None if is_baseline else float(metrics["rmse"] - baseline_metrics["rmse"]),
                "delta_mae": None if is_baseline else float(metrics["mae"] - baseline_metrics["mae"]),
                "delta_mape": None if is_baseline else float(metrics["mape"] - baseline_metrics["mape"]),
                "delta_directional_accuracy": (
                    None
                    if is_baseline
                    else float(
                        metrics["directional_accuracy"] - baseline_metrics["directional_accuracy"]
                    )
                ),
            }}
        )
    return entries


def write_feature_ablation_report(stock_id: str, mode_name: str, entries: list[dict]) -> dict:
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    report_path = {reports_dir_var} / f"{{stock_id}}_{{mode_name}}_feature_ablation_report.json"
    payload = {{
        "stock_id": stock_id,
        "mode": mode_name,
        "generated_at": generated_at,
        "report_path": str(report_path),
        "configured_channels": list(ORIGINAL_FEATURE_CHANNELS),
        "transform_name": CONFIG["signal_processing"]["default_transform"],
        "entries": entries,
    }}
    report_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def run_per_stock_feature_ablation() -> list[dict]:
    reports = []
    for stock_index, stock_config in enumerate(ACTIVE_STOCKS):
        stock_results = []
        for label, channels, removed_channel in build_channel_sets():
            FEATURE_CHANNEL_NAMES[:] = list(channels)
            datasets = build_per_stock_bundle(stock_config, stock_index)
            checkpoint_path = {output_dir_var} / f"{{stock_config['id']}}_{{NOTEBOOK_MODE}}_{{label}}.pth"
            model = create_model("per_stock", num_stocks=len(ACTIVE_STOCKS))
            train_model(model, datasets, "per_stock", checkpoint_path)
            best_model = load_trained_model("per_stock", len(ACTIVE_STOCKS), checkpoint_path)
            metrics = evaluate_model(best_model, datasets["test"], datasets["scalers"], "per_stock")
            stock_results.append(
                {{
                    "label": label,
                    "channels": list(channels),
                    "removed_channel": removed_channel,
                    "metrics": metrics,
                }}
            )
        reports.append(
            write_feature_ablation_report(
                stock_config["id"],
                "per_stock",
                build_report_entries(stock_results),
            )
        )
    return reports


def run_unified_feature_ablation(mode_name: str) -> list[dict]:
    per_stock_results = {{
        stock_config["id"]: []
        for stock_config in ACTIVE_STOCKS
    }}

    for label, channels, removed_channel in build_channel_sets():
        FEATURE_CHANNEL_NAMES[:] = list(channels)
        datasets = build_unified_bundle(ACTIVE_STOCKS)
        checkpoint_path = {output_dir_var} / f"{{mode_name}}_{{label}}.pth"
        model = create_model(mode_name, num_stocks=len(ACTIVE_STOCKS))
        train_model(model, datasets, mode_name, checkpoint_path)
        best_model = load_trained_model(mode_name, len(ACTIVE_STOCKS), checkpoint_path)

        for stock_config in ACTIVE_STOCKS:
            evaluation_dataset = select_test_dataset_for_stock(
                mode_name,
                datasets,
                stock_config["id"],
            )
            metrics = evaluate_model(
                best_model,
                evaluation_dataset,
                datasets["scalers"],
                mode_name,
            )
            per_stock_results[stock_config["id"]].append(
                {{
                    "label": label,
                    "channels": list(channels),
                    "removed_channel": removed_channel,
                    "metrics": metrics,
                }}
            )

    return [
        write_feature_ablation_report(
            stock_config["id"],
            mode_name,
            build_report_entries(per_stock_results[stock_config["id"]]),
        )
        for stock_config in ACTIVE_STOCKS
    ]


if NOTEBOOK_MODE == "per_stock":
    feature_ablation_reports = run_per_stock_feature_ablation()
else:
    feature_ablation_reports = run_unified_feature_ablation(NOTEBOOK_MODE)

FEATURE_CHANNEL_NAMES[:] = list(ORIGINAL_FEATURE_CHANNELS)

aggregate_report_path = {output_dir_var} / "feature_ablation_report.json"
aggregate_report_path.write_text(
    json.dumps(feature_ablation_reports, indent=2),
    encoding="utf-8",
)

print("Feature ablation complete. Aggregate report written to", aggregate_report_path)
print("Stored reports:", len(feature_ablation_reports))
feature_ablation_reports
        """
    ).strip()
