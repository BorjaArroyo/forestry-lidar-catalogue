"""Compute provisional native references while pinned ZIP ranges arrive.

This produces no valid-source report. audit_archive must subsequently verify
the complete provider checksum and recheck every member SHA256 before using its
checkpoint. This overlaps bounded decoding with transfer on the local machine.
"""

from canopy.classification.dataio import read_json

import hashlib
import concurrent.futures
import json
from pathlib import Path
import resource
import struct
import time
import zlib

from canopy.classification.audit import inspect_cloud
from canopy.classification.model import load_registry
from canopy.classification.snapshot import ROOT, write, FOR

_worker_trees = None


def decode_snapshot(path, member, source=FOR, archive="dev.zip"):
    global _worker_trees
    if _worker_trees is None:
        _, _, rows = load_registry()
        _worker_trees = {(t["source_ref"], t["tree_id"]): t for t in rows}
    try:
        return inspect_cloud(
            path, source=source, member=member, archive=archive, trees=_worker_trees
        )
    finally:
        Path(path).unlink(missing_ok=True)


class PendingRanges:
    def __init__(self, directory, name):
        self.directory = directory
        self.name = name
        self.plan = None

    def read(self, start, size):
        final = self.directory / self.name
        if final.exists():
            with final.open("rb") as stream:
                stream.seek(start)
                return stream.read(size)
        if self.plan is None:
            state = self.directory / (self.name + ".ranges/state.json")
            while not state.exists():
                time.sleep(1)
            self.plan = read_json(state)["segments"]
        data = bytearray()
        for segment in self.plan:
            end = segment["start"] + segment["size"]
            if start >= end:
                continue
            if start < segment["start"]:
                raise ValueError("RANGE_GAP")
            offset = start - segment["start"]
            count = min(size - len(data), segment["size"] - offset)
            path = self.directory / (self.name + ".ranges") / segment["path"]
            while not path.exists() or path.stat().st_size < offset + count:
                if final.exists():
                    with final.open("rb") as stream:
                        stream.seek(start)
                        data.extend(stream.read(size - len(data)))
                        return bytes(data)
                time.sleep(0.5)
            try:
                with path.open("rb") as stream:
                    stream.seek(offset)
                    chunk = stream.read(count)
            except FileNotFoundError:
                if final.exists():
                    with final.open("rb") as stream:
                        stream.seek(start)
                        data.extend(stream.read(size - len(data)))
                        return bytes(data)
                raise
            if len(chunk) != count:
                raise ValueError("RANGE_SNAPSHOT_TRUNCATED")
            data.extend(chunk)
            start += count
            if len(data) == size:
                return bytes(data)
        raise ValueError("RANGE_OUTSIDE_ASSET")


def main():
    base = ROOT / "temp/classification"
    stage = base / "native-audit/dev-stage"
    stage.mkdir(parents=True, exist_ok=True)
    registry, _, rows = load_registry()
    {(t["source_ref"], t["tree_id"]): t for t in rows}
    source = next(s for s in registry["sources"] if s["source_ref"] == FOR)
    asset = next(a for a in source["assets"] if a["name"] == "dev.zip")
    import canopy.classification.audit as audit

    code = Path(audit.__file__).read_bytes()
    contract = dict(
        source_ref=FOR, asset=asset, implementation_sha256=hashlib.sha256(code).hexdigest()
    )
    contract_path = stage / "audit-input.json"
    if contract_path.exists() and read_json(contract_path) != contract:
        raise ValueError("AUDIT_CHECKPOINT_CHANGED")
    write(contract_path, contract)
    (stage / "implementation.py").write_bytes(code)
    inventory = read_json(ROOT / "evidence/classification/for-member-inventory.json")["members"]
    members = sorted(
        [m for m in inventory if m["archive"] == "dev.zip"], key=lambda m: m["header_offset"]
    )
    path = stage / "observations.jsonl"
    cached = {}
    if path.exists():
        with path.open("rb+") as stream:
            good = 0
            for line in stream:
                if not line.endswith(b"\n"):
                    break
                row = json.loads(line)
                cached[row["path"]] = row
                good = stream.tell()
            stream.truncate(good)
    reader = PendingRanges(base / "originals", "dev.zip")
    started = time.monotonic()
    points = 0
    with (
        path.open("a") as checkpoints,
        concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool,
    ):
        pending = []
        completed = len(cached)
        points = sum(o["points"] for o in cached.values())

        def collect(block=False):
            nonlocal completed, points, pending
            if not pending:
                return
            ready, _ = concurrent.futures.wait(
                pending,
                return_when=concurrent.futures.FIRST_COMPLETED
                if block
                else concurrent.futures.ALL_COMPLETED,
                timeout=None if block else 0,
            )
            for future in ready:
                row = future.result()
                checkpoints.write(json.dumps(row, separators=(",", ":")) + "\n")
                checkpoints.flush()
                points += row["points"]
                completed += 1
                pending.remove(future)
                if completed % 100 == 0:
                    progress = dict(
                        status="provisional-until-whole-archive-verification",
                        observations=completed,
                        points=points,
                        workers=4,
                        elapsed_seconds=round(time.monotonic() - started, 1),
                    )
                    write(stage / "prefetch-progress.json", progress)
                    print(json.dumps(progress), flush=True)

        for index, member in enumerate(members):
            if member["path"] in cached:
                continue
            start = member["header_offset"]
            header = reader.read(start, 30)
            if header[:4] != b"PK\x03\x04":
                raise ValueError("ZIP_HEADER_MISMATCH")
            method = struct.unpack_from("<H", header, 8)[0]
            name_length, extra_length = struct.unpack_from("<HH", header, 26)
            name = reader.read(start + 30, name_length).decode("utf8")
            if name != member["path"] or method not in {0, 8}:
                raise ValueError("ZIP_MEMBER_MISMATCH")
            data_start = start + 30 + name_length + extra_length
            snapshot = stage / ("prefetch-cloud-" + str(index))
            crc = 0
            size = 0
            decompressor = zlib.decompressobj(-15) if method == 8 else None
            try:
                with snapshot.open("wb") as output:
                    for offset in range(0, member["compressed_size"], 1024**2):
                        raw = reader.read(
                            data_start + offset, min(1024**2, member["compressed_size"] - offset)
                        )
                        decoded = decompressor.decompress(raw) if decompressor else raw
                        output.write(decoded)
                        crc = zlib.crc32(decoded, crc)
                        size += len(decoded)
                    if decompressor:
                        tail = decompressor.flush()
                        output.write(tail)
                        crc = zlib.crc32(tail, crc)
                        size += len(tail)
                        if not decompressor.eof:
                            raise ValueError("ZIP_MEMBER_TRUNCATED")
                if size != member["size_bytes"] or f"{crc:08x}" != member["crc32"]:
                    raise ValueError("ZIP_MEMBER_CRC_MISMATCH")
                pending.append(pool.submit(decode_snapshot, snapshot, member["path"]))
                collect(len(pending) >= 8)
            except BaseException:
                snapshot.unlink(missing_ok=True)
                raise
        while pending:
            collect(True)
    write(
        stage / "prefetch-complete.json",
        dict(
            status="provisional",
            observations=len(members),
            points=points,
            implementation_sha256=contract["implementation_sha256"],
            peak_rss_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024,
            worker_peak_rss_bytes=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss * 1024,
            workers=4,
        ),
    )


if __name__ == "__main__":
    main()
