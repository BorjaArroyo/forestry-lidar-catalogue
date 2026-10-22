"""Compatibility entrypoint for dataset plan validation."""

from canopy.dataset_plan import (
    check,
    check_dataset,
    check_manifest,
    check_manifests,
    prepared_bytes,
    resolve,
    resolve_dataset,
    source_plans,
)

__all__ = [
    "check",
    "check_dataset",
    "check_manifest",
    "check_manifests",
    "prepared_bytes",
    "resolve",
    "resolve_dataset",
    "source_plans",
]
