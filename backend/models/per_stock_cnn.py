from __future__ import annotations

if __package__ in {None, ""}:
    import sys
    from pathlib import Path

    sys.path.append(str(Path(__file__).resolve().parents[1]))

import torch

from models.base_model import SingleHeadCNN


class PerStockCNN(SingleHeadCNN):
    model_name = "per_stock"

    def __init__(self, in_channels: int = 1) -> None:
        super().__init__(in_channels=in_channels)


def _run_smoke_test() -> None:
    model = PerStockCNN()
    sample_batch = torch.randn(2, 1, 64, 64)
    output = model(sample_batch)
    if output.shape != (2, 1):
        raise ValueError(f"Unexpected output shape for PerStockCNN: {tuple(output.shape)}")
    print(f"PerStockCNN smoke test passed with output shape {tuple(output.shape)}")


if __name__ == "__main__":
    _run_smoke_test()
