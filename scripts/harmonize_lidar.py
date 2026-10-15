"""Write bounded, lossless point-cloud chunks with explicit supervision masks."""

import hashlib
import json
import time
from pathlib import Path

import laspy
import numpy as np
from plyfile import PlyData


def sha256(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(8 * 1024**2):
            value.update(block)
    return value.hexdigest()


def verify_source(path, expected_sha256, attempts=3):
    for attempt in range(attempts):
        if sha256(path) == expected_sha256:
            return
        if attempt + 1 < attempts:
            time.sleep(2 * (attempt + 1))
    raise ValueError("Source changed after acquisition verification")


def harmonize(root, source_id, item, chunk_size=500_000):
    root = Path(root)
    path = root / item["path"]
    if path.suffix.lower() not in {".las", ".laz", ".ply"}:
        return None
    # ND terms require a separate intended-use decision for derived products.
    if source_id == 15193973:
        return {"path": item["path"], "status": "pending_derivative_rights_review"}
    scene_id = f"{source_id}_{hashlib.sha256(item['path'].encode()).hexdigest()[:20]}"
    output = root / "harmonized" / scene_id
    marker = output / "scene.json"
    if marker.exists():
        old = json.loads(marker.read_text())
        if old.get("status") == "verified" and old["input_sha256"] == item["sha256"]:
            return old
        raise ValueError("Existing conversion differs or is incomplete")
    verify_source(path, item["sha256"])
    output.mkdir(parents=True, exist_ok=True)
    reader = None
    metadata = {"scene_id": scene_id, "record_id": source_id,
                "input": item["path"], "input_sha256": item["sha256"],
                "schema_version": "0.1", "status": "in_progress",
                "coordinate_transform": "none; original numeric XYZ preserved",
                "semantic_classes": {"0": "unknown", "1": "ground", "2": "wood", "3": "leaf"},
                "instance_unknown": -1, "instance_background": 0,
                "split": "unassigned", "physical_site": "pending_review",
                "chunks": [], "point_count": 0}
    if path.suffix.lower() in {".las", ".laz"}:
        reader = laspy.open(path)
        metadata["source_crs"] = str(reader.header.parse_crs())
        metadata["las_scales"] = reader.header.scales.tolist()
        metadata["las_offsets"] = reader.header.offsets.tolist()
        metadata["source_fields"] = list(reader.header.point_format.dimension_names)
        iterator = reader.chunk_iterator(chunk_size)
        expected_count = reader.header.point_count
    else:
        ply = PlyData.read(path, mmap="r")
        element = next((element for element in ply.elements
                        if {"x", "y", "z"} <= set(element.data.dtype.names or [])), None)
        if element is None:
            raise ValueError("PLY has no XYZ point element")
        metadata["source_comments"] = ply.comments
        metadata["source_fields"] = list(element.data.dtype.names)
        expected_count = len(element.data)
        iterator = (element.data[start:start + chunk_size]
                    for start in range(0, expected_count, chunk_size))
    try:
        for index, points in enumerate(iterator):
            is_las = reader is not None
            raw = points.array if is_las else points
            names = set(metadata["source_fields"])
            get = lambda name: np.asarray(points[name])
            xyz = np.column_stack([np.asarray(points.x), np.asarray(points.y), np.asarray(points.z)]) if is_las else np.column_stack([points[name] for name in ("x", "y", "z")])
            xyz = xyz.astype(np.float64)
            if not np.isfinite(xyz).all():
                raise ValueError("Nonfinite XYZ")
            n = len(xyz)
            semantic = np.zeros(n, dtype=np.int8)
            instance = np.full(n, -1, dtype=np.int64)
            instance_field = None
            if source_id in {8287792, 16742708, 19127709}:
                instance_field = "treeID"
            elif source_id in {19351234, 15913427}:
                instance_field = "tree_index"
            elif source_id == 16875688:
                instance_field = "instance"
            if instance_field in names:
                labels = get(instance_field)
                if not np.isfinite(labels).all() or not np.equal(labels, np.floor(labels)).all():
                    raise ValueError("Noninteger or nonfinite instance IDs")
                instance[labels > 0] = labels[labels > 0].astype(np.int64)
            if source_id == 16742708 and "semantic_seg" in names:
                labels = get("semantic_seg")
                for value in (1, 2, 3):
                    semantic[labels == value] = value
            elif source_id == 17172162 and "semantic_GT" in names:
                labels = get("semantic_GT")
                for original, canonical in {0: 1, 2: 2, 3: 2, 4: 3}.items():
                    semantic[labels == original] = canonical
            elif source_id == 15913427:
                labeled = path.stem in {"plot_1", "plot_2"}
                if labeled and "classification" in names:
                    labels = get("classification")
                    semantic[labels == 0] = 3
                    semantic[labels == 1] = 2
                else:
                    instance[:] = -1
            elif source_id == 16875688 and "semantic" in names:
                semantic[get("semantic") == 0] = 1
            elif source_id == 19351234 and "classification" in names:
                labels = get("classification")
                instance[labels == 5] = -1
                instance[np.isin(labels, (2, 3, 4))] = 0
            instance[semantic == 1] = 0
            dest = output / f"chunk_{index:06d}.npz"
            np.savez_compressed(dest, xyz=xyz, semantic=semantic, instance=instance,
                                semantic_valid=semantic > 0, instance_valid=instance >= 0,
                                original_points=raw)
            with np.load(dest, allow_pickle=False) as stored:
                for key, expected in {"xyz": xyz, "semantic": semantic,
                                      "instance": instance, "original_points": raw}.items():
                    if stored[key].dtype != expected.dtype or stored[key].tobytes() != expected.tobytes():
                        raise ValueError(f"Conversion round-trip failed: {key}")
            metadata["chunks"].append({"path": str(dest.relative_to(root)),
                                       "sha256": sha256(dest), "point_count": n,
                                       "point_offset": metadata["point_count"]})
            metadata["point_count"] += n
        if metadata["point_count"] != expected_count:
            raise ValueError("Point count changed")
        metadata["status"] = "verified"
        metadata["units"] = "metres according to source documentation; no CRS inferred"
        marker.write_text(json.dumps(metadata, indent=2) + "\n")
        return metadata
    finally:
        if reader:
            reader.close()
