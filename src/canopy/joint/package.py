"""Bounded producer and independent reader for linked point and tree targets."""

import copy
import hashlib
import json
from pathlib import Path

import jsonschema
import numpy as np

from canopy.joint.model import FORMAT, SOURCE, TASKS, LABEL_LEVELS, check_embedded, tree_table
from canopy.joint.source import encoded
from canopy.paths import repository_root
from canopy.task_package import sha_file

POINT_FIELDS = {
    "xyz",
    "instance",
    "instance_valid",
    "point_to_tree",
    "point_to_tree_valid",
    "native_records",
}


def native_dtype(plot):
    fields = plot["native_schema"]["fields"]
    dtype = np.dtype(
        [
            tuple([field[0], field[1], tuple(field[2])]) if len(field) == 3 else tuple(field)
            for field in fields
        ]
    )
    if dtype.hasobject or dtype.itemsize != plot["native_schema"]["point_record_length"]:
        raise ValueError("Invalid pinned joint point record layout")
    return dtype


class Preparation:
    """Prepare audited native records without dropping or reordering any points."""

    def __init__(self, plan, output):
        check_embedded(plan)
        self.plan = plan
        self.root = Path(output)
        if self.root.exists() and any(self.root.iterdir()):
            raise ValueError("Joint output directory must be empty")
        self.root.mkdir(parents=True, exist_ok=True)
        self.plots = []
        self.current = None

    def begin_plot(self, path):
        if self.current is not None or any(p["path"] == path for p in self.plots):
            raise ValueError("Previous plot incomplete or plot repeated")
        plot = next((p for p in self.plan["plots"] if p["path"] == path), None)
        if plot is None:
            raise ValueError("Plot absent from the frozen joint plan")
        self.current = dict(
            path=path, trees=tree_table(self.plan, plot, self.plan["request"]), blocks=[]
        )
        self.plot = plot

    def add_block(self, data, offset, points):
        if self.current is None:
            raise ValueError("No active joint plot")
        index = len(self.current["blocks"])
        if index >= len(self.plot["chunks"]):
            raise ValueError("Unexpected joint block")
        expected = self.plot["chunks"][index]
        if (offset, points) != (expected["offset"], expected["points"]) or hashlib.sha256(
            data
        ).hexdigest() != expected["records_sha256"]:
            raise ValueError("Joint native block differs from the complete source audit")
        native = np.frombuffer(data, dtype=native_dtype(self.plot))
        if len(native) != points:
            raise ValueError("Joint native block length mismatch")
        coordinates = np.column_stack([native[axis] for axis in ["X", "Y", "Z"]]).astype("<f8")
        coordinates *= np.asarray(self.plot["native_schema"]["scales"])
        coordinates += np.asarray(self.plot["native_schema"]["offsets"])
        if hashlib.sha256(coordinates.tobytes()).hexdigest() != expected["xyz_sha256"]:
            raise ValueError("Joint coordinates differ from native source")
        instance = native["treeID"].astype("<i8")
        valid = instance > 0
        ids = np.array([t["native_id"] for t in self.current["trees"]], dtype="<i8")
        links = np.searchsorted(ids, instance).astype("<i8")
        links[~valid] = -1
        relative = f"unassigned/plots/{len(self.plots)}/blocks/{offset}.npz"
        target = self.root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        np.savez(
            target,
            xyz=coordinates,
            instance=instance,
            instance_valid=valid,
            point_to_tree=links,
            point_to_tree_valid=valid.copy(),
            native_records=native,
        )
        block = dict(path=relative, offset=offset, points=points, sha256=sha_file(target))
        self.current["blocks"].append(block)
        return block

    def end_plot(self):
        if self.current is None or len(self.current["blocks"]) != len(self.plot["chunks"]):
            raise ValueError("Joint plot is incomplete")
        self.plots.append(self.current)
        self.current = None

    def finish(self):
        if self.current is not None or [p["path"] for p in self.plots] != [
            p["path"] for p in self.plan["plots"]
        ]:
            raise ValueError("Joint output coverage differs from the frozen plan")
        manifest = dict(
            schema_version="1.0.0",
            format=FORMAT,
            task_refs=TASKS.copy(),
            plan=self.plan,
            plots=self.plots,
        )
        (self.root / "dataset.json").write_bytes(encoded(manifest))
        (self.root / "dataset-plan.json").write_bytes(encoded(self.plan))
        return manifest


