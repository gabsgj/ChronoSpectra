from __future__ import annotations

if __package__ in {None, ""}:
    import sys
    from pathlib import Path

    sys.path.append(str(Path(__file__).resolve().parents[1]))

import torch
from torch import Tensor, nn

from models.base_model import BaseModel

DEFAULT_EMBEDDING_DIM = 8


class UnifiedCNNWithEmbeddings(BaseModel):
    model_name = "unified_with_embeddings"

    def __init__(
        self,
        num_stocks: int,
        embedding_dim: int = DEFAULT_EMBEDDING_DIM,
        in_channels: int = 1,
    ) -> None:
        if num_stocks < 1:
            raise ValueError("UnifiedCNNWithEmbeddings requires at least one stock embedding.")
        super().__init__(in_channels=in_channels)
        self.num_stocks = num_stocks
        self.embedding_dim = embedding_dim
        self.features = self.build_feature_extractor()
        self.stock_embedding = nn.Embedding(num_stocks, embedding_dim)
        self.regressor = self.build_regressor_head(extra_features=embedding_dim)

    def forward(self, inputs: Tensor, stock_ids: Tensor) -> Tensor:
        features = self.extract_features(inputs)
        validated_stock_ids = self._validate_stock_ids(stock_ids, features.shape[0], inputs.device)
        stock_embeddings = self.stock_embedding(validated_stock_ids)
        combined_features = torch.cat((features, stock_embeddings), dim=1)
        return self.regressor(combined_features)

    def _validate_stock_ids(
        self,
        stock_ids: Tensor,
        batch_size: int,
        device: torch.device,
    ) -> Tensor:
        if stock_ids.ndim != 1:
            raise ValueError("Stock IDs must have shape (batch,).")
        if stock_ids.shape[0] != batch_size:
            raise ValueError("Stock IDs must match the batch size.")
        return stock_ids.to(device=device, dtype=torch.long)


def _run_smoke_test() -> None:
    model = UnifiedCNNWithEmbeddings(num_stocks=5)
    sample_batch = torch.randn(4, 1, 64, 64)
    sample_stock_ids = torch.tensor([0, 1, 2, 3], dtype=torch.long)
    output = model(sample_batch, sample_stock_ids)
    if output.shape != (4, 1):
        raise ValueError(
            f"Unexpected output shape for UnifiedCNNWithEmbeddings: {tuple(output.shape)}"
        )
    print(f"UnifiedCNNWithEmbeddings smoke test passed with output shape {tuple(output.shape)}")


if __name__ == "__main__":
    _run_smoke_test()
