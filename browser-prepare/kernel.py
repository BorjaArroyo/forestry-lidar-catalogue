"""Bounded browser adapter for the unchanged, audited FOR-instance policy."""

import hashlib
import json
from pathlib import Path
import sys

import laspy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/for_instance"))
import prepare as audited


class Preparation:
    def __init__(self, source, profile):
        self.source = Path(source)
        self.profile = Path(profile)
        self.lock = audited.read(self.profile / "source-lock.json")
        fingerprint = audited.package_fingerprint(self.profile)
        digest = audited.sha(self.source)
        candidates = [
            p
            for p in self.lock["plots"]
            if p["size_bytes"] == self.source.stat().st_size and p["sha256"] == digest
        ]
        if len(candidates) != 1:
            raise ValueError(
                "Select a complete, unchanged LAS from the reviewed FOR-instance release"
            )
        self.plot = candidates[0]
        self.reader = laspy.open(self.source)
        h = self.reader.header
        if (
            h.are_points_compressed
            or h.point_count != self.plot["points"]
            or h.scales.tolist() != self.plot["scales"]
            or h.offsets.tolist() != self.plot["offsets"]
        ):
            self.reader.close()
            raise ValueError("Native LAS header differs from the reviewed source")
        self.iterator = iter(self.reader.chunk_iterator(audited.CHUNK_POINTS))
        native = audited.schema(h)
        native_id = hashlib.sha256(json.dumps(native, sort_keys=True).encode()).hexdigest()[:20]
        self.scene = {
            k: self.plot[k]
            for k in ["path", "sha256", "points", "published_split", "crs", "scales", "offsets"]
        }
        self.scene.update(
            id="8287792-" + hashlib.sha256(self.plot["path"].encode()).hexdigest()[:20],
            chunks=[],
            class_counts=[0] * 7,
            unknown_points=0,
            background_points=0,
            tree_points=0,
            input_snapshot_attempts=[
                dict(
                    size_bytes=self.source.stat().st_size,
                    stream_sha256=digest,
                    snapshot_sha256=digest,
                )
            ],
            native_schema_ref=native_id,
        )
        self.manifest = dict(
            schema_version="1.1.0",
            pipeline=audited.PIPELINE,
            package_sha256=fingerprint,
            source=dict(
                record_id=8287792,
                archive_sha256=self.lock["download_sha256"],
                provider_checksum=self.lock["provider_checksum"],
            ),
            policy=audited.read(self.profile / "policy.json"),
            scenes=[self.scene],
            native_schemas={native_id: native},
            unmatched_split_rows=self.lock["unmatched_split_rows"],
            selection=dict(
                kind="explicit-plots",
                paths=[self.plot["path"]],
                available_plots=len(self.lock["plots"]),
                archive_verification="Not performed by this selection; each selected LAS is SHA256 verified against the reviewed release",
            ),
            scope="One complete selected LAS plot; other release plots are not included",
            geographic_independence="Not established; preserve dev/test without asserting new independent sites",
        )
        self.offset = 0

    def next_block(self, target):
        try:
            points = next(self.iterator)
        except StopIteration:
            self.reader.close()
            if (
                self.offset != self.plot["points"]
                or self.scene["class_counts"] != self.plot["class_counts"]
            ):
                raise ValueError("Whole-plot point or class counts differ from the source audit")
            if audited.sha(self.source) != self.plot["sha256"]:
                raise ValueError("Source changed during preparation")
            return None
        xyz = np.column_stack([points.x, points.y, points.z])
        if not np.isfinite(xyz).all():
            raise ValueError("Nonfinite XYZ")
        classes = np.asarray(points["classification"])
        instance, valid = audited.reference(classes, points["treeID"])
        np.savez(
            target,
            xyz=xyz,
            instance=instance,
            instance_valid=valid,
            native_class=classes,
            original_points=points.array,
        )
        chunk = dict(
            path=f"plots/{self.scene['id']}/{len(self.scene['chunks']):05d}.npz",
            points=len(points),
            offset=self.offset,
            sha256=audited.sha(Path(target)),
        )
        self.scene["chunks"].append(chunk)
        self.scene["class_counts"] = (
            np.asarray(self.scene["class_counts"]) + np.bincount(classes, minlength=7)
        ).tolist()
        self.scene["unknown_points"] += int((instance < 0).sum())
        self.scene["background_points"] += int((instance == 0).sum())
        self.scene["tree_points"] += int((instance > 0).sum())
        self.offset += len(points)
        return chunk
