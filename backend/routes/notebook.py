from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from training.feature_ablation_notebook_generator import FeatureAblationNotebookGenerator
from training.notebook_generator import NotebookGenerator

router = APIRouter(tags=["notebook"])

NotebookMode = Literal["per_stock", "unified", "unified_with_embeddings", "both"]
FeatureAblationNotebookMode = Literal["per_stock", "unified", "unified_with_embeddings"]


@router.get("/generate")
def generate_notebook(
    request: Request,
    mode: NotebookMode = "per_stock",
) -> FileResponse:
    generator = NotebookGenerator(request.app.state.config)
    output_path = generator.generate(mode)
    return FileResponse(
        path=output_path,
        media_type="application/x-ipynb+json",
        filename=output_path.name,
    )


@router.get("/generate-feature-ablation")
def generate_feature_ablation_notebook(
    request: Request,
    mode: FeatureAblationNotebookMode = "per_stock",
) -> FileResponse:
    generator = FeatureAblationNotebookGenerator(request.app.state.config)
    output_path = generator.generate(mode)
    return FileResponse(
        path=output_path,
        media_type="application/x-ipynb+json",
        filename=output_path.name,
    )
