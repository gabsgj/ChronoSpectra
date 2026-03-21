from __future__ import annotations

from io import BytesIO
from typing import Any

import numpy as np
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure

from data.cache.data_cache import DataCache
from signal_processing.price_signal_loader import PriceSignalLoader
from signal_processing.signal_payloads import SpectrogramArtifact, STFTFramesArtifact
from signal_processing.transforms import get_transform
from signal_processing.transforms.stft_transform import STFTTransform


class SpectrogramGenerator:
    def __init__(self, app_config: dict[str, Any], cache: DataCache) -> None:
        self.config = app_config
        self.signal_loader = PriceSignalLoader(app_config, cache)

    def generate(
        self,
        stock_config: dict[str, Any],
        transform_name: str | None = None,
        overrides: dict[str, Any] | None = None,
    ) -> SpectrogramArtifact:
        price_signal = self.signal_loader.load(stock_config)
        resolved_transform = self._resolve_transform_name(transform_name)
        transform = get_transform(resolved_transform, self.config, overrides)
        spectrogram, frequency_axis, time_axis = transform.transform(price_signal.normalized_values)
        time_timestamps = self._map_time_axis_to_timestamps(time_axis, price_signal.timestamps)
        png_bytes = self._render_png(
            spectrogram,
            frequency_axis,
            time_axis,
            stock_config["display_name"],
            resolved_transform,
        )
        return SpectrogramArtifact(
            stock_id=price_signal.stock_id,
            ticker=price_signal.ticker,
            transform=resolved_transform,
            signal_timestamps=price_signal.timestamps,
            raw_signal=price_signal.raw_values.astype(float).tolist(),
            normalized_signal=price_signal.normalized_values.astype(float).tolist(),
            frequency_axis=frequency_axis.astype(float).tolist(),
            time_axis=time_axis.astype(float).tolist(),
            time_timestamps=time_timestamps,
            spectrogram=spectrogram.astype(float).tolist(),
            png_bytes=png_bytes,
        )

    def generate_stft_frames(
        self,
        stock_config: dict[str, Any],
        overrides: dict[str, Any] | None = None,
    ) -> STFTFramesArtifact:
        price_signal = self.signal_loader.load(stock_config)
        transform = get_transform("stft", self.config, overrides)
        if not isinstance(transform, STFTTransform):
            raise ValueError("STFT frames require the STFT transform.")
        frames, frequency_axis = transform.build_frames(
            price_signal.raw_values,
            price_signal.normalized_values,
            price_signal.timestamps,
        )
        return STFTFramesArtifact(
            stock_id=price_signal.stock_id,
            ticker=price_signal.ticker,
            transform="stft",
            frequency_axis=frequency_axis.astype(float).tolist(),
            frames=frames,
        )

    def _resolve_transform_name(self, transform_name: str | None) -> str:
        if transform_name is not None:
            return transform_name.lower()
        return self.config["signal_processing"]["default_transform"].lower()

    def _map_time_axis_to_timestamps(
        self,
        time_axis: np.ndarray,
        timestamps: list[str],
    ) -> list[str]:
        if not timestamps:
            return []
        timestamp_indices = np.rint(time_axis).astype(int)
        clamped_indices = np.clip(timestamp_indices, 0, len(timestamps) - 1)
        return [timestamps[index] for index in clamped_indices]

    def _render_png(
        self,
        spectrogram: np.ndarray,
        frequency_axis: np.ndarray,
        time_axis: np.ndarray,
        display_name: str,
        transform_name: str,
    ) -> bytes:
        figure = Figure(figsize=(8, 4), tight_layout=True)
        canvas = FigureCanvasAgg(figure)
        axis = figure.add_subplot(111)
        display_matrix = np.log1p(spectrogram)
        image = axis.imshow(
            display_matrix,
            aspect="auto",
            origin="lower",
            extent=self._build_extent(time_axis, frequency_axis),
            cmap="viridis",
        )
        axis.set_xlabel("Time (days)")
        axis.set_ylabel("Frequency (cycles/day)")
        axis.set_title(f"{display_name} {transform_name.upper()} Spectrogram")
        figure.colorbar(image, ax=axis, pad=0.02, label="log(1 + energy)")
        png_buffer = BytesIO()
        canvas.print_png(png_buffer)
        return png_buffer.getvalue()

    def _build_extent(
        self,
        time_axis: np.ndarray,
        frequency_axis: np.ndarray,
    ) -> tuple[float, float, float, float]:
        max_time = float(time_axis[-1]) if time_axis.size else 0.0
        max_frequency = float(frequency_axis[-1]) if frequency_axis.size else 0.0
        return (0.0, max_time, 0.0, max_frequency)
