"""Offline validation entrypoint for the pinned TLS exact-duplicate index."""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import platform
import stat


def sha(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            value.update(block)
    return value.hexdigest()


def verify_package(package):
    manifest = json.loads((package / "package-lock.json").read_text())
    for name, expected in manifest["files"].items():
        path = PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts or not path.parts or "\\" in name:
            raise ValueError("Invalid package path")
        target = package / path
        if target.is_symlink() or sha(target) != expected:
            raise ValueError(f"Package digest mismatch: {name}")
    return sha(package / "package-lock.json")


def validate(contract, root, output, sample_groups=None):
    root, output = Path(root).resolve(), Path(output).resolve()
    if root == output or root in output.parents or output in root.parents:
        raise ValueError("Use a new output directory outside the input root")
    if output.exists():
        raise ValueError("Output directory already exists")
    if contract["source"]["record_id"] != "16875688" or contract["pipeline_id"] != "tls-exact-duplicate-index-v1":
        raise ValueError("Unsupported source/pipeline contract")
    expected = contract["inputs"]
    paths = [item["path"] for item in expected]
    if len(set(paths)) != len(paths):
        raise ValueError("Repeated input paths")
    if sample_groups is not None and sample_groups < 1:
        raise ValueError("Sample size must be positive")
    declared = defaultdict(list)
    for item in expected:
        path = PurePosixPath(item["path"])
        if not isinstance(item["size_bytes"], int) or isinstance(item["size_bytes"], bool) or item["size_bytes"] < 0:
            raise ValueError("Invalid input size")
        checksum = item["sha256"]
        if not isinstance(checksum, str) or len(checksum) != 64 or any(c not in "0123456789abcdef" for c in checksum):
            raise ValueError("Invalid SHA-256")
        if path.is_absolute() or ".." in path.parts or "\\" in item["path"] or not path.as_posix().startswith("sources/16875688/originals/") or path.suffix != ".ply":
            raise ValueError("Input path outside the pinned source")
        declared[(checksum, item["size_bytes"])].append(item)
    if not declared or any(len(group) < 2 for group in declared.values()):
        raise ValueError("Every declared candidate group needs at least two members")
    groups = sorted(declared.values(), key=lambda rows: (rows[0]["size_bytes"], rows[0]["sha256"]))
    selected = groups if sample_groups is None else groups[:sample_groups]
    checked, index = [], []
    for group in selected:
        members = []
        for item in sorted(group, key=lambda row: row["path"]):
            path = root
            for part in PurePosixPath(item["path"]).parts:
                path = path / part
                if path.is_symlink():
                    raise ValueError("Symlink inputs are not allowed")
            before = path.stat()
            if not stat.S_ISREG(before.st_mode) or before.st_size != item["size_bytes"]:
                raise ValueError("Missing/nonregular input or size mismatch")
            actual = sha(path)
            after = path.stat()
            if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
                raise ValueError("Input changed during hashing")
            if actual != item["sha256"]:
                raise ValueError(f"Input checksum mismatch: {item['path']} expected={item['sha256']} actual={actual}")
            checked.append({"path": item["path"], "sha256": actual, "size_bytes": after.st_size})
            members.append(item["path"])
        index.append({"sha256": group[0]["sha256"], "paths": members, "canonical_path": None,
                      "decision": "pending_human_review"})
    result = {"pipeline_id": contract["pipeline_id"], "created_at": datetime.now(timezone.utc).isoformat(),
              "mode": "validation_only", "python": platform.python_version(), "platform": platform.system(),
              "full_input_validation": len(selected) == len(groups), "declared_files": len(expected),
              "checked_files": checked, "candidate_groups": index, "curation_applied": False,
              "scope": "Current byte hashes only; no geometry, labels, rights or benchmark split certification. No canonical member selected or source changed."}
    output.mkdir(parents=True)
    (output / "validation-report.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sample-groups", type=int)
    parser.add_argument("--stage-to", type=Path, help="Create a new verified local snapshot before full validation")
    args = parser.parse_args()
    package = Path(__file__).resolve().parent
    package_hash = verify_package(package)
    contract_path = package / "pipeline.json"
    contract = json.loads(contract_path.read_text())
    input_root = args.root
    staging_report = None
    if args.stage_to:
        from staging import materialize
        if args.sample_groups is not None:
            parser.error("--stage-to requires full validation without sampling")
        source_root, output_root = args.root.resolve(), args.output.resolve()
        if source_root == output_root or source_root in output_root.parents or output_root in source_root.parents or output_root.exists():
            parser.error("Choose a new output outside the original source root")
        stage_root = args.stage_to.resolve()
        if stage_root == output_root or stage_root in output_root.parents or output_root in stage_root.parents:
            parser.error("Keep staging and final report directories separate")
        staging_report = materialize(contract, args.root, args.stage_to, progress=lambda message: print(message, flush=True))
        input_root = args.stage_to
    result = validate(contract, input_root, args.output, args.sample_groups)
    if staging_report:
        result["staging"] = {"status": staging_report["status"], "verified_files": len(staging_report["files"]),
                             "recorded_read_failures": staging_report["read_failures"], "source_mutated": False}
    result.update(package_lock_sha256=package_hash, contract_sha256=sha(contract_path))
    (args.output / "validation-report.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"Validated {len(result['checked_files'])}/{result['declared_files']} input files; no curation applied")


if __name__ == "__main__":
    main()
