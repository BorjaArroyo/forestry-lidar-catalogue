"""Compatibility gates and verified local input copies for existing normalization."""
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "knowledge-hub/normalization-policy.json" if (ROOT / "knowledge-hub").is_dir() else ROOT / "normalization-policy.json"


def source_policy(source_id, fields=None):
    record = json.loads(POLICY.read_text())["sources"].get(str(source_id))
    if record is None:
        raise ValueError("New dataset: analyze and validate its dataset-pipeline-task combination before normalization")
    if record["status"] == "rights_review":
        raise ValueError("Derivative rights review is still required for this source")
    if fields is not None and sorted(fields) not in record["schemas"]:
        raise ValueError("Changed or unknown source schema: review compatibility before normalization")
    return record


def checksum(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(8 * 1024**2):
            h.update(block)
    return h.hexdigest()


@contextmanager
def verified_local_input(root, item):
    root = Path(root).resolve()
    relative = Path(item["path"])
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Source path must be relative and confined to the acquisition root")
    original = root / relative
    if not original.resolve().is_relative_to(root) or original.is_symlink():
        raise ValueError("Source path escapes the acquisition root or is a symlink")
    if original.stat().st_size != item["size_bytes"]:
        raise ValueError("Source size differs from the acquired manifest")
    cache = ROOT / "temp/normalization-inputs"
    cache.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(cache).free < item["size_bytes"] + 64 * 1024**2:
        raise ValueError("Insufficient local space for a verified input snapshot")
    with tempfile.TemporaryDirectory(dir=cache) as folder:
        target = Path(folder) / original.name
        with original.open("rb") as reader, target.open("xb") as writer:
            h, count = hashlib.sha256(), 0
            while block := reader.read(8 * 1024**2):
                writer.write(block)
                h.update(block)
                count += len(block)
        if count != item["size_bytes"] or h.hexdigest() != item["sha256"] or checksum(target) != item["sha256"]:
            raise ValueError("Input integrity failure: normalization blocked; original source unchanged")
        yield target
