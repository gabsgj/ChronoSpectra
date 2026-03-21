from __future__ import annotations

from typing import Any

from signal_processing.base_transform import BaseTransform
from signal_processing.transforms.cwt_transform import CWTTransform
from signal_processing.transforms.hht_transform import HHTTransform
from signal_processing.transforms.stft_transform import STFTTransform

TRANSFORM_REGISTRY: dict[str, type[BaseTransform]] = {
    "stft": STFTTransform,
    "cwt": CWTTransform,
    "hht": HHTTransform,
}


def get_transform(
    name: str,
    app_config: dict[str, Any],
    overrides: dict[str, Any] | None = None,
) -> BaseTransform:
    transform_name = name.lower()
    transform_class = TRANSFORM_REGISTRY.get(transform_name)
    if transform_class is None:
        available = ", ".join(sorted(TRANSFORM_REGISTRY))
        raise ValueError(f"Unknown transform '{name}'. Available transforms: {available}.")
    return transform_class(app_config, overrides)


__all__ = [
    "TRANSFORM_REGISTRY",
    "BaseTransform",
    "CWTTransform",
    "HHTTransform",
    "STFTTransform",
    "get_transform",
]
