"""Acquire pinned assets, verify extracted files, then remove staged archives."""

import argparse
import hashlib
import json
import shutil
import stat
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from filelock import FileLock

_zip_compressor = zipfile._get_compressor
import zipfile_inflate64  # noqa: E402,F401

# The extension's legacy writer hook is incompatible with Python 3.11 and NPZ.
# Keep its Deflate64 reader hook while preserving the standard ZIP writer.
zipfile._get_compressor = _zip_compressor


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(path):
    hashes = {name: hashlib.new(name) for name in ("md5", "sha256")}
    with path.open("rb") as stream:
        while block := stream.read(8 * 1024 * 1024):
            for value in hashes.values():
                value.update(block)
    return {name: value.hexdigest() for name, value in hashes.items()}


def stream_archive_member(archive, member, output):
    value = hashlib.sha256()
    size = 0
    # The reader supports Deflate64 and validates the ZIP member CRC at EOF.
    with archive.open(member) as stream:
        while block := stream.read(8 * 1024 * 1024):
            output.write(block)
            value.update(block)
            size += len(block)
    if size != member.file_size:
        raise ValueError(f"Archive member size mismatch: {member.filename}")
    return value.hexdigest()


def archive_member_sha256(archive, member):
    return stream_archive_member(archive, member, _NullWriter())


class _NullWriter:
    def write(self, block):
        return len(block)


def save_archive_checkpoint(path, outputs, platform_metadata):
    temp = path.with_suffix(path.suffix + ".tmp")
    save_json(temp, {"outputs": outputs, "platform_metadata": platform_metadata})
    temp.replace(path)


def safe_name(name):
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or "\\" in name:
        raise ValueError(f"Unsafe archive or asset path: {name}")
    return path


def is_platform_metadata(name):
    path = PurePosixPath(name)
    return "__MACOSX" in path.parts and path.name.startswith("._")


def save_json(path, value):
    text = json.dumps(value, indent=2) + "\n"
    temporary = path.with_name(path.name + ".write-tmp")
    # Commit a complete record; a failed write must preserve the previous one.
    for attempt in range(5):
        try:
            # Avoid a redundant WebDAV directory stat for every state update.
            try:
                temporary.write_text(text, encoding="utf-8")
            except FileNotFoundError:
                path.parent.mkdir(parents=True, exist_ok=True)
                temporary.write_text(text, encoding="utf-8")
            temporary.replace(path)
            return
        except OSError as error:
            if error.errno not in {60, 110} or attempt == 4:
                raise
            time.sleep(5 * (attempt + 1))


def open_asset(record, asset, headers):
    urls = [f"https://zenodo.org/records/{record['record_id']}/files/"
            f"{quote(asset['name'], safe='')}?download=1",
            asset["download_url"]]
    for index, url in enumerate(dict.fromkeys(urls)):
        try:
            return urlopen(Request(url, headers=headers), timeout=60), url
        except HTTPError as error:
            if index == 1 or error.code not in {502, 503, 504}:
                raise
            print(f"Provider HTTP {error.code}; trying API file URL", flush=True)
    raise RuntimeError("No download URL available")


