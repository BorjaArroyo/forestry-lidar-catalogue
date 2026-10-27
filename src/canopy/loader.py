"""Configurable NumPy streaming over validated Canopy dataset exports.

Yielded blocks are storage units, not spatial tiles or independent training
samples. Native dtypes, point order, identities and reference masks are retained.
"""

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import knowledge_model
from .classification.package import TreeDataset
from .joint.package import JointDataset, POINT_FIELDS
from .joint.model import FORMAT as JOINT_FORMAT, SOURCE as JOINT_SOURCE
from .task_dataset import TaskDataset
from .task_package import read_json, sha_file


@dataclass(frozen=True)
class LoaderConfig:
    """Select exported data without creating splits or transforming measurements.

    None selects all available values. Optional fields absent from a source stay
    absent. Selecting references or features also retains their validity masks.
    block_points bounds yielded slices; it does not change the source read size.
    """

    partitions: tuple[str, ...] | None = None
    sources: tuple[str, ...] | None = None
    fields: tuple[str, ...] | None = None
    modalities: tuple[str, ...] | None = None
    block_points: int | None = None
    copy_arrays: bool = False

    def __post_init__(self):
        for name in ("partitions", "sources", "fields", "modalities"):
            values = getattr(self, name)
            if values is not None:
                if (
                    isinstance(values, str)
                    or not values
                    or any(not isinstance(value, str) or not value for value in values)
                ):
                    raise ValueError(f"{name} must be a nonempty sequence of names")
                object.__setattr__(self, name, tuple(dict.fromkeys(values)))
        if self.block_points is not None and (
            type(self.block_points) is not int or self.block_points <= 0
        ):
            raise ValueError("block_points must be a positive integer")
        if type(self.copy_arrays) is not bool:
            raise ValueError("copy_arrays must be a boolean")


