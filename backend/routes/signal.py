from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Query, Request
from fastapi.responses import Response

from routes.api_models import (
    APIErrorResponse,
    FFTResponse,
    STFTFramesResponse,
    SpectrogramResponse,
)
from routes.utils import raise_structured_http_error
from signal_processing import FFTVisualizer, SpectrogramGenerator
from signal_processing.signal_payloads import (
    FFTSpectrumArtifact,
    SpectrogramArtifact,
    STFTFrameArtifact,
    STFTFramesArtifact,
)

from routes.utils import require_stock

router = APIRouter(tags=["signal"])
CACHE_TTL_SECONDS = 900
SIGNAL_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    404: {"model": APIErrorResponse},
    422: {"model": APIErrorResponse},
    503: {"model": APIErrorResponse},
}


@router.get(
    "/fft/{stock_id}",
    response_model=FFTResponse,
    responses=SIGNAL_ERROR_RESPONSES,
)
def fft(
    stock_id: str,
    request: Request,
    channel: str = Query("price"),
) -> FFTResponse:
    stock = require_stock(request, stock_id)
    fft_artifact = load_fft_artifact(request, stock, channel)
    return serialize_fft_artifact(fft_artifact)


@router.get(
    "/spectrogram/{stock_id}",
    response_model=SpectrogramResponse,
    responses={
        200: {"content": {"image/png": {}}},
        404: {"model": APIErrorResponse},
        422: {"model": APIErrorResponse},
    },
)
def spectrogram(
    stock_id: str,
    request: Request,
    transform: str | None = None,
    channel: str = Query("price"),
    response_format: Literal["png", "json"] = Query("png", alias="format"),
    window_length: int | None = Query(None, ge=2),
    hop_size: int | None = Query(None, ge=1),
    n_fft: int | None = Query(None, ge=2),
    wavelet: str | None = None,
    scales: int | None = Query(None, ge=1),
    max_imfs: int | None = Query(None, ge=1),
    frequency_bins: int | None = Query(None, ge=2),
):
    stock = require_stock(request, stock_id)
    overrides = collect_transform_overrides(
        window_length=window_length,
        hop_size=hop_size,
        n_fft=n_fft,
        wavelet=wavelet,
        scales=scales,
        max_imfs=max_imfs,
        frequency_bins=frequency_bins,
    )
    spectrogram_artifact = load_spectrogram_artifact(
        request,
        stock,
        transform,
        overrides,
        channel,
    )
    if response_format == "json":
        return serialize_spectrogram_artifact(spectrogram_artifact)
    return Response(content=spectrogram_artifact.png_bytes, media_type="image/png")


@router.get(
    "/stft-frames/{stock_id}",
    response_model=STFTFramesResponse,
    responses=SIGNAL_ERROR_RESPONSES,
)
def stft_frames(
    stock_id: str,
    request: Request,
    channel: str = Query("price"),
    window_length: int | None = Query(None, ge=2),
    hop_size: int | None = Query(None, ge=1),
    n_fft: int | None = Query(None, ge=2),
) -> STFTFramesResponse:
    stock = require_stock(request, stock_id)
    overrides = collect_transform_overrides(
        window_length=window_length,
        hop_size=hop_size,
        n_fft=n_fft,
    )
    frames_artifact = load_stft_frames_artifact(request, stock, overrides, channel)
    return serialize_stft_frames_artifact(frames_artifact)


def collect_transform_overrides(
    *,
    window_length: int | None = None,
    hop_size: int | None = None,
    n_fft: int | None = None,
    wavelet: str | None = None,
    scales: int | None = None,
    max_imfs: int | None = None,
    frequency_bins: int | None = None,
) -> dict[str, Any]:
    override_pairs = {
        "window_length": window_length,
        "hop_size": hop_size,
        "n_fft": n_fft,
        "wavelet": wavelet,
        "scales": scales,
        "max_imfs": max_imfs,
        "frequency_bins": frequency_bins,
    }
    return {key: value for key, value in override_pairs.items() if value is not None}


def load_fft_artifact(
    request: Request,
    stock: dict[str, Any],
    channel: str,
) -> FFTSpectrumArtifact:
    visualizer = FFTVisualizer(request.app.state.config, request.app.state.data_cache)
    cache_key = f"signal:fft:{stock['id']}:{channel.lower()}"
    return request.app.state.data_cache.get_or_set(
        cache_key,
        lambda: safely_generate_fft(visualizer, stock, channel),
        CACHE_TTL_SECONDS,
    )


def load_spectrogram_artifact(
    request: Request,
    stock: dict[str, Any],
    transform: str | None,
    overrides: dict[str, Any],
    channel: str,
) -> SpectrogramArtifact:
    generator = SpectrogramGenerator(request.app.state.config, request.app.state.data_cache)
    transform_name = (
        transform or request.app.state.config["signal_processing"]["default_transform"]
    ).lower()
    cache_key = build_cache_key(
        "spectrogram",
        stock["id"],
        transform_name,
        overrides,
        channel,
    )
    return request.app.state.data_cache.get_or_set(
        cache_key,
        lambda: safely_generate_spectrogram(
            generator,
            stock,
            transform_name,
            overrides,
            channel,
        ),
        CACHE_TTL_SECONDS,
    )


