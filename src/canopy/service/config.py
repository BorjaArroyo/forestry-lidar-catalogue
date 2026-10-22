"""Configuration resolved once for each local service or worker process."""

from dataclasses import dataclass, field
import os
from pathlib import Path

from ..paths import repository_root


def state_root() -> Path:
    """Return the explicit state directory or this checkout's temporary area."""
    return Path(os.environ.get("CANOPY_STATE") or repository_root() / "temp")


@dataclass(frozen=True)
class ServiceConfig:
    repo: Path = field(default_factory=repository_root)
    state_root: Path = field(default_factory=state_root)

    @property
    def web(self):
        return self.repo

    @property
    def instance_package(self):
        return self.repo / "scripts" / "for_instance"
