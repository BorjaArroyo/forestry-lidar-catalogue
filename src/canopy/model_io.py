"""Strict metadata IO and reproducible snapshot provenance."""

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from .paths import repository_root

ROOT = repository_root()
CONTENT = ROOT


def snapshot_timestamp(root=ROOT):
    """Date a snapshot by reproducible provenance, not by wall-clock build time.

    SOURCE_DATE_EPOCH wins when set; otherwise the HEAD commit date of the
    content checkout, so identical inputs and commits regenerate identical
    bytes. Only a checkout without git history falls back to the current time.
    """
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if epoch:
        return datetime.fromtimestamp(int(epoch), tz=timezone.utc).isoformat()
    try:
        head = subprocess.run(
            ["git", "-C", str(root), "log", "-1", "--format=%cI"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if head.returncode == 0 and head.stdout.strip():
            return head.stdout.strip()
    except OSError, subprocess.SubprocessError:
        pass
    return datetime.now(timezone.utc).isoformat()


def read_json(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    return json.loads(Path(path).read_text(), object_pairs_hook=unique)


def _write_json(path, value):
    if not path.exists() or read_json(path) != value:
        path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
