"""Build a non-destructive curation plan from acquisition evidence."""
import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat

HASH = re.compile(r"[0-9a-f]{64}")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def relative_path(root, value, checked=None):
    if not isinstance(value, str) or not value or "\\" in value:
        raise ValueError("Invalid manifest path")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("Manifest path escapes dataset directory")
    # Reject existing symlinks without resolving every ordinary path over a NAS.
    current = root
    for part in path.parts:
        current = current / part
        if checked is not None and current in checked:
            continue
        if current.is_symlink():
            raise ValueError("Symlinks in acquisition paths require separate review")
        if checked is not None:
            checked.add(current)
    return path.as_posix()


def split_hints(paths):
    aliases = {"train": "train", "training": "train", "val": "validation", "validation": "validation", "test": "test", "testing": "test"}
    return sorted({aliases[part.lower()] for path in paths for part in PurePosixPath(path).parts if part.lower() in aliases})


def build_plan(root, check_files=False, progress=None):
    root = Path(root).resolve()
    errors, outputs, evidence, ignored = [], {}, [], 0
    manifests = sorted((root / "sources").glob("*/manifests/*.json"))
    for manifest in manifests:
        if manifest.name.startswith("._"):
            ignored += 1
            continue
        raw = manifest.read_bytes()
        data = json.loads(raw)
        evidence.append({"path": str(manifest.relative_to(root)), "sha256": hashlib.sha256(raw).hexdigest()})
        for item in data.get("outputs", []):
            # Lexical validation is cheap; filesystem checks are explicitly optional.
            value = item["path"]
            if not isinstance(value, str):
                raise ValueError("Invalid manifest path")
            path = PurePosixPath(value)
            if not value or path.is_absolute() or ".." in path.parts or "\\" in value:
                raise ValueError("Manifest path escapes dataset directory")
            name = path.as_posix()
            size, checksum = item["size_bytes"], item["sha256"]
            if not isinstance(size, int) or isinstance(size, bool) or size < 0 or not HASH.fullmatch(checksum):
                raise ValueError("Invalid file size or SHA-256 in manifest")
            row = {"path": name, "size_bytes": size, "sha256": checksum}
            if name in outputs and outputs[name] != row:
                errors.append({"path": name, "error": "Conflicting manifest records"})
            outputs[name] = row
    if not outputs:
        raise ValueError("No acquired file manifests found")
    checked = 0
    if check_files:
        checked_parents = set()
        for parent_path in sorted({str(PurePosixPath(name).parent) for name in outputs}):
            relative_path(root, parent_path, checked_parents)

        def check_source(item):
            name = item["path"]
            try:
                info = (root / name).lstat()
                if stat.S_ISLNK(info.st_mode):
                    raise ValueError("Symlinks in acquisition paths require separate review")
                if not stat.S_ISREG(info.st_mode) or info.st_size != item["size_bytes"]:
                    return {"path": name, "error": "Missing file or size mismatch"}
            except OSError as error:
                return {"path": name, "error": f"{type(error).__name__} (errno {error.errno})"}
            return None

        # Bounded metadata I/O only; point-cloud processing is outside this plan.
        with ThreadPoolExecutor(max_workers=8) as pool:
            for error in pool.map(check_source, outputs.values()):
                if error:
                    errors.append(error)
                checked += 1
                if progress and checked % 250 == 0:
                    progress(f"Checked {checked}/{len(outputs)} source file sizes")
    source_groups = defaultdict(list)
    for item in outputs.values():
        source_groups[(item["sha256"], item["size_bytes"])].append(item["path"])
    source_duplicates = [{"sha256": key[0], "size_bytes": key[1], "paths": sorted(paths),
                          "kind": "point_cloud" if all(PurePosixPath(path).suffix.lower() in {".ply", ".las", ".laz", ".npz", ".pcd", ".xyz", ".pts"} for path in paths) else "support_files"}
                         for key, paths in sorted(source_groups.items()) if len(paths) > 1]
    status_path = root / "acquisition-status.json"
    status = {}
    if status_path.is_file():
        raw = status_path.read_bytes()
        status = json.loads(raw)
        evidence.append({"path": "acquisition-status.json", "sha256": hashlib.sha256(raw).hexdigest()})
    scenes = [row for row in status.get("harmonized", []) if row.get("status") == "verified"]
    normalized = defaultdict(list)
    unmapped_sites, unassigned_splits, unknown_crs = [], [], []
    schemas = defaultdict(lambda: {"clouds": 0, "points": 0})
    for scene in scenes:
        name = scene["input"]
        profile = schemas[(str(scene.get("record_id", "unknown")), tuple(scene.get("source_fields", [])))]
        profile["clouds"] += 1
        profile["points"] += scene["point_count"]
        if name not in outputs or outputs[name]["sha256"] != scene.get("input_sha256"):
            errors.append({"path": name, "error": "Normalized input is absent or its source hash differs from the manifest"})
        chunks = scene.get("chunks", [])
        offset, signature = 0, []
        valid = bool(chunks)
        for chunk in chunks:
            count = chunk.get("point_count")
            checksum = chunk.get("sha256", "")
            if not isinstance(count, int) or isinstance(count, bool) or count < 0 or not HASH.fullmatch(checksum) or chunk.get("point_offset") != offset:
                valid = False
                break
            offset += count
            signature.append((checksum, count))
        if not valid or offset != scene.get("point_count"):
            errors.append({"path": name, "error": "Invalid normalized chunk sequence or point counts"})
        else:
            normalized[tuple(signature)].append(scene)
        if scene.get("physical_site") in {None, "", "pending_review"}:
            unmapped_sites.append(name)
        if scene.get("split") in {None, "", "unassigned"}:
            unassigned_splits.append(name)
        if scene.get("source_crs") in {None, "", "None", "unknown"}:
            unknown_crs.append(name)
    normalized_duplicates = []
    for signature, rows in sorted(normalized.items()):
        if len(rows) < 2:
            continue
        metadata_keys = ("schema_version", "semantic_classes", "instance_unknown", "instance_background", "units", "source_crs", "source_fields", "coordinate_transform")
        conflict = len({digest({key: row.get(key) for key in metadata_keys}) for row in rows}) > 1
        normalized_duplicates.append({"id": digest(signature), "paths": sorted({row["input"] for row in rows}),
                                      "scene_ids": sorted(row["scene_id"] for row in rows),
                                      "path_split_hints": split_hints(row["input"] for row in rows),
                                      "points_per_copy": rows[0]["point_count"], "metadata_conflict": conflict,
                                      "action": "Review metadata conflict" if conflict else "Review shared identity before assigning splits"})
    # Transitive identity groups prevent source and derivative copies crossing splits.
    parent = {}
    def find(value):
        parent.setdefault(value, value)
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value
    for group in [*(group for group in source_duplicates if group["kind"] == "point_cloud"), *normalized_duplicates]:
        paths = group["paths"]
        for name in paths[1:]:
            parent[find(name)] = find(paths[0])
    components = defaultdict(list)
    for name in sorted(parent):
        components[find(name)].append(name)
    identity_groups = [{"id": digest(paths), "paths": paths, "path_split_hints": split_hints(paths), "decision": "pending_review", "canonical_path": None}
                       for paths in sorted(components.values()) if len(paths) > 1]
    blockers = [
        {"id": "split_overlap", "count": sum(len(group["path_split_hints"]) > 1 for group in identity_groups), "action": "Review identical-cloud groups spanning split-named folders. Folder names are hints, not a certified benchmark protocol."},
        {"id": "identity", "count": len(identity_groups), "action": "Review connected source/derivative identities; keep each accepted identity in one split. Do not choose a canonical copy automatically."},
        {"id": "site", "count": len(unmapped_sites), "action": "Resolve physical sites/captures before certifying site-out evaluation."},
        {"id": "split", "count": len(unassigned_splits), "action": "Define a task-specific split protocol after identity and site review."},
        {"id": "crs", "count": len(unknown_crs), "action": "Verify units, CRS and height reference before spatial alignment; never infer them from bounds alone."},
        {"id": "rights", "count": sum(row.get("status") == "pending_derivative_rights_review" for row in status.get("harmonized", [])), "action": "Keep deferred derivatives blocked until intended-use rights are reviewed."},
    ]
    return {"schema_version": "1.0", "created_at": datetime.now(timezone.utc).isoformat(),
            "curation_applied": False, "files": len(outputs), "errors": errors,
            "duplicate_groups": source_duplicates, "normalized_duplicate_groups": normalized_duplicates,
            "identity_groups": identity_groups, "review_actions": blockers,
            "schema_profiles": [{"record_id": key[0], "source_fields": list(key[1]), **value} for key, value in sorted(schemas.items())],
            "evidence": evidence, "snapshot_sha256": digest(evidence),
            "scope": {"source_size_checks": checked, "payloads_rehashed": False, "normalized_chunks_rehashed": False,
                      "normalized_records": len(scenes), "status_available": bool(status), "ignored_appledouble_manifests": ignored,
                      "limits": "Hashes are recorded evidence, not current payload verification. No near-duplicate geometry, annotation correctness, full license review or automatic deletion. This report does not authorize execution."}}


