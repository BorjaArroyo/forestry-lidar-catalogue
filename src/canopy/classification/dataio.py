"""Read compact audit artifacts while preserving their uncompressed evidence hashes."""

import gzip
import json
from pathlib import Path


def artifact_bytes(path):
    path = Path(path)
    if path.is_file():
        return gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_bytes()
    return gzip.decompress(path.with_name(path.name + ".gz").read_bytes())


def read_json(path):
    return json.loads(artifact_bytes(path))
