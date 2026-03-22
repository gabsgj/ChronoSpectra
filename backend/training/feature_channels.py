from __future__ import annotations

from typing import Any

DEFAULT_FEATURE_CHANNELS = ["price"]
SUPPORTED_FEATURE_CHANNELS = ["price", "index", "usd_inr", "revenue", "profit"]


def resolve_feature_channels(app_config: dict[str, Any]) -> list[str]:
    training_config = app_config.get("training", {})
    configured_channels = training_config.get("feature_channels", DEFAULT_FEATURE_CHANNELS)
    if not isinstance(configured_channels, list):
        return list(DEFAULT_FEATURE_CHANNELS)

    resolved_channels: list[str] = []
    for channel in configured_channels:
        if not isinstance(channel, str):
            continue
        normalized_channel = channel.strip().lower()
        if normalized_channel not in SUPPORTED_FEATURE_CHANNELS:
            continue
        if normalized_channel in resolved_channels:
            continue
        resolved_channels.append(normalized_channel)

    if not resolved_channels:
        return list(DEFAULT_FEATURE_CHANNELS)
    return resolved_channels