class JointDataset:
    """Independently validate native records, point links, both targets and policy."""

    def __init__(self, root):
        self.root = Path(root).expanduser().resolve()
        self.manifest = json.loads((self.root / "dataset.json").read_text())
        schema = json.loads((repository_root() / "schemas/joint-dataset.schema.json").read_text())
        jsonschema.Draft202012Validator(schema).validate(self.manifest)
        self.plan = self.manifest["plan"]
        check_embedded(self.plan)
        if json.loads((self.root / "dataset-plan.json").read_text()) != self.plan:
            raise ValueError("Joint dataset plan and manifest disagree")
        if [p["path"] for p in self.manifest["plots"]] != [p["path"] for p in self.plan["plots"]]:
            raise ValueError("Joint manifest plot coverage differs from the frozen plan")
        for actual, expected in zip(self.manifest["plots"], self.plan["plots"], strict=True):
            if actual["trees"] != tree_table(self.plan, expected, self.plan["request"]):
                raise ValueError("Joint tree reference or eligibility differs from the plan")
            if len(actual["blocks"]) != len(expected["chunks"]):
                raise ValueError("Joint plot has missing or extra blocks")
        self._metadata = {
            name: sha_file(self.root / name) for name in ["dataset.json", "dataset-plan.json"]
        }

    def check_metadata(self):
        if any(sha_file(self.root / name) != digest for name, digest in self._metadata.items()):
            raise ValueError("Joint dataset metadata changed while reading")

    def _block(self, block, plot, trees, expected):
        self.check_metadata()
        path = self.root / block["path"]
        if (
            path.is_symlink()
            or not path.resolve().is_relative_to(self.root)
            or path.resolve() != path.absolute()
        ):
            raise ValueError("Joint block path escapes its dataset")
        if sha_file(path) != block["sha256"]:
            raise ValueError("Joint output block checksum mismatch")
        if (block["offset"], block["points"]) != (expected["offset"], expected["points"]):
            raise ValueError("Joint output block coverage mismatch")
        with np.load(path, allow_pickle=False) as archive:
            if set(archive.files) != POINT_FIELDS:
                raise ValueError("Joint block fields differ from the contract")
            arrays = {key: archive[key] for key in archive.files}
        count = expected["points"]
        types = {
            "xyz": (np.dtype("<f8"), (count, 3)),
            "instance": (np.dtype("<i8"), (count,)),
            "instance_valid": (np.dtype("bool"), (count,)),
            "point_to_tree": (np.dtype("<i8"), (count,)),
            "point_to_tree_valid": (np.dtype("bool"), (count,)),
            "native_records": (native_dtype(plot), (count,)),
        }
        for key, (dtype, shape) in types.items():
            if arrays[key].dtype != dtype or arrays[key].shape != shape:
                raise ValueError("Invalid joint array dtype or shape: " + key)
        raw = arrays["native_records"]
        if hashlib.sha256(raw.tobytes()).hexdigest() != expected["records_sha256"]:
            raise ValueError("Joint native records differ from audited input")
        for axis, field in enumerate(["X", "Y", "Z"]):
            values = (
                raw[field].astype("<f8") * plot["native_schema"]["scales"][axis]
                + plot["native_schema"]["offsets"][axis]
            )
            if not np.array_equal(arrays["xyz"][:, axis], values):
                raise ValueError("Joint XYZ differs from native coordinates")
        if not np.array_equal(arrays["instance"], raw["treeID"].astype("<i8")):
            raise ValueError("Joint instance identity changed")
        positive = raw["treeID"] > 0
        if not np.array_equal(arrays["instance_valid"], positive) or not np.array_equal(
            arrays["point_to_tree_valid"], positive
        ):
            raise ValueError("Joint reference validity changed")
        links = arrays["point_to_tree"]
        if (
            np.any(links[~positive] != -1)
            or np.any(links[positive] < 0)
            or np.any(links[positive] >= len(trees))
        ):
            raise ValueError("Joint point-to-tree link is out of bounds")
        for index, tree in enumerate(trees):
            native_points = raw["treeID"] == tree["native_id"]
            if not np.array_equal(links == index, native_points):
                raise ValueError("Joint point-to-tree identity changed")
            if np.any(raw["treeSP"][native_points] != tree["native_code"]) or np.any(
                raw["completelyInside"][native_points] != int(tree["complete_crown"])
            ):
                raise ValueError("Joint native taxonomy or crown reference changed")
        return arrays

    def validate(self):
        total_points, total_blocks = 0, 0
        for actual, plot in zip(self.manifest["plots"], self.plan["plots"], strict=True):
            native_hash = hashlib.sha256()
            tree_counts = {tree["native_id"]: 0 for tree in actual["trees"]}
            zero_points = 0
            for block, expected in zip(actual["blocks"], plot["chunks"], strict=True):
                arrays = self._block(block, plot, actual["trees"], expected)
                native_hash.update(arrays["native_records"].tobytes())
                ids, counts = np.unique(arrays["instance"], return_counts=True)
                for identity, count in zip(ids, counts, strict=True):
                    if identity > 0:
                        tree_counts[int(identity)] += int(count)
                    else:
                        zero_points += int(count)
                total_points += block["points"]
                total_blocks += 1
            if (
                native_hash.hexdigest() != plot["native_records_sha256"]
                or zero_points != plot["unassigned_points"]
                or any(tree_counts[t["native_id"]] != t["points"] for t in actual["trees"])
            ):
                raise ValueError("Incomplete joint native point/tree coverage")
        self.check_metadata()
        return dict(
            status="validated",
            scope="All exported blocks and both linked reference targets",
            plan_sha256=self.plan["plan_sha256"],
            points=total_points,
            blocks=total_blocks,
            trees=self.plan["totals"]["trees"],
            taxonomy_eligible=self.plan["totals"]["taxonomy_eligible"],
        )

    def iter_blocks(self):
        for actual, plot in zip(self.manifest["plots"], self.plan["plots"], strict=True):
            for block, expected in zip(actual["blocks"], plot["chunks"], strict=True):
                arrays = self._block(block, plot, actual["trees"], expected)
                tree_arrays = {
                    key: np.array([tree[key] for tree in actual["trees"]], dtype=dtype)
                    for key, dtype in [
                        ("native_id", "<i8"),
                        ("taxonomy", "<i8"),
                        ("taxonomy_valid", "bool"),
                        ("instance_eligible", "bool"),
                        ("taxonomy_eligible", "bool"),
                        ("complete_crown", "bool"),
                    ]
                }
                for level in LABEL_LEVELS:
                    values = [tree["labels"][level]["value"] for tree in actual["trees"]]
                    tree_arrays[level] = np.array(
                        [
                            self.plan["vocabularies"][level].index(value)
                            if value is not None
                            else -1
                            for value in values
                        ],
                        dtype="<i8",
                    )
                    tree_arrays[level + "_valid"] = np.array(
                        [value is not None for value in values], dtype="bool"
                    )
                yield dict(
                    source_ref=SOURCE,
                    scene=plot["path"],
                    published_split="unassigned",
                    row_offset=block["offset"],
                    arrays=arrays,
                    tree_arrays=tree_arrays,
                    trees=copy.deepcopy(actual["trees"]),
                    vocabulary=self.plan["vocabulary"],
                    classification_target=self.plan["request"]["target"],
                    vocabularies=copy.deepcopy(self.plan["vocabularies"]),
                )


