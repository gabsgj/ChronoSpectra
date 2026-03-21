from __future__ import annotations

from collections.abc import Sized
from pathlib import Path
from typing import Any, Callable, cast

import torch
from torch import Tensor, nn
from torch.optim import Adam, Optimizer
from torch.utils.data import DataLoader

from models.base_model import PER_STOCK_MODEL_DIR, UNIFIED_MODEL_DIR, BaseModel
from models.unified_cnn_with_embeddings import UnifiedCNNWithEmbeddings
from training.training_types import (
    DatasetBundle,
    EpochMetrics,
    SpectrogramDataset,
    TrainingRunResult,
)

EpochCallback = Callable[[EpochMetrics], None]


class TrainLoop:
    def __init__(self, app_config: dict[str, Any]) -> None:
        self.config = app_config
        self.loss_function = nn.MSELoss()

    def train(
        self,
        model: BaseModel,
        datasets: DatasetBundle,
        mode: str,
        stock_id: str | None = None,
        checkpoint_path: Path | None = None,
        progress_callback: EpochCallback | None = None,
        device: str | torch.device = "cpu",
    ) -> TrainingRunResult:
        if len(datasets.train_dataset) == 0:
            raise ValueError("Training dataset is empty.")
        resolved_device = torch.device(device)
        resolved_mode = mode.lower()
        model = model.to(resolved_device)
        optimizer = Adam(
            model.parameters(),
            lr=float(self.config["training"]["learning_rate"]),
        )
        output_path = checkpoint_path or self._resolve_checkpoint_path(resolved_mode, stock_id)
        train_loader = self._build_loader(datasets.train_dataset, shuffle=True)
        val_loader = self._build_loader(datasets.val_dataset, shuffle=False)
        history, best_val_loss = self._run_epochs(
            model,
            resolved_mode,
            train_loader,
            val_loader,
            optimizer,
            resolved_device,
            output_path,
            progress_callback,
        )
        return TrainingRunResult(
            checkpoint_path=output_path,
            history=history,
            best_val_loss=best_val_loss,
            mode=resolved_mode,
        )

    def _run_epochs(
        self,
        model: BaseModel,
        mode: str,
        train_loader: DataLoader[Any],
        val_loader: DataLoader[Any],
        optimizer: Optimizer,
        device: torch.device,
        checkpoint_path: Path,
        progress_callback: EpochCallback | None,
    ) -> tuple[list[EpochMetrics], float]:
        history: list[EpochMetrics] = []
        best_val_loss = float("inf")
        checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        epochs = int(self.config["training"]["epochs"])
        for epoch in range(1, epochs + 1):
            train_loss = self._run_training_epoch(model, mode, train_loader, optimizer, device)
            val_loss = self._run_validation_epoch(model, mode, val_loader, device, train_loss)
            epoch_metrics = EpochMetrics(epoch=epoch, train_loss=train_loss, val_loss=val_loss)
            history.append(epoch_metrics)
            if progress_callback is not None:
                progress_callback(epoch_metrics)
            if val_loss <= best_val_loss:
                best_val_loss = val_loss
                torch.save(model.state_dict(), checkpoint_path)
        return history, best_val_loss

    def _run_training_epoch(
        self,
        model: BaseModel,
        mode: str,
        data_loader: DataLoader[Any],
        optimizer: Optimizer,
        device: torch.device,
    ) -> float:
        model.train()
        cumulative_loss = 0.0
        batch_count = 0
        for batch in data_loader:
            optimizer.zero_grad()
            predictions = self._forward_batch(model, mode, batch, device)
            targets = self._batch_target(batch, device)
            loss = self.loss_function(predictions, targets)
            loss.backward()
            optimizer.step()
            cumulative_loss += float(loss.item())
            batch_count += 1
        return cumulative_loss / max(batch_count, 1)

    def _run_validation_epoch(
        self,
        model: BaseModel,
        mode: str,
        data_loader: DataLoader[Any],
        device: torch.device,
        fallback_loss: float,
    ) -> float:
        dataset = cast(Sized, data_loader.dataset)
        if len(dataset) == 0:
            return fallback_loss
        model.eval()
        cumulative_loss = 0.0
        batch_count = 0
        with torch.no_grad():
            for batch in data_loader:
                predictions = self._forward_batch(model, mode, batch, device)
                targets = self._batch_target(batch, device)
                cumulative_loss += float(self.loss_function(predictions, targets).item())
                batch_count += 1
        return cumulative_loss / max(batch_count, 1)

    def _forward_batch(
        self,
        model: BaseModel,
        mode: str,
        batch: dict[str, Any],
        device: torch.device,
    ) -> Tensor:
        inputs = cast(Tensor, batch["inputs"]).to(device=device, dtype=torch.float32)
        if mode == "unified_with_embeddings" or isinstance(model, UnifiedCNNWithEmbeddings):
            stock_index = cast(Tensor, batch["stock_index"]).to(
                device=device,
                dtype=torch.long,
            )
            return model(inputs, stock_index)
        return model(inputs)

    def _batch_target(self, batch: dict[str, Any], device: torch.device) -> Tensor:
        return cast(Tensor, batch["target"]).to(device=device, dtype=torch.float32)

    def _build_loader(
        self,
        dataset: SpectrogramDataset,
        shuffle: bool,
    ) -> DataLoader[Any]:
        batch_size = int(self.config["training"]["batch_size"])
        return DataLoader(dataset, batch_size=batch_size, shuffle=shuffle)

    def _resolve_checkpoint_path(self, mode: str, stock_id: str | None) -> Path:
        if mode == "per_stock":
            if stock_id is None:
                raise ValueError(
                    "TrainLoop requires stock_id when saving a per-stock checkpoint."
                )
            return PER_STOCK_MODEL_DIR / f"{stock_id}_model.pth"
        if mode == "unified":
            return UNIFIED_MODEL_DIR / "unified_model.pth"
        if mode == "unified_with_embeddings":
            return UNIFIED_MODEL_DIR / "unified_with_embeddings_model.pth"
        raise ValueError(f"Unsupported training mode '{mode}'.")
