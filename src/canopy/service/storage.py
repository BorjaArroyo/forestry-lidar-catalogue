"""Small atomic storage and path-validation operations for service jobs."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from ..paths import repository_root


def now():
    return datetime.now(timezone.utc).isoformat()


class StateError(RuntimeError):
    """Persisted service data is unreadable or corrupt."""


class RequestError(ValueError):
    """The caller supplied an unsupported or invalid request."""


def read(path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError) as error:
        raise StateError(f"Cannot read service state {path}: {error}") from error


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".write-tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        while block := stream.read(8 * 1024**2):
            digest.update(block)
    return digest.hexdigest()


def directory(value, exists=True, *, repo=None):
    repository = Path(repo) if repo is not None else repository_root()
    path = Path(value).expanduser()
    if not path.is_absolute() or "," in str(path) or "\n" in str(path):
        raise RequestError("Choose an absolute directory without commas or newlines")
    path = path.resolve()
    if exists and not path.is_dir():
        raise RequestError("Directory does not exist")
    if path == Path("/") or path == Path.home() or path == repository or path in repository.parents:
        raise RequestError("Choose a dedicated data directory")
    return path
