"""Materialize pinned inputs into a new local snapshot without changing originals."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat


def stream_copy(source, destination):
    checksum, count = hashlib.sha256(), 0
    with source.open("rb") as reader, destination.open("xb") as writer:
        while block := reader.read(8 * 1024 * 1024):
            writer.write(block)
            checksum.update(block)
            count += len(block)
        writer.flush()
        os.fsync(writer.fileno())
    return checksum.hexdigest(), count


def disk_hash(path):
    checksum = hashlib.sha256()
    with path.open("rb") as reader:
        while block := reader.read(8 * 1024 * 1024):
            checksum.update(block)
    return checksum.hexdigest()


def materialize(contract, root, destination, attempts=3, copier=stream_copy, progress=None):
    root, destination = Path(root).resolve(), Path(destination).resolve()
    if destination.exists() or root == destination or root in destination.parents or destination in root.parents:
        raise ValueError("Choose a new staging directory outside the input root")
    if not 1 <= attempts <= 3:
        raise ValueError("Staging supports one to three bounded attempts")
    inputs = contract["inputs"]
    names = [item["path"] for item in inputs]
    if len(names) != len(set(names)) or not names:
        raise ValueError("Empty or repeated inputs")
    for item in inputs:
        path = PurePosixPath(item["path"])
        if path.is_absolute() or ".." in path.parts or "\\" in item["path"] or not path.as_posix().startswith("sources/16875688/originals/"):
            raise ValueError("Invalid pinned source path")
        if not isinstance(item["size_bytes"], int) or isinstance(item["size_bytes"], bool) or item["size_bytes"] < 0:
            raise ValueError("Invalid source size")
        checksum = item["sha256"]
        if not isinstance(checksum, str) or len(checksum) != 64 or any(c not in "0123456789abcdef" for c in checksum):
            raise ValueError("Invalid source hash")
    existing = destination.parent
    while not existing.exists():
        existing = existing.parent
    if shutil.disk_usage(existing).free < sum(item["size_bytes"] for item in inputs) + 64 * 1024**2:
        raise ValueError("Insufficient staging space")
    destination.mkdir(parents=True)
    report = {"status": "running", "source_mutated": False, "files": [], "read_failures": []}
    report_path = destination / "staging-report.json"
    def save():
        pending = report_path.with_suffix(".tmp")
        pending.write_text(json.dumps(report, indent=2) + "\n")
        pending.replace(report_path)
    try:
        for index, item in enumerate(inputs):
            source = root
            for part in PurePosixPath(item["path"]).parts:
                source = source / part
                if source.is_symlink():
                    raise ValueError("Symlink inputs are not allowed")
            before = source.stat()
            if not stat.S_ISREG(before.st_mode) or before.st_size != item["size_bytes"]:
                raise ValueError("Source missing, nonregular or wrong size")
            target = destination / item["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            pending = target.with_suffix(target.suffix + ".partial")
            for attempt in range(1, attempts + 1):
                try:
                    actual, count = copier(source, pending)
                    after = source.stat()
                    if (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
                        raise ValueError("Source metadata changed during copy")
                    if count != item["size_bytes"] or actual != item["sha256"]:
                        raise ValueError(f"Source read mismatch: bytes={count}, sha256={actual}")
                    if pending.stat().st_size != count or disk_hash(pending) != item["sha256"]:
                        raise ValueError("Local snapshot read-back mismatch")
                    pending.replace(target)
                    report["files"].append({**item, "attempts": attempt, "local_readback_verified": True})
                    break
                except (OSError, ValueError) as error:
                    report["read_failures"].append({"path": item["path"], "attempt": attempt, "error": str(error)})
                    pending.unlink(missing_ok=True)
                    save()
                    if attempt == attempts:
                        raise ValueError(f"No verified snapshot for {item['path']}") from error
            if progress and (index + 1) % 25 == 0:
                progress(f"Staged {index + 1}/{len(inputs)} verified files")
        report["status"] = "verified"
        save()
        return report
    except Exception:
        report["status"] = "failed"
        save()
        raise
