"""Compatibility entrypoint for the curated knowledge model tools."""

from canopy.knowledge_model import (
    CONTENT,
    ROOT,
    check_views,
    export_views,
    load,
    main,
    model_hashes,
    project,
    read_json,
    snapshot_timestamp,
    source_task_context,
    validate,
    validate_input_requirements,
    validate_task_requirements,
)

__all__ = [
    "CONTENT",
    "ROOT",
    "check_views",
    "export_views",
    "load",
    "main",
    "model_hashes",
    "project",
    "read_json",
    "snapshot_timestamp",
    "source_task_context",
    "validate",
    "validate_input_requirements",
    "validate_task_requirements",
]

if __name__ == "__main__":
    main()