def render_markdown(report):
    scope = report["scope"]
    lines = ["# Curation review plan", "", "Status: pending human review. No curation applied.", "",
             f"Manifest files: {report['files']:,}; current source size checks: {scope['source_size_checks']:,}.",
             f"Source duplicate groups (including support files): {len(report['duplicate_groups']):,}; normalized duplicate groups: {len(report['normalized_duplicate_groups']):,}.",
             f"Connected identity groups: {len(report['identity_groups']):,}; evidence consistency/file errors: {len(report['errors']):,}.", "",
             "## Review actions", ""]
    lines.extend(f"- {item['id']} ({item['count']:,}): {item['action']}" for item in report["review_actions"])
    lines.extend(["", "## Scope", "", scope["limits"], "",
                  "All proposed canonical paths remain unset. Consult the JSON for member paths, manifest fingerprints and evidence conflicts.", ""])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--check-files", action="store_true", help="Check source presence and sizes without rehashing payloads")
    args = parser.parse_args()
    output = args.output.resolve()
    root = args.root.resolve()
    if output == root or root in output.parents:
        parser.error("Keep audit output outside the acquisition root")
    if output.exists():
        parser.error("Choose a new report directory")
    report = build_plan(root, args.check_files, lambda message: print(message, flush=True))
    output.mkdir(parents=True)
    (output / "curation-report.json").write_text(json.dumps(report, indent=2) + "\n")
    (output / "curation-plan.md").write_text(render_markdown(report))
    print(json.dumps({"files": report["files"], "errors": len(report["errors"]), "source_groups": len(report["duplicate_groups"]), "normalized_groups": len(report["normalized_duplicate_groups"])}))
    raise SystemExit(bool(report["errors"]))


if __name__ == "__main__":
    main()
