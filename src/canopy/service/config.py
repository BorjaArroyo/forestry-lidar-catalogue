"""Resolve repository paths and the durable local-service state location."""

import os
from pathlib import Path

from ..paths import repository_root


REPO = repository_root()
WEB = REPO
INSTANCE_PACKAGE = REPO / "scripts" / "for_instance"


def state_root() -> Path:
    """Return the explicit state directory or this checkout's temporary area."""
    return Path(os.environ.get("CANOPY_STATE") or REPO / "temp")