def acquire(record, asset, root, stage):
    safe_name(asset["name"])
    if len(PurePosixPath(asset["name"]).parts) != 1:
        raise ValueError("Asset name must be a basename")
    source = root / "sources" / str(record["record_id"])
    marker = source / "manifests" / (asset["name"] + ".json")
    if marker.exists():
        previous = json.loads(marker.read_text())
        expected_kind = "archive" if asset["name"].lower().endswith(".zip") else "file"
        if previous.get("status") == "verified" and previous.get("stored_kind") == expected_kind:
            # Avoid deleting/replacing anything when a completed asset changed.
            if previous["provider_checksum"] != asset["provider_checksum"]:
                raise ValueError("Completed asset checksum differs from inventory")
            platform = [item for item in previous["outputs"] if is_platform_metadata(item["path"])]
            if platform:
                previous.setdefault("platform_metadata", []).extend(platform)
                previous["outputs"] = [item for item in previous["outputs"]
                                       if not is_platform_metadata(item["path"])]
                save_json(marker, previous)
            for item in previous["outputs"]:
                path = root / item["path"]
                if not path.exists() or path.stat().st_size != item["size_bytes"]:
                    raise ValueError(f"Completed output missing or changed: {path}")
            return previous
    stage.mkdir(parents=True, exist_ok=True)
    local = stage / (str(record["record_id"]) + "_" + asset["name"])
    size = asset["size_bytes"]
    if not local.exists() or local.stat().st_size != size:
        offset = local.stat().st_size if local.exists() else 0
        headers = {"User-Agent": "lidar-acquisition/0.1", "Accept-Encoding": "identity"}
        if offset:
            headers["Range"] = f"bytes={offset}-"
        response, fetched_url = open_asset(record, asset, headers)
        with response:
            if offset and response.status != 206:
                offset = 0
            if offset and not response.headers.get("Content-Range", "").startswith(
                f"bytes {offset}-"
            ):
                raise ValueError("Unexpected range response")
            if shutil.disk_usage(stage).free < size - offset + 5 * 1024**3:
                raise OSError("Insufficient local staging space including 5 GiB reserve")
            with local.open("ab" if offset else "wb") as stream:
                while block := response.read(8 * 1024 * 1024):
                    stream.write(block)
        if local.stat().st_size != size:
            raise ValueError("Downloaded size does not match published size")
    else:
        fetched_url = "verified_local_staging"
    hashes = digest(local)
    algorithm, expected = asset["provider_checksum"].split(":", 1)
    if algorithm not in hashes or hashes[algorithm] != expected:
        raise ValueError("Downloaded provider checksum mismatch; staged file retained")
    outputs = []
    platform_metadata = []
    raw = source / "originals"
    raw.mkdir(parents=True, exist_ok=True)
    is_archive = asset["name"].lower().endswith(".zip")
    if is_archive:
        if not zipfile.is_zipfile(local):
            raise ValueError("Published ZIP asset is not a readable ZIP archive")
        target = raw / asset["name"].removesuffix(".zip")
        checkpoint_path = stage / f"{record['record_id']}_{asset['name']}.resume.json"
        try:
            checkpoint = json.loads(checkpoint_path.read_text()) if checkpoint_path.exists() else {}
        except json.JSONDecodeError:
            checkpoint = {}
        output_map = checkpoint.get("outputs", {})
        metadata_map = checkpoint.get("platform_metadata", {})
        with zipfile.ZipFile(local) as archive:
            members = archive.infolist()
            paths = [str(safe_name(member.filename)) for member in members]
            if len(paths) != len(set(paths)):
                raise ValueError("Duplicate archive paths")
            payload_members = [member for member in members if not member.is_dir()]
            processed = 0
            for member in members:
                if stat.S_ISLNK(member.external_attr >> 16):
                    raise ValueError("Archive symlinks are unsupported")
                dest = target / safe_name(member.filename)
                if member.is_dir():
                    dest.mkdir(parents=True, exist_ok=True)
                    continue
                if is_platform_metadata(member.filename):
                    # macOS/WebDAV can consume AppleDouble files as filesystem metadata.
                    item = metadata_map.get(member.filename)
                    if item is None:
                        item = {"archive_member": member.filename,
                                "sha256": archive_member_sha256(archive, member),
                                "size_bytes": member.file_size,
                                "stored": False,
                                "reason": "AppleDouble platform metadata"}
                        metadata_map[member.filename] = item
                else:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    expected_sha = None
                    prior = output_map.get(member.filename)
                    if prior and dest.exists() and dest.stat().st_size == member.file_size:
                        if digest(dest)["sha256"] == prior["sha256"]:
                            expected_sha = prior["sha256"]
                    if expected_sha is None:
                        expected_sha = archive_member_sha256(archive, member)
                        current_sha = (digest(dest)["sha256"]
                                       if dest.exists() and dest.stat().st_size == member.file_size
                                       else None)
                        if current_sha != expected_sha:
                            verified = False
                            for attempt in range(3):
                                with dest.open("wb") as out:
                                    written_digest = stream_archive_member(archive, member, out)
                                # The ZIP reader validates each member when its stream ends.
                                if written_digest == expected_sha and dest.stat().st_size == member.file_size:
                                    for read_attempt in range(3):
                                        if digest(dest)["sha256"] == expected_sha:
                                            verified = True
                                            break
                                        time.sleep(2 * (read_attempt + 1))
                                    if verified:
                                        break
                                time.sleep(2 * (attempt + 1))
                            if not verified:
                                raise ValueError(f"Extracted file verification failed: {dest}")
                    item = {"path": str(dest.relative_to(root)),
                            "size_bytes": member.file_size,
                            "sha256": expected_sha}
                    output_map[member.filename] = item
                    outputs.append(item)
                save_archive_checkpoint(checkpoint_path, output_map, metadata_map)
                processed += 1
                if processed % 50 == 0 or processed == len(payload_members):
                    print(f"EXTRACTION {record['record_id']} {asset['name']} "
                          f"{processed}/{len(payload_members)}", flush=True)
        outputs = list(output_map.values())
        platform_metadata = list(metadata_map.values())
    else:
        dest = raw / asset["name"]
        if dest.is_dir():
            # Preserve the earlier pilot's incorrectly expanded Office container.
            diagnostic = source / "pilot-diagnostics" / asset["name"]
            diagnostic.parent.mkdir(parents=True, exist_ok=True)
            if diagnostic.exists():
                raise ValueError("Pilot diagnostic destination already exists")
            dest.rename(diagnostic)
        shutil.copyfile(local, dest)
        if digest(dest)["sha256"] != hashes["sha256"]:
            raise ValueError("Stored file checksum mismatch")
        outputs.append({"path": str(dest.relative_to(root)), "size_bytes": size,
                        "sha256": hashes["sha256"]})
    result = {"record_id": record["record_id"], "asset": asset["name"],
              "url": asset["download_url"], "provider_checksum": asset["provider_checksum"],
              "fetched_url": fetched_url,
              "download_sha256": hashes["sha256"], "status": "verified",
              "verified_at": now(), "outputs": outputs,
              "platform_metadata": platform_metadata,
              "stored_kind": "archive" if is_archive else "file",
              "staging_cleanup": "authorized_after_verified_storage"}
    save_json(marker, result)
    # Only the task-owned staged asset is removed, after durable evidence exists.
    local.unlink()
    if is_archive:
        checkpoint_path.unlink(missing_ok=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--stage", type=Path, required=True)
    parser.add_argument("--max-asset-bytes", type=int)
    parser.add_argument("--harmonize", action="store_true")
    parser.add_argument("--resume", action="store_true",
                        help="Continue from the current status without replaying completed assets")
    args = parser.parse_args()
    with FileLock(str(args.stage.parent / "lidar-acquisition.lock"), timeout=0):
        run(args)


def run(args):
    if args.harmonize:
        raise ValueError("Automatic normalization is blocked until a dataset-specific self-contained pipeline is analyzed and audited")
    inventory = json.loads(args.inventory.read_text())
    args.root.mkdir(parents=True, exist_ok=True)
    status_path = args.root / "acquisition-status.json"
    previous = json.loads(status_path.read_text()) if status_path.exists() else None
    if status_path.exists():
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        save_json(args.root / "history" / f"acquisition-{stamp}.json",
                  previous)
    save_json(args.root / "inventory.json", inventory)
    queue = [(record, asset) for record in inventory["records"] for asset in record["files"]
             if args.max_asset_bytes is None or asset["size_bytes"] <= args.max_asset_bytes]
    queue.sort(key=lambda pair: pair[1]["size_bytes"])
    requested_assets = len(queue)
    completed = []
    harmonized = []
    conversion_errors = []
    if args.resume and previous:
        available = {(record["record_id"], asset["name"]) for record, asset in queue}
        completed = [item for item in previous.get("completed", [])
                     if (item["record_id"], item["asset"]) in available]
        completed_keys = {(item["record_id"], item["asset"]) for item in completed}
        queue = [(record, asset) for record, asset in queue
                 if (record["record_id"], asset["name"]) not in completed_keys]
        harmonized = previous.get("harmonized", [])
        conversion_errors = previous.get("conversion_errors", [])
    normalize = None
    if args.harmonize:
        from harmonize_lidar import harmonize
        normalize = harmonize
    summary = {"started_at": previous.get("started_at", now()) if args.resume and previous else now(),
               "updated_at": now(), "requested_assets": requested_assets,
               "completed": completed, "errors": [], "harmonized": harmonized,
               "conversion_errors": conversion_errors}
    for record, asset in queue:
        print(f"START {record['record_id']} {asset['name']} {asset['size_bytes']} bytes", flush=True)
        for attempt in range(3):
            try:
                result = acquire(record, asset, args.root, args.stage)
                summary["completed"].append({"record_id": record["record_id"],
                                              "asset": asset["name"]})
                print(f"VERIFIED {record['record_id']} {asset['name']} {len(result['outputs'])} files", flush=True)
                if normalize:
                    for item in result["outputs"]:
                        try:
                            normalized = normalize(args.root, record["record_id"], item)
                            if normalized:
                                summary["harmonized"].append(normalized)
                                print(f"NORMALIZED {item['path']} {normalized['status']}", flush=True)
                        except Exception as error:
                            summary["conversion_errors"].append({"path": item["path"],
                                                                 "error": str(error)})
                            print(f"CONVERSION ERROR {item['path']}: {error}", flush=True)
                break
            except Exception as error:
                print(f"ERROR attempt={attempt + 1}: {error}", flush=True)
                if attempt == 2:
                    summary["errors"].append({"record_id": record["record_id"],
                                               "asset": asset["name"], "error": str(error)})
                else:
                    time.sleep(5)
        summary["updated_at"] = now()
        save_json(args.root / "acquisition-status.json", summary)
        if summary["errors"]:
            raise RuntimeError("Acquisition stopped; failed staged asset retained for diagnosis")
    summary["finished_at"] = now()
    save_json(args.root / "acquisition-status.json", summary)


if __name__ == "__main__":
    main()