class NumpyDataset:
    """Read either supported dataset format through its independent validator.

    The first iteration validates the complete export, including sources excluded
    by filters. Further iterations reuse that check and verify each read block.
    Default arrays are read-only; request copies for downstream transformations.
    """

    def __init__(self, root, config=None, *, model=None, profile=None):
        self.root = Path(root).expanduser().resolve()
        self.config = config if config is not None else LoaderConfig()
        if not isinstance(self.config, LoaderConfig):
            raise TypeError("config must be a LoaderConfig")
        manifest = read_json(self.root / "dataset.json")
        self.task = manifest.get("task_ref")
        if manifest.get("format") == JOINT_FORMAT:
            self.task = "task:joint-tree-reference"
        self._metadata_paths = [self.root / "dataset.json"]
        self._report = None
        if self.task == "task:joint-tree-reference":
            self._reader = JointDataset(self.root)
            self._metadata_paths.append(self.root / "dataset-plan.json")
            self._available = {
                "partitions": {"unassigned"},
                "sources": {JOINT_SOURCE},
                "fields": POINT_FIELDS
                | {
                    "native_id",
                    "taxonomy",
                    "taxonomy_valid",
                    "instance_eligible",
                    "taxonomy_eligible",
                    "complete_crown",
                    "species",
                    "species_valid",
                    "genus",
                    "genus_valid",
                    "leaf_group",
                    "leaf_group_valid",
                },
                "modalities": {"TLS"},
            }
        elif self.task == "task:instances":
            self._reader = TaskDataset(
                self.root, model if model is not None else knowledge_model.load(), profile=profile
            )
            entries = self._reader.manifest["packages"]
            self._available = {
                "partitions": {entry["partition"] for entry in entries},
                "sources": {entry["source_ref"] for entry in entries},
                "fields": {
                    field
                    for entry in entries
                    for fields in entry["plan"]["included"].values()
                    for field in fields
                },
                "modalities": set(),
            }
        elif self.task == "task:species":
            self._reader = TreeDataset(self.root)
            self._metadata_paths += [
                self.root / "dataset-plan.json",
                self.root / "vocabulary.json",
            ]
            entries = self._reader.manifest["observations"]
            self._available = {
                "partitions": {entry["published_split"] for entry in entries},
                "sources": {entry["source_ref"] for entry in entries},
                "fields": {"xyz"},
                "modalities": {entry["modality"] for entry in entries},
            }
        else:
            raise ValueError("Unsupported dataset task; use an exported dataset.json folder")
        for name, available in self._available.items():
            selected = getattr(self.config, name)
            if selected is not None and (unknown := set(selected) - available):
                raise ValueError(f"Unavailable {name}: {', '.join(sorted(unknown))}")
        self._hashes = {path: sha_file(path) for path in self._metadata_paths}
        self._fields = set(self.config.fields) if self.config.fields is not None else None
        if self._fields is not None:
            for field, mask in (
                ("instance", "instance_valid"),
                ("features", "feature_valid"),
                ("point_to_tree", "point_to_tree_valid"),
                ("taxonomy", "taxonomy_valid"),
                ("species", "species_valid"),
                ("genus", "genus_valid"),
                ("leaf_group", "leaf_group_valid"),
            ):
                if field in self._fields:
                    self._fields.add(mask)

    @property
    def info(self):
        """Describe available values, independently of the configured filters."""
        return {
            "task": self.task,
            "unit": "scene blocks" if self.task == "task:instances" else "observation blocks",
            **{name: sorted(values) for name, values in self._available.items()},
        }

    def _check_metadata(self):
        if any(sha_file(path) != digest for path, digest in self._hashes.items()):
            self._report = None
            raise ValueError("Dataset metadata changed; reopen and validate the dataset")

    def validate(self):
        """Validate every source, not just the configured consumer selection."""
        self._report = None
        self._check_metadata()
        report = self._reader.validate()
        self._check_metadata()
        self._report = report
        return dict(report)

    def _selected(self, name, value):
        selection = getattr(self.config, name)
        return selection is None or value in selection

    def _blocks(self):
        if self.task == "task:joint-tree-reference":
            if (
                self._selected("partitions", "unassigned")
                and self._selected("sources", JOINT_SOURCE)
                and self._selected("modalities", "TLS")
            ):
                yield from self._reader.iter_blocks()
        elif self.task == "task:instances":
            for partition in sorted(self._available["partitions"]):
                if self._selected("partitions", partition):
                    for block in self._reader.iter_partition(partition):
                        if self._selected("sources", block["source_ref"]):
                            yield block
        else:
            for observation in self._reader.manifest["observations"]:
                if not all(
                    self._selected(name, observation[key])
                    for name, key in (
                        ("partitions", "published_split"),
                        ("sources", "source_ref"),
                        ("modalities", "modality"),
                    )
                ):
                    continue
                for block in self._reader.iter_observation(observation):
                    yield {
                        key: dict(value) if isinstance(value, dict) else value
                        for key, value in block.items()
                        if key not in {"xyz", "native_records"}
                    } | {"arrays": {"xyz": block["xyz"]}}

    def iter_blocks(self):
        """Stream point-aligned arrays with their source and observation context."""
        self._check_metadata()
        if self._report is None:
            self.validate()
        for block in self._blocks():
            self._check_metadata()
            arrays = block["arrays"]
            count = len(arrays["xyz"])
            step = self.config.block_points or count
            for start in range(0, count, step):
                selected = {}
                for name, array in arrays.items():
                    if self._fields is not None and name not in self._fields:
                        continue
                    value = array[start : start + step]
                    if self.config.copy_arrays:
                        value = np.array(value, copy=True)
                    else:
                        value = value.view()
                        value.setflags(write=False)
                    selected[name] = value
                result = {**block, "row_offset": block["row_offset"] + start, "arrays": selected}
                if "tree_arrays" in block:
                    # Tree axes are plot-scoped and must never be sliced with point rows.
                    tree_arrays = {}
                    for name, array in block["tree_arrays"].items():
                        if self._fields is not None and name not in self._fields:
                            continue
                        value = (
                            np.array(array, copy=True) if self.config.copy_arrays else array.view()
                        )
                        if not self.config.copy_arrays:
                            value.setflags(write=False)
                        tree_arrays[name] = value
                    result["tree_arrays"] = tree_arrays
                yield result
        self._check_metadata()

    def __iter__(self):
        return self.iter_blocks()


def open_dataset(root, config=None, *, model=None, profile=None):
    """Open an extracted segmentation or classification export without Torch."""
    return NumpyDataset(root, config, model=model, profile=profile)
