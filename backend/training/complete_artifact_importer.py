from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from training.colab_artifact_importer import (
    ColabArtifactImportResult,
    import_colab_artifact_bundle,
)
from training.feature_ablation_importer import (
    FeatureAblationImportResult,
    import_feature_ablation_bundle,
)


@dataclass(slots=True)
class CompleteArtifactImportResult:
    imported_at: str
    training_import: ColabArtifactImportResult
    feature_ablation_import: FeatureAblationImportResult


def import_complete_artifact_bundle(
    bundle_path: Path,
    app_config: dict[str, Any],
) -> CompleteArtifactImportResult:
    training_result = import_colab_artifact_bundle(bundle_path, app_config)
    feature_ablation_result = import_feature_ablation_bundle(bundle_path, app_config)
    return CompleteArtifactImportResult(
        imported_at=training_result.imported_at,
        training_import=training_result,
        feature_ablation_import=feature_ablation_result,
    )
