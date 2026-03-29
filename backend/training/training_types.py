from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import torch
from torch.utils.data import Dataset


@dataclass(slots=True)
class ScalingMetadata:
    stock_id: str
    minimum_value: float
    maximum_value: float

    def normalize(self, values: np.ndarray) -> np.ndarray:
        scale = self.maximum_value - self.minimum_value
        if scale == 0:
            return np.zeros_like(values, dtype=float)
        return (values - self.minimum_value) / scale

    def denormalize(self, values: np.ndarray) -> np.ndarray:
        scale = self.maximum_value - self.minimum_value
        if scale == 0:
            return np.full_like(values, self.minimum_value, dtype=float)
        return values * scale + self.minimum_value


@dataclass(slots=True)
class ScalingArtifact:
    stock_id: str
    price_scaler: ScalingMetadata
    channel_scalers: dict[str, ScalingMetadata]

    @property
    def minimum_value(self) -> float:
        return self.price_scaler.minimum_value

    @property
    def maximum_value(self) -> float:
        return self.price_scaler.maximum_value

    def denormalize(self, values: np.ndarray) -> np.ndarray:
        return self.price_scaler.denormalize(values)

    def normalize_channel(self, channel_name: str, values: np.ndarray) -> np.ndarray:
        scaler = self.channel_scalers.get(channel_name)
        if scaler is None:
            raise ValueError(
                f"Scaling artifact for '{self.stock_id}' is missing channel '{channel_name}'."
            )
        return scaler.normalize(np.asarray(values, dtype=float))

    def supports_channels(self, channel_names: Sequence[str]) -> bool:
        return all(channel_name in self.channel_scalers for channel_name in channel_names)

    def as_dict(self) -> dict[str, Any]:
        return {
            "stock_id": self.stock_id,
            "minimum_value": self.price_scaler.minimum_value,
            "maximum_value": self.price_scaler.maximum_value,
            "channel_scalers": {
                channel_name: {
                    "minimum_value": scaler.minimum_value,
                    "maximum_value": scaler.maximum_value,
                }
                for channel_name, scaler in self.channel_scalers.items()
            },
        }


@dataclass(slots=True)
class TrainingSampleRecord:
    stock_id: str
    stock_index: int
    inputs: np.ndarray
    target_normalized: float
    target_raw: float
    reference_normalized: float
    reference_raw: float
    window_end_timestamp: str
    label_timestamp: str


class SpectrogramDataset(Dataset[dict[str, Any]]):
    def __init__(self, samples: Sequence[TrainingSampleRecord]) -> None:
        self.samples = list(samples)

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> dict[str, Any]:
        sample = self.samples[index]
        return {
            "inputs": torch.from_numpy(sample.inputs).float(),
            "target": torch.tensor([sample.target_normalized], dtype=torch.float32),
            "stock_index": torch.tensor(sample.stock_index, dtype=torch.long),
            "stock_id": sample.stock_id,
            "window_end_timestamp": sample.window_end_timestamp,
            "label_timestamp": sample.label_timestamp,
            "target_raw": torch.tensor(sample.target_raw, dtype=torch.float32),
            "reference_raw": torch.tensor(sample.reference_raw, dtype=torch.float32),
        }

    @property
    def label_timestamps(self) -> list[str]:
        return [sample.label_timestamp for sample in self.samples]

    @property
    def window_end_timestamps(self) -> list[str]:
        return [sample.window_end_timestamp for sample in self.samples]

    @property
    def input_shape(self) -> tuple[int, ...]:
        if not self.samples:
            return ()
        return tuple(self.samples[0].inputs.shape)

    def subset(self, size: int) -> "SpectrogramDataset":
        return SpectrogramDataset(self.samples[:size])


@dataclass(slots=True)
class DatasetBundle:
    train_dataset: SpectrogramDataset
    val_dataset: SpectrogramDataset
    test_dataset: SpectrogramDataset
    scalers_by_stock: dict[str, ScalingArtifact]
    feature_channels: list[str]
    transform_name: str
    lookback_days: int
    prediction_horizon_days: int

    def verification_summary(self, limit: int = 5) -> dict[str, Any]:
        train_timestamps = self.train_dataset.label_timestamps
        test_timestamps = self.test_dataset.label_timestamps
        train_set = set(train_timestamps)
        test_set = set(test_timestamps)
        return {
            "train_count": len(train_timestamps),
            "val_count": len(self.val_dataset),
            "test_count": len(test_timestamps),
            "train_first": train_timestamps[:limit],
            "train_last": train_timestamps[-limit:],
            "test_first": test_timestamps[:limit],
            "test_last": test_timestamps[-limit:],
            "train_test_overlap": len(train_set & test_set),
            "feature_channels": list(self.feature_channels),
            "test_is_later_than_train": bool(
                not train_timestamps
                or not test_timestamps
                or min(test_timestamps) > max(train_timestamps)
            ),
        }


@dataclass(slots=True)
class EpochMetrics:
    epoch: int
    train_loss: float
    val_loss: float


@dataclass(slots=True)
class TrainingRunResult:
    checkpoint_path: Path
    history: list[EpochMetrics]
    best_val_loss: float
    mode: str


@dataclass(slots=True)
class EvaluationReport:
    mse: float
    rmse: float
    mae: float
    mape: float
    directional_accuracy: float
    predictions_raw: list[float]
    targets_raw: list[float]
    reference_prices_raw: list[float]
    stock_ids: list[str]
    timestamps: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "mse": self.mse,
            "rmse": self.rmse,
            "mae": self.mae,
            "mape": self.mape,
            "directional_accuracy": self.directional_accuracy,
            "predictions_raw": self.predictions_raw,
            "targets_raw": self.targets_raw,
            "reference_prices_raw": self.reference_prices_raw,
            "stock_ids": self.stock_ids,
            "timestamps": self.timestamps,
        }
