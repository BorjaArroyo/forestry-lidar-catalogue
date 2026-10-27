"""Audit complete TreeScan plots against the pinned native companion tables.

This records a bounded source scope. It never enables scientific admission.
"""

import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path

import laspy
import numpy as np

from canopy.paths import repository_root
from canopy.task_package import sha_file

SOURCE = "zenodo:19127709"
PIPELINE = "pipeline:treescan-joint-reference:1.0.0"
BLOCK_POINTS = 250000


def encoded(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()


def companion_tables(directory):
    root = repository_root()
    evidence = json.loads((root / "evidence/multitask-metadata-review.json").read_text())
    assets = evidence["treescan"]["assets"]
    for asset in assets:
        path = directory / asset["name"]
        if path.stat().st_size != asset["size_bytes"] or sha_file(path) != asset["sha256"]:
            raise ValueError("Companion table differs from its reviewed bytes: " + asset["name"])
    with (directory / "individual_tree_summary.csv").open(encoding="utf-8-sig") as stream:
        rows = list(csv.DictReader(stream))
    with (directory / "species_id_names.csv").open(encoding="utf-8-sig") as stream:
        lookup = list(csv.DictReader(stream))
    groups_path = root / "evidence/joint/leaf-group-taxonomy.json"
    groups = {row["genus"]: row for row in json.loads(groups_path.read_text())["genera"]}
    mapping = []
    for row in lookup:
        code, name = int(row["CODE"]), row["LATIN_NAME"].strip()
        mapping.append(
            dict(
                native_code=code,
                native_name=name,
                genus=name.split()[0],
                leaf_group=groups[name.split()[0]]["leaf_group"],
                leaf_group_evidence=groups[name.split()[0]]["url"],
                species=None if code == 40 else name,
            )
        )
    if len({row["native_code"] for row in mapping}) != len(mapping):
        raise ValueError("Duplicate taxonomic code")
    return rows, mapping, assets


def inspect_plot(path, member, rows, mapping):
    """Read every point independently before an adapter is allowed to consume it."""
    table = {}
    for row in rows:
        if row["source_file"] != member["path"]:
            continue
        identity = int(row["treeID"])
        if identity <= 0 or identity in table:
            raise ValueError("Invalid or duplicate companion tree ID")
        table[identity] = dict(
            native_id=identity,
            native_code=int(row["species_code"]),
            native_name=row["species"],
            complete_crown=bool(int(row["completely_inside"])),
            points=int(row["point_count"]),
        )
    counts, signatures = Counter(), {}
    chunks, offset = [], 0
    records_hash = hashlib.sha256()
    with laspy.open(path) as reader:
        header = reader.header
        required = {"treeID", "treeSP", "completelyInside"}
        if not required <= set(header.point_format.dimension_names):
            raise ValueError("Required TreeScan reference dimensions are absent")
        for points in reader.chunk_iterator(BLOCK_POINTS):
            columns = [
                np.asarray(points[name]) for name in ("treeID", "treeSP", "completelyInside")
            ]
            if any(not np.isfinite(a).all() or np.any(a != np.floor(a)) for a in columns):
                raise ValueError("Reference fields contain nonintegral values")
            ids, codes, crowns = columns
            if np.any(ids < 0) or np.any(codes < 0) or np.any(~np.isin(crowns, [0, 1])):
                raise ValueError("Unknown native reference sentinel")
            values, sizes = np.unique(ids, return_counts=True)
            counts.update({int(key): int(size) for key, size in zip(values, sizes, strict=True)})
            for identity in values:
                mask = ids == identity
                native_codes, native_crowns = np.unique(codes[mask]), np.unique(crowns[mask])
                if len(native_codes) != 1 or (identity > 0 and len(native_crowns) != 1):
                    raise ValueError("Inconsistent reference within one native tree")
                signature = (int(native_codes[0]), int(native_crowns[0]) if identity > 0 else 0)
                if int(identity) in signatures and signatures[int(identity)] != signature:
                    raise ValueError("Native tree reference changes between blocks")
                signatures[int(identity)] = signature
            raw = points.array.tobytes()
            records_hash.update(raw)
            xyz = np.column_stack([points.x, points.y, points.z]).astype("<f8")
            if not np.isfinite(xyz).all():
                raise ValueError("Nonfinite native coordinates")
            chunks.append(
                dict(
                    offset=offset,
                    points=len(points),
                    records_sha256=hashlib.sha256(raw).hexdigest(),
                    xyz_sha256=hashlib.sha256(xyz.tobytes()).hexdigest(),
                )
            )
            offset += len(points)
        schema = dict(
            fields=header.point_format.dtype().descr,
            point_format=header.point_format.id,
            point_record_length=header.point_format.size,
            scales=list(header.scales),
            offsets=list(header.offsets),
            las_version=str(header.version),
        )
        if offset != header.point_count or not offset:
            raise ValueError("Incomplete native cloud")
    if signatures.get(0, (0, 0))[0] != 0:
        raise ValueError("Nonzero taxonomy without a tree identity")
    lookup = {row["native_code"]: row for row in mapping}
    native_trees, disagreements = [], []
    for identity in sorted(set(counts) - {0}):
        code, crown = signatures[identity]
        if code != 0 and code not in lookup:
            raise ValueError("Native taxonomy has no reviewed code-to-name mapping")
        native = dict(
            native_id=identity,
            native_code=code,
            native_name=lookup[code]["native_name"] if code else "unknown",
            complete_crown=bool(crown),
            points=counts[identity],
        )
        native_trees.append(native)
        companion = table.get(identity)
        if companion is None or any(
            native[k] != companion[k] for k in ["native_code", "complete_crown", "points"]
        ):
            disagreements.append(dict(native_id=identity, native=native, companion=companion))
    return dict(
        **member,
        sha256=sha_file(path),
        points=offset,
        native_schema=schema,
        native_records_sha256=records_hash.hexdigest(),
        chunks=chunks,
        trees=native_trees,
        reference_origin="Native treeID/treeSP/completelyInside fields; companion tree rows are never used to label points",
        companion_review=dict(
            status="disagrees" if disagreements or set(table) - set(counts) else "matched",
            disagreements=disagreements,
            companion_only_ids=sorted(set(table) - set(counts)),
        ),
        unassigned_points=counts[0],
        published_split="unassigned",
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    rows, mapping, assets = companion_tables(args.input)
    inventory = json.loads((args.input / "members.json").read_text())
    plots = []
    for path in sorted(args.input.glob("*.laz")):
        member = next(row for row in inventory if row["path"] == path.name)
        plot = inspect_plot(path, member, rows, mapping)
        plots.append(plot)
        print(path.name, plot["points"], len(plot["trees"]), "fully checked", flush=True)
    if not plots:
        raise ValueError("No complete source plots supplied")
    record = next(
        r
        for r in json.loads(
            (repository_root() / "docs/lidar-acquisition-inventory.json").read_text()
        )["records"]
        if r["record_id"] == 19127709
    )
    archives = [
        dict(
            name=a["name"],
            size_bytes=a["size_bytes"],
            checksum=a["provider_checksum"],
            download_url=a["download_url"],
        )
        for a in record["files"]
        if a["name"] in {p["archive"] for p in plots}
    ]
    result = dict(
        schema_version="1.0.0",
        source_ref=SOURCE,
        pipeline_ref=PIPELINE,
        scope="Only the complete plots listed below; whole provider ZIP checksums are unchecked",
        table_assets=assets,
        taxonomy=mapping,
        archives=archives,
        plots=plots,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(encoded(result))


if __name__ == "__main__":
    main()