def load_stft_frames_artifact(
    request: Request,
    stock: dict[str, Any],
    overrides: dict[str, Any],
    channel: str,
) -> STFTFramesArtifact:
    generator = SpectrogramGenerator(request.app.state.config, request.app.state.data_cache)
    cache_key = build_cache_key("stft-frames", stock["id"], "stft", overrides, channel)
    return request.app.state.data_cache.get_or_set(
        cache_key,
        lambda: safely_generate_stft_frames(generator, stock, overrides, channel),
        CACHE_TTL_SECONDS,
    )


def safely_generate_spectrogram(
    generator: SpectrogramGenerator,
    stock: dict[str, Any],
    transform_name: str,
    overrides: dict[str, Any],
    channel: str,
) -> SpectrogramArtifact:
    try:
        return generator.generate(
            stock,
            transform_name,
            overrides,
            feature_channel=channel,
        )
    except ValueError as exc:
        raise_structured_http_error(
            422,
            "invalid_signal_parameters",
            str(exc),
        )


def safely_generate_fft(
    visualizer: FFTVisualizer,
    stock: dict[str, Any],
    channel: str,
) -> FFTSpectrumArtifact:
    try:
        return visualizer.generate(stock, feature_channel=channel)
    except ValueError as exc:
        raise_structured_http_error(
            422,
            "invalid_signal_parameters",
            str(exc),
        )


def safely_generate_stft_frames(
    generator: SpectrogramGenerator,
    stock: dict[str, Any],
    overrides: dict[str, Any],
    channel: str,
) -> STFTFramesArtifact:
    try:
        return generator.generate_stft_frames(
            stock,
            overrides,
            feature_channel=channel,
        )
    except ValueError as exc:
        raise_structured_http_error(
            422,
            "invalid_signal_parameters",
            str(exc),
        )


def build_cache_key(
    prefix: str,
    stock_id: str,
    transform_name: str,
    overrides: dict[str, Any],
    channel: str,
) -> str:
    serialized_overrides = json.dumps(overrides, sort_keys=True)
    return (
        f"signal:{prefix}:{stock_id}:{transform_name}:{channel.lower()}:"
        f"{serialized_overrides}"
    )


def serialize_fft_artifact(fft_artifact: FFTSpectrumArtifact) -> dict[str, Any]:
    return {
        "stock_id": fft_artifact.stock_id,
        "ticker": fft_artifact.ticker,
        "feature_channel": fft_artifact.feature_channel,
        "frequency": fft_artifact.frequency_axis,
        "amplitude": fft_artifact.amplitude,
        "signal_timestamps": fft_artifact.signal_timestamps,
        "normalized_signal": fft_artifact.normalized_signal,
        "dc_component_removed": fft_artifact.dc_component_removed,
    }


def serialize_spectrogram_artifact(
    spectrogram_artifact: SpectrogramArtifact,
) -> dict[str, Any]:
    return {
        "stock_id": spectrogram_artifact.stock_id,
        "ticker": spectrogram_artifact.ticker,
        "feature_channel": spectrogram_artifact.feature_channel,
        "transform": spectrogram_artifact.transform,
        "signal_timestamps": spectrogram_artifact.signal_timestamps,
        "raw_signal": spectrogram_artifact.raw_signal,
        "normalized_signal": spectrogram_artifact.normalized_signal,
        "frequency_axis": spectrogram_artifact.frequency_axis,
        "time_axis": spectrogram_artifact.time_axis,
        "time_timestamps": spectrogram_artifact.time_timestamps,
        "spectrogram": spectrogram_artifact.spectrogram,
    }


def serialize_stft_frames_artifact(
    frames_artifact: STFTFramesArtifact,
) -> dict[str, Any]:
    return {
        "stock_id": frames_artifact.stock_id,
        "ticker": frames_artifact.ticker,
        "feature_channel": frames_artifact.feature_channel,
        "transform": frames_artifact.transform,
        "frequency_axis": frames_artifact.frequency_axis,
        "frames": [serialize_stft_frame(frame) for frame in frames_artifact.frames],
        "count": len(frames_artifact.frames),
    }


def serialize_stft_frame(frame: STFTFrameArtifact) -> dict[str, Any]:
    return {
        "frame_index": frame.frame_index,
        "frame_timestamp": frame.frame_timestamp,
        "segment_start": frame.segment_start,
        "segment_end": frame.segment_end,
        "segment_timestamps": frame.segment_timestamps,
        "segment": frame.segment,
        "normalized_segment": frame.normalized_segment,
        "fft_column": frame.fft_column,
    }
