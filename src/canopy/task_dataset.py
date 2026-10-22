"""Compose and load task datasets using preserved provider partition folders."""

import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil

from jsonschema import Draft202012Validator
from .paths import repository_root
from .task_package import TaskPackage, inside, read_json, sha_file
from .task_plan import check_plan, fingerprint, plan_request, validate_prepared, iter_task_blocks

SCHEMA = repository_root() / "schemas/task-dataset.schema.json"


def encoded(value):
    return (json.dumps(value, indent=2, allow_nan=False) + "\n").encode()


def compose_layout(model, entries):
    """Return metadata and copy mappings; never alter or reinterpret point arrays.

    Each entry contains a previously validated source package and its task plan.
    Duplicate scenes must agree exactly. Native schema and source-policy conflicts
    fail closed. Only task-permitted partitions enter the resulting dataset.
    """
    if not entries:
        raise ValueError("Select at least one prepared subset")
    groups, copies = {}, {}
    request = {key: entries[0]["plan"][key] for key in ("use", "variables")}
    for index, entry in enumerate(entries):
        plan, manifest = entry["plan"], entry["manifest"]
        check_plan(model, plan)
        if request != {key: plan[key] for key in request}:
            raise ValueError("Subsets must share one task request")
        if (
            plan["source_ref"] != "zenodo:" + str(manifest["source"]["record_id"])
            or plan["pipeline_ref"] != "pipeline:" + manifest["pipeline"]
        ):
            raise ValueError("Subset source or pipeline differs from its task plan")
        record = str(manifest["source"]["record_id"])
        for scene in manifest["scenes"]:
            partition = scene["published_split"]
            if partition not in plan["allowed_partitions"]:
                continue
            if partition not in {"dev", "train", "test"}:
                raise ValueError("Unsupported published partition")
            prefix = f"{partition}/zenodo-{record}"
            stable = {
                k: v
                for k, v in manifest.items()
                if k not in {"scenes", "native_schemas", "selection", "scope", "schema_version"}
            }
            available = manifest.get("selection", {}).get(
                "available_plots", len(manifest["scenes"])
            )
            if prefix not in groups:
                groups[prefix] = dict(
                    stable=stable,
                    plan=plan,
                    partition=partition,
                    scenes={},
                    native_schemas={},
                    available=available,
                )
            group = groups[prefix]
            if (
                stable != group["stable"]
                or plan != group["plan"]
                or available != group["available"]
            ):
                raise ValueError("Conflicting source profile or task plan between subsets")
            previous = group["scenes"].get(scene["id"])
            if previous is not None:
                if previous != scene:
                    raise ValueError("Conflicting duplicate scene between subsets")
                continue
            group["scenes"][scene["id"]] = copy.deepcopy(scene)
            key = scene["native_schema_ref"]
            native = manifest["native_schemas"][key]
            if key in group["native_schemas"] and group["native_schemas"][key] != native:
                raise ValueError("Conflicting native schema")
            group["native_schemas"][key] = copy.deepcopy(native)
            for chunk in scene["chunks"]:
                target = prefix + "/" + chunk["path"]
                if target in copies:
                    raise ValueError("Conflicting chunk destination")
                copies[target] = dict(input=index, path=chunk["path"], sha256=chunk["sha256"])
    if not groups:
        raise ValueError("No scene belongs to the task-permitted partitions")
    packages, documents = [], {}
    for prefix, group in sorted(groups.items()):
        scenes = sorted(group["scenes"].values(), key=lambda scene: scene["id"])
        manifest = dict(
            **group["stable"],
            schema_version="1.1.0",
            scenes=scenes,
            native_schemas=group["native_schemas"],
            selection=dict(
                kind="explicit-plots",
                paths=[s["path"] for s in scenes],
                available_plots=group["available"],
                archive_verification="Not performed by this selection; each selected LAS is SHA256 verified against the reviewed release",
            ),
            scope="Complete selected scenes in one preserved provider partition",
        )
        documents[prefix + "/task-package.json"] = manifest
        packages.append(
            dict(
                path=prefix,
                partition=group["partition"],
                source_ref=group["plan"]["source_ref"],
                pipeline_ref=group["plan"]["pipeline_ref"],
                plan=group["plan"],
                manifest_sha256=hashlib.sha256(encoded(manifest)).hexdigest(),
                scene_ids=[s["id"] for s in scenes],
            )
        )
    requirements = model["nodes"]["task:instances"]["data"]["requirements"]
    dataset = dict(
        schema_version="1.0.0",
        task_ref="task:instances",
        request=request,
        task_requirements_sha256=fingerprint(requirements),
        variables=copy.deepcopy(requirements["variables"]),
        identity_scope="source-release-and-scene",
        partition_policy="preserve-published",
        packages=packages,
        limitations=[
            "Storage blocks are not spatial training tiles",
            "Published partitions do not establish geographic independence",
            "Optional missing variables are omitted; no feature values are fabricated",
        ],
    )
    documents["dataset.json"] = dataset
    return dict(documents=documents, copies=copies)


