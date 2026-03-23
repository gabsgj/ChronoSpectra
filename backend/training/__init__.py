from __future__ import annotations

from importlib import import_module

__all__ = [
    "DatasetBuilder",
    "DatasetBundle",
    "EpochMetrics",
    "EvaluationReport",
    "Evaluator",
    "NotebookGenerator",
    "ScalingMetadata",
    "SpectrogramDataset",
    "TrainLoop",
    "TrainingRunResult",
    "TrainingSampleRecord",
]

_MODULE_BY_EXPORT = {
    "DatasetBuilder": "dataset_builder",
    "DatasetBundle": "training_types",
    "EpochMetrics": "training_types",
    "EvaluationReport": "training_types",
    "Evaluator": "evaluator",
    "NotebookGenerator": "notebook_generator",
    "ScalingMetadata": "training_types",
    "SpectrogramDataset": "training_types",
    "TrainLoop": "train_loop",
    "TrainingRunResult": "training_types",
    "TrainingSampleRecord": "training_types",
}


def __getattr__(name: str):
    module_name = _MODULE_BY_EXPORT.get(name)
    if module_name is None:
        raise AttributeError(f"module 'training' has no attribute '{name}'")
    module = import_module(f"training.{module_name}")
    return getattr(module, name)
