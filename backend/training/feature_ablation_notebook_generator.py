from __future__ import annotations

import ast
import json
from pathlib import Path
from typing import Any, Literal

from jinja2 import Environment, FileSystemLoader

from training.feature_ablation_notebook_cells import build_feature_ablation_notebook_cells

FeatureAblationNotebookMode = Literal[
    "per_stock",
    "unified",
    "unified_with_embeddings",
]

SUPPORTED_FEATURE_ABLATION_NOTEBOOK_MODES = {
    "per_stock",
    "unified",
    "unified_with_embeddings",
}


class FeatureAblationNotebookGenerator:
    def __init__(
        self,
        app_config: dict[str, Any],
        template_dir: Path | None = None,
        output_dir: Path | None = None,
    ) -> None:
        base_dir = Path(__file__).resolve().parents[1]
        self.config = app_config
        self.template_dir = template_dir or base_dir / "notebooks" / "templates"
        self.output_dir = output_dir or base_dir / "notebooks" / "feature_ablation" / "generated"
        self.environment = Environment(
            loader=FileSystemLoader(self.template_dir),
            autoescape=False,
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def render(self, mode: str) -> str:
        resolved_mode = self._validate_mode(mode)
        template = self.environment.get_template("unified_template.ipynb.j2")
        rendered_notebook = template.render(
            cells=build_feature_ablation_notebook_cells(self.config, resolved_mode),
            metadata={
                "kernelspec": {
                    "display_name": "Python 3",
                    "language": "python",
                    "name": "python3",
                },
                "language_info": {
                    "name": "python",
                    "version": "3.12",
                },
            },
        )
        self._validate_rendered_notebook(rendered_notebook)
        return rendered_notebook

    def generate(self, mode: str) -> Path:
        resolved_mode = self._validate_mode(mode)
        rendered_notebook = self.render(resolved_mode)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        output_path = self.output_dir / f"chronospectra_{resolved_mode}_feature_ablation.ipynb"
        output_path.write_text(rendered_notebook, encoding="utf-8")
        return output_path

    def _validate_mode(self, mode: str) -> str:
        resolved_mode = mode.lower()
        if resolved_mode not in SUPPORTED_FEATURE_ABLATION_NOTEBOOK_MODES:
            supported_modes = ", ".join(sorted(SUPPORTED_FEATURE_ABLATION_NOTEBOOK_MODES))
            raise ValueError(
                f"Unsupported feature ablation notebook mode '{mode}'. Expected: {supported_modes}."
            )
        return resolved_mode

    def _validate_rendered_notebook(self, rendered_notebook: str) -> None:
        if "{{" in rendered_notebook or "{%" in rendered_notebook:
            raise ValueError("Rendered notebook still contains unresolved Jinja2 markers.")
        notebook_payload = json.loads(rendered_notebook)
        self._validate_code_cells(notebook_payload.get("cells", []))

    def _validate_code_cells(self, cells: list[dict[str, Any]]) -> None:
        for cell in cells:
            if cell.get("cell_type") != "code":
                continue
            source = str(cell.get("source", ""))
            if source.lstrip().startswith("!"):
                continue
            ast.parse(source)