class TaskDataset:
    """Validate all source packages, then stream a requested partition."""

    def __init__(self, root, model, *, profile=None):
        self.root = Path(root).resolve()
        self.model = model
        self.index_sha256 = sha_file(self.root / "dataset.json")
        self.manifest = read_json(self.root / "dataset.json")
        Draft202012Validator(read_json(SCHEMA)).validate(self.manifest)
        requirements = model["nodes"]["task:instances"]["data"]["requirements"]
        if self.manifest["variables"] != requirements["variables"] or self.manifest[
            "task_requirements_sha256"
        ] != fingerprint(requirements):
            raise ValueError("Dataset common variables differ from the reviewed task requirements")
        self.packages, seen_paths, seen_scenes = [], set(), set()
        for entry in self.manifest["packages"]:
            plan = check_plan(model, entry["plan"])
            request = {key: plan[key] for key in ("use", "variables")}
            record = plan["source_ref"].removeprefix("zenodo:")
            if (
                request != self.manifest["request"]
                or entry["path"] != f"{entry['partition']}/zenodo-{record}"
            ):
                raise ValueError("Dataset request or partition folder differs from its plan")
            if (
                entry["source_ref"] != plan["source_ref"]
                or entry["pipeline_ref"] != plan["pipeline_ref"]
                or entry["path"] in seen_paths
            ):
                raise ValueError("Duplicate or mismatched source package")
            seen_paths.add(entry["path"])
            root = inside(self.root, entry["path"])
            if sha_file(root / "task-package.json") != entry["manifest_sha256"]:
                raise ValueError("Source package manifest changed")
            package = TaskPackage(
                root, allow_selection=True, **({"profile": profile} if profile else {})
            )
            if sorted(package.scenes) != entry["scene_ids"]:
                raise ValueError("Dataset scene index differs from its source package")
            for scene in package.scenes.values():
                identity = (entry["source_ref"], scene["id"])
                if (
                    identity in seen_scenes
                    or scene["published_split"] != entry["partition"]
                    or scene["published_split"] not in plan["allowed_partitions"]
                ):
                    raise ValueError("Duplicate scene or incompatible published partition")
                seen_scenes.add(identity)
            self.packages.append((entry, package))
        self.validated = False

    def validate(self):
        self.validated = False
        if sha_file(self.root / "dataset.json") != self.index_sha256:
            raise ValueError("Dataset index changed after opening")
        reports = [
            validate_prepared(self.model, entry["plan"], package)
            for entry, package in self.packages
        ]
        if sha_file(self.root / "dataset.json") != self.index_sha256:
            raise ValueError("Dataset index changed during validation")
        self.validated = True
        return dict(
            status="validated",
            dataset_sha256=sha_file(self.root / "dataset.json"),
            schema_sha256=sha_file(SCHEMA),
            validator_sha256=sha_file(Path(__file__)),
            packages=len(reports),
            scenes=sum(r["package"]["plots"] for r in reports),
            points=sum(r["eligible_points"] for r in reports),
            partitions=sorted({entry["partition"] for entry, _ in self.packages}),
        )

    def iter_partition(self, partition):
        if not self.validated:
            raise ValueError("Validate the complete dataset before consuming training data")
        if sha_file(self.root / "dataset.json") != self.index_sha256:
            raise ValueError("Dataset index changed after validation")
        if partition not in {entry["partition"] for entry, _ in self.packages}:
            raise ValueError("Partition is absent from this dataset")
        for entry, package in self.packages:
            if entry["partition"] == partition:
                for block in iter_task_blocks(self.model, entry["plan"], package):
                    yield dict(source_ref=entry["source_ref"], **block)


def export_dataset(model, inputs, output, *, use="training", variables=None, profile=None):
    """Materialize new folders from validated prepared subsets; never overwrite."""
    roots = [Path(path).resolve() for path in inputs]
    output = Path(output).resolve()
    if output.exists() or any(output.is_relative_to(root) for root in roots):
        raise ValueError("Choose a new output directory outside all input packages")
    entries = []
    for root in roots:
        package = TaskPackage(
            root, allow_selection=True, **({"profile": profile} if profile else {})
        )
        plan = plan_request(model, package.manifest["source"]["record_id"], use, variables)
        validate_prepared(model, plan, package)
        entries.append(dict(plan=plan, manifest=package.manifest))
    layout = compose_layout(model, entries)
    output.mkdir(parents=True)
    marker = output / ".incomplete.json"
    marker.write_bytes(encoded(dict(status="incomplete")))
    for target, source in layout["copies"].items():
        path = inside(output, target)
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(inside(roots[source["input"]], source["path"]), path)
    for target, document in layout["documents"].items():
        path = inside(output, target)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(encoded(document))
    report = TaskDataset(output, model, profile=profile).validate()
    (output / "dataset-validation.json").write_bytes(encoded(report))
    marker.unlink()
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["export", "validate", "sample"])
    parser.add_argument("--input", type=Path, action="append", default=[])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--use", default="training", choices=["training", "evaluation", "inference"]
    )
    parser.add_argument("--partition")
    args = parser.parse_args(argv)
    from .knowledge_model import load

    model = load()
    if args.operation == "export":
        report = export_dataset(model, args.input, args.output, use=args.use)
    else:
        dataset = TaskDataset(args.output, model)
        report = dataset.validate()
        if args.operation == "sample":
            block = next(dataset.iter_partition(args.partition))
            report["sample"] = dict(
                scene_id=block["scene_id"],
                source_ref=block["source_ref"],
                arrays={
                    k: dict(shape=list(v.shape), dtype=str(v.dtype))
                    for k, v in block["arrays"].items()
                },
            )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