def prepare_native(source, plan, inputs, output, *, allow_unadmitted=False):
    from canopy.joint.model import check, require_admitted
    from canopy.joint.source import BLOCK_POINTS
    import laspy

    check(source, plan, runtime_sha256=plan["runtime_sha256"])
    if not allow_unadmitted:
        require_admitted(source)
    preparation = Preparation(plan, output)
    for plot in plan["plots"]:
        path = Path(inputs) / plot["path"]
        if path.stat().st_size != plot["size_bytes"] or sha_file(path) != plot["sha256"]:
            raise ValueError("Joint source cloud checksum mismatch")
        preparation.begin_plot(plot["path"])
        offset = 0
        with laspy.open(path) as reader:
            if (
                reader.header.point_format.dtype() != native_dtype(plot)
                or reader.header.point_count != plot["points"]
                or list(reader.header.scales) != plot["native_schema"]["scales"]
                or list(reader.header.offsets) != plot["native_schema"]["offsets"]
            ):
                raise ValueError("Joint native LAS header changed")
            for points in reader.chunk_iterator(BLOCK_POINTS):
                preparation.add_block(points.array.tobytes(), offset, len(points))
                offset += len(points)
        preparation.end_plot()
    preparation.finish()
    report = JointDataset(output).validate()
    (Path(output) / "validation-report.json").write_bytes(encoded(report))
    return report
