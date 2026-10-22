"""Resolve repository-owned data independently of the current directory."""

import os
from pathlib import Path


def repository_root() -> Path:
    """Return the checkout root containing the reviewed publication manifest."""
    override = os.environ.get("CANOPY_PROJECT_ROOT")
    root = (
        Path(override).expanduser().resolve() if override else Path(__file__).resolve().parents[2]
    )
    if (
        not (root / "publication-manifest.json").is_file()
        and not (root / "data/knowledge-model.json").is_file()
    ):
        raise RuntimeError(
            "Canopy data files were not found. Install in editable mode from the repository "
            "or set CANOPY_PROJECT_ROOT to its root."
        )
    return root


def project_path(*parts: str) -> Path:
    """Resolve a maintained file relative to the repository root."""
    return repository_root().joinpath(*parts)
