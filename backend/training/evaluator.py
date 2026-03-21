from __future__ import annotations

import math
from typing import Any, cast

import numpy as np
import torch
from torch import Tensor
from torch.utils.data import DataLoader

from models.base_model import BaseModel
from models.unified_cnn_with_embeddings import UnifiedCNNWithEmbeddings
from training.training_types import EvaluationReport, ScalingMetadata, SpectrogramDataset


class Evaluator:
    def evaluate_model(
        self,
        model: BaseModel,
        dataset: SpectrogramDataset,
        scalers_by_stock: dict[str, ScalingMetadata],
        device: str | torch.device = "cpu",
        batch_size: int = 32,
    ) -> EvaluationReport:
        data_loader = DataLoader(dataset, batch_size=batch_size, shuffle=False)
        resolved_device = torch.device(device)
        model = model.to(resolved_device)
        model.eval()
        normalized_predictions: list[np.ndarray] = []
        normalized_targets: list[np.ndarray] = []
        reference_prices_raw: list[np.ndarray] = []
        stock_ids: list[str] = []
        timestamps: list[str] = []
        with torch.no_grad():
            for batch in data_loader:
                predictions = self._forward_batch(model, batch, resolved_device)
                normalized_predictions.append(predictions.cpu().numpy().reshape(-1))
                normalized_targets.append(
                    cast(Tensor, batch["target"]).cpu().numpy().reshape(-1)
                )
                reference_prices_raw.append(
                    cast(Tensor, batch["reference_raw"]).cpu().numpy().reshape(-1)
                )
                stock_ids.extend(str(stock_id) for stock_id in cast(list[Any], batch["stock_id"]))
                timestamps.extend(
                    str(timestamp)
                    for timestamp in cast(list[Any], batch["label_timestamp"])
                )
        prediction_values = np.concatenate(normalized_predictions)
        target_values = np.concatenate(normalized_targets)
        reference_values = np.concatenate(reference_prices_raw)
        return self.evaluate_predictions(
            prediction_values,
            target_values,
            reference_values,
            stock_ids,
            timestamps,
            scalers_by_stock,
        )

    def evaluate_predictions(
        self,
        predictions_normalized: np.ndarray,
        targets_normalized: np.ndarray,
        reference_prices_raw: np.ndarray,
        stock_ids: list[str],
        timestamps: list[str],
        scalers_by_stock: dict[str, ScalingMetadata],
    ) -> EvaluationReport:
        if predictions_normalized.size == 0 or targets_normalized.size == 0:
            raise ValueError("Evaluator requires at least one prediction.")
        predictions_raw = self._denormalize(predictions_normalized, stock_ids, scalers_by_stock)
        targets_raw = self._denormalize(targets_normalized, stock_ids, scalers_by_stock)
        errors = predictions_raw - targets_raw
        absolute_errors = np.abs(errors)
        mse = float(np.mean(np.square(errors)))
        rmse = float(math.sqrt(mse))
        mae = float(np.mean(absolute_errors))
        mape = self._compute_mape(targets_raw, absolute_errors)
        directional_accuracy = self._compute_directional_accuracy(
            predictions_raw,
            targets_raw,
            reference_prices_raw,
        )
        return EvaluationReport(
            mse=mse,
            rmse=rmse,
            mae=mae,
            mape=mape,
            directional_accuracy=directional_accuracy,
            predictions_raw=predictions_raw.astype(float).tolist(),
            targets_raw=targets_raw.astype(float).tolist(),
            reference_prices_raw=reference_prices_raw.astype(float).tolist(),
            stock_ids=stock_ids,
            timestamps=timestamps,
        )

    def _forward_batch(
        self,
        model: BaseModel,
        batch: dict[str, Any],
        device: torch.device,
    ) -> torch.Tensor:
        inputs = cast(Tensor, batch["inputs"]).to(device=device, dtype=torch.float32)
        if isinstance(model, UnifiedCNNWithEmbeddings):
            stock_index = cast(Tensor, batch["stock_index"]).to(
                device=device,
                dtype=torch.long,
            )
            return model(inputs, stock_index)
        return model(inputs)

    def _denormalize(
        self,
        values: np.ndarray,
        stock_ids: list[str],
        scalers_by_stock: dict[str, ScalingMetadata],
    ) -> np.ndarray:
        denormalized = np.zeros_like(values, dtype=float)
        for index, stock_id in enumerate(stock_ids):
            denormalized[index] = scalers_by_stock[stock_id].denormalize(
                values[index:index + 1]
            )[0]
        return denormalized

    def _compute_mape(self, targets_raw: np.ndarray, absolute_errors: np.ndarray) -> float:
        non_zero_mask = targets_raw != 0
        if not np.any(non_zero_mask):
            return 0.0
        return float(
            np.mean(absolute_errors[non_zero_mask] / np.abs(targets_raw[non_zero_mask]))
            * 100.0
        )

    def _compute_directional_accuracy(
        self,
        predictions_raw: np.ndarray,
        targets_raw: np.ndarray,
        reference_prices_raw: np.ndarray,
    ) -> float:
        predicted_direction = np.sign(predictions_raw - reference_prices_raw)
        actual_direction = np.sign(targets_raw - reference_prices_raw)
        return float(np.mean(predicted_direction == actual_direction) * 100.0)
