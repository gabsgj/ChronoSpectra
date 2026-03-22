from __future__ import annotations

import copy
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch

from data.cache.data_cache import DataCache
from models.base_model import BaseModel
from models.per_stock_cnn import PerStockCNN
from models.unified_cnn import UnifiedCNN
from models.unified_cnn_with_embeddings import UnifiedCNNWithEmbeddings
from training.dataset_builder import DatasetBuilder
from training.evaluator import Evaluator
from training.feature_channels import resolve_feature_channels
from training.train_loop import TrainLoop
from training.training_types import EvaluationReport, SpectrogramDataset

SUPPORTED_ABLATION_MODES = {"per_stock", "unified", "unified_with_embeddings"}


@dataclass(slots=True)
class AblationRunResult:
    label: str
    channels: list[str]
    removed_channel: str | None
    metrics: EvaluationReport


def _build_model(mode: str, app_config: dict[str, Any], in_channels: int) -> BaseModel:
    if mode == "per_stock":
        return PerStockCNN(in_channels=in_channels)
    if mode == "unified":
        return UnifiedCNN(in_channels=in_channels)
    if mode == "unified_with_embeddings":
        return UnifiedCNNWithEmbeddings(
            num_stocks=len(app_config["active_stocks"]),
            in_channels=in_channels,
        )
    raise ValueError(f"Unsupported feature ablation mode '{mode}'.")


def _evaluation_dataset_for_stock(
    mode: str,
    datasets: Any,
    stock_id: str,
) -> SpectrogramDataset:
    if mode == "per_stock":
        return datasets.test_dataset
    filtered_samples = [
        sample for sample in datasets.test_dataset.samples if sample.stock_id == stock_id
    ]
    if not filtered_samples:
        raise ValueError(f"No evaluation samples found for '{stock_id}'.")
    return SpectrogramDataset(filtered_samples)


def run_feature_ablation(
    app_config: dict[str, Any],
    stock_id: str,
    mode: str,
    epochs_override: int | None = None,
) -> list[AblationRunResult]:
    resolved_mode = mode.lower()
    if resolved_mode not in SUPPORTED_ABLATION_MODES:
        supported_modes = ", ".join(sorted(SUPPORTED_ABLATION_MODES))
        raise ValueError(
            f"Unsupported ablation mode '{mode}'. Expected one of: {supported_modes}."
        )

    configured_channels = resolve_feature_channels(app_config)
    if len(configured_channels) == 0:
        raise ValueError("No feature channels configured for ablation.")

    channel_sets: list[tuple[str, list[str], str | None]] = [
        ("baseline", configured_channels, None)
    ]
    for removed_channel in configured_channels:
        remaining_channels = [
            channel for channel in configured_channels if channel != removed_channel
        ]
        if not remaining_channels:
            continue
        channel_sets.append((f"minus_{removed_channel}", remaining_channels, removed_channel))

    cache = DataCache(default_ttl_seconds=300)
    results: list[AblationRunResult] = []

    for label, channels, removed_channel in channel_sets:
        run_config = copy.deepcopy(app_config)
        run_config.setdefault("training", {})["feature_channels"] = channels
        if epochs_override is not None:
            run_config["training"]["epochs"] = max(int(epochs_override), 1)

        builder = DatasetBuilder(run_config, cache)
        datasets = builder.build(resolved_mode, stock_id if resolved_mode == "per_stock" else None)
        model = _build_model(resolved_mode, run_config, in_channels=len(channels))

        with tempfile.TemporaryDirectory(prefix="chronospectra-ablation-") as temp_dir:
            checkpoint_path = Path(temp_dir) / f"{stock_id}_{label}.pth"
            training_result = TrainLoop(run_config).train(
                model=model,
                datasets=datasets,
                mode=resolved_mode,
                stock_id=stock_id if resolved_mode == "per_stock" else None,
                checkpoint_path=checkpoint_path,
                device="cpu",
            )

            loaded_model = _build_model(resolved_mode, run_config, in_channels=len(channels))
            state_dict = torch.load(training_result.checkpoint_path, map_location="cpu")
            if isinstance(state_dict, dict) and "state_dict" in state_dict:
                state_dict = state_dict["state_dict"]
            if not isinstance(state_dict, dict):
                raise ValueError("Unsupported checkpoint format while running ablation.")
            loaded_model.load_state_dict(state_dict)
            loaded_model.eval()

            evaluation_dataset = _evaluation_dataset_for_stock(
                resolved_mode,
                datasets,
                stock_id,
            )
            report = Evaluator().evaluate_model(
                loaded_model,
                evaluation_dataset,
                datasets.scalers_by_stock,
                batch_size=int(run_config["training"]["batch_size"]),
            )

        results.append(
            AblationRunResult(
                label=label,
                channels=list(channels),
                removed_channel=removed_channel,
                metrics=report,
            )
        )

    return results
