"""Classification contracts, exact taxonomy, identities and frozen v3 plans.

No segmentation masks, label propagation, coordinate transforms or generated
partitions belong to this task. An observation is a complete native sensor view.
"""

from canopy.classification.dataio import artifact_bytes
from canopy.classification.dataio import read_json

import copy
import hashlib
import json
from pathlib import Path

from canopy.classification.source_identity import source_ref
from canopy.classification.canonical import fingerprint
from canopy.classification.snapshot import HERE

TASK = "task:species"
SCHEMA = "3.0.0"
PARTITIONS = {
    "training": ["dev", "train"],
    "validation": ["validate"],
    "evaluation": ["test"],
    "inference": ["dev", "train", "validate", "test", "unassigned"],
}
OBSERVATION_FIELDS = {
    "source_ref",
    "tree_id",
    "observation_id",
    "modality",
    "path",
    "archive",
    "size_bytes",
    "sha256",
    "points",
    "point_record_length",
    "native_records_sha256",
    "published_split",
    "collection",
}


def safe_path(path):
    if (
        not isinstance(path, str)
        or not path
        or "\\" in path
        or "\x00" in path
        or ":" in path
        or path.startswith("/")
        or any(p in {"", ".", ".."} for p in path.rstrip("/").split("/"))
    ):
        raise ValueError("UNSAFE_PATH: " + str(path))
    return path


def validate_vocabulary(vocabulary):
    if vocabulary.get("schema_version") != "1.0.0" or vocabulary.get("ranks") != [
        "genus",
        "species",
    ]:
        raise ValueError("UNSUPPORTED_VOCABULARY")
    taxa = {t["id"]: t for t in vocabulary["taxa"]}
    if len(taxa) != len(vocabulary["taxa"]) or len({t["code"] for t in taxa.values()}) != len(taxa):
        raise ValueError("DUPLICATE_TAXON")
    for taxon in taxa.values():
        if taxon["rank"] == "species":
            if taxon["parent_id"] not in taxa or taxa[taxon["parent_id"]]["rank"] != "genus":
                raise ValueError("UNKNOWN_TAXON_ANCESTOR")
        elif taxon["rank"] != "genus" or taxon["parent_id"] is not None:
            raise ValueError("UNDOCUMENTED_TAXON_RANK")
    mappings = {}
    for mapping in vocabulary["mappings"]:
        key = (source_ref(mapping["source_ref"]), mapping["native_label"])
        if key in mappings:
            raise ValueError("DUPLICATE_TAXON_MAPPING")
        for rank in vocabulary["ranks"]:
            ref = mapping[rank]
            if ref is not None and (ref not in taxa or taxa[ref]["rank"] != rank):
                raise ValueError("INVALID_TAXON_MAPPING")
        if (
            mapping["species"] is not None
            and taxa[mapping["species"]]["parent_id"] != mapping["genus"]
        ):
            raise ValueError("CONFLICTING_TAXON_ANCESTRY")
        mappings[key] = mapping
    return taxa, mappings


def load_registry(root=HERE, *, model=None):
    root = Path(root)
    registry = read_json(root / "source-lock.json")
    artifacts = {}
    for key in ["vocabulary", "trees"]:
        entry = registry[key]
        path = root / Path(entry["path"]).name
        data = artifact_bytes(path)
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError("SOURCE_TABLE_CHANGED: " + key)
        artifacts[key] = json.loads(data)
    if model is None:
        from canopy.knowledge_model import load

        model = load()
    registry = apply_admission(registry, model)
    validate_registry(registry, artifacts["vocabulary"], artifacts["trees"]["trees"])
    for source in registry["sources"]:
        entry = source["label_table"]
        data = (root / "sources" / Path(entry["path"]).name).read_bytes()
        if len(data) != entry["size_bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError("SOURCE_TABLE_CHANGED: " + entry["path"])
    return registry, artifacts["vocabulary"], artifacts["trees"]["trees"]


def validate_registry(registry, vocabulary, trees):
    if registry.get("schema_version") != "1.0.0" or registry.get("task_ref") != TASK:
        raise ValueError("UNSUPPORTED_CLASSIFICATION_REGISTRY")
    taxa, mappings = validate_vocabulary(vocabulary)
    sources, identities = {}, {}
    for source in registry["sources"]:
        ref = source_ref(source["source_ref"])
        if ref in sources:
            raise ValueError("DUPLICATE_SOURCE")
        sources[ref] = source
        if source["execution_enabled"] and (
            source["status"] != "validated"
            or source.get("blockers")
            or source.get("native_audit", {}).get("status") != "validated"
            or source.get("browser_acceptance", {}).get("status") != "validated"
        ):
            raise ValueError("SOURCE_NOT_AUDITED: " + ref)
    for tree in trees:
        identity = (tree["source_ref"], tree["tree_id"])
        if identity in identities or identity[0] not in sources or not identity[1]:
            raise ValueError("DUPLICATE_OR_UNKNOWN_TREE")
        identities[identity] = tree
        mapping = (
            mappings.get((identity[0], tree["native_label"]))
            if tree["native_label"] is not None
            else None
        )
        for rank in vocabulary["ranks"]:
            expected = mapping[rank] if mapping else None
            if tree["taxonomy"][rank] != expected or tree["reference_valid"][rank] is not (
                expected is not None
            ):
                raise ValueError("ALTERED_TREE_TAXONOMY")
        if tree["published_split"] not in PARTITIONS["inference"]:
            raise ValueError("UNKNOWN_PUBLISHED_PARTITION")
    observations, files = set(), set()
    for ref, source in sources.items():
        for observation in source["observations"]:
            if not OBSERVATION_FIELDS <= set(observation):
                raise ValueError("INCOMPLETE_OBSERVATION_AUDIT")
            identity = (ref, observation["tree_id"])
            tree = identities.get(identity)
            if observation["source_ref"] != ref or tree is None:
                raise ValueError("UNKNOWN_OBSERVATION_TREE")
            safe_path(observation["path"])
            obs_id = (ref, observation["observation_id"])
            file_id = (ref, observation["archive"], observation["path"])
            if obs_id in observations or file_id in files:
                raise ValueError("DUPLICATE_OBSERVATION")
            observations.add(obs_id)
            files.add(file_id)
            if observation["modality"] not in source["modalities"] or any(
                observation[k] != tree[k] for k in ["published_split", "collection"]
            ):
                raise ValueError("OBSERVATION_MEMBERSHIP_MISMATCH")
            if (
                not isinstance(observation["points"], int)
                or observation["points"] <= 0
                or observation["size_bytes"] <= 0
            ):
                raise ValueError("INVALID_OBSERVATION_TOTALS")
            if observation["point_record_length"] < 20 or observation["point_record_length"] > 256:
                raise ValueError("UNSUPPORTED_POINT_RECORD_LENGTH")
    return sources, identities


def descendants(vocabulary, selected):
    taxa, _ = validate_vocabulary(vocabulary)
    if any(t not in taxa for t in selected):
        raise ValueError("UNKNOWN_TAXON")
    return set(selected) | {t["id"] for t in taxa.values() if t["parent_id"] in selected}


def select(registry, vocabulary, trees, *, use, rank="species", filters):
    """Return available audited observations and explicit per-tree exclusions."""
    if use not in PARTITIONS or rank not in vocabulary["ranks"]:
        raise ValueError("UNKNOWN_CLASSIFICATION_REQUEST")
    sources, identities = validate_registry(registry, vocabulary, trees)
    selected, exclusions = {}, []
    by_tree = {}
    for source in sources.values():
        for observation in source["observations"]:
            by_tree.setdefault((observation["source_ref"], observation["tree_id"]), []).append(
                observation
            )
    for subset in filters:
        ref = source_ref(subset["source_ref"])
        if ref not in sources:
            raise ValueError("UNKNOWN_SOURCE")
        source = sources[ref]
        modes = subset["modalities"]
        if (
            not modes
            or len(modes) != len(set(modes))
            or not set(modes) <= set(source["modalities"])
        ):
            raise ValueError("UNKNOWN_MODALITY")
        taxa = descendants(vocabulary, subset.get("taxa", []))
        for identity, tree in identities.items():
            if (
                identity[0] != ref
                or tree["collection"] not in subset["collections"]
                or tree["published_split"] not in subset["partitions"]
            ):
                continue
            if subset.get("tree_ids") and tree["tree_id"] not in subset["tree_ids"]:
                continue
            if taxa and not any(t in taxa for t in tree["taxonomy"].values()):
                continue
            reason = (
                "PARTITION_EXCLUDED"
                if tree["published_split"] not in PARTITIONS[use]
                else "REFERENCE_UNAVAILABLE"
                if use != "inference" and not tree["reference_valid"][rank]
                else None
            )
            required_modes = (
                set(modes)
                if source.get("modality_policy") == "paired-views"
                else set(modes) & set(tree["modalities"])
            )
            if not required_modes:
                continue
            views = [o for o in by_tree.get(identity, []) if o["modality"] in required_modes]
            if not reason and set(o["modality"] for o in views) != required_modes:
                reason = "COMMITTED_MODALITY_MISSING"
            if reason:
                exclusions.append(dict(source_ref=ref, tree_id=tree["tree_id"], reason=reason))
            else:
                for view in views:
                    selected[ref, view["observation_id"]] = copy.deepcopy(view)
    return sorted(
        selected.values(), key=lambda o: (o["source_ref"], o["observation_id"])
    ), exclusions


def resolve(
    registry, vocabulary, trees, *, use, rank="species", filters, runtime_sha256, code_sha256
):
    if not isinstance(filters, list) or not 1 <= len(filters) <= 50:
        raise ValueError("INVALID_CLASSIFICATION_SELECTION")
    observations, exclusions = select(
        registry, vocabulary, trees, use=use, rank=rank, filters=filters
    )
    if not observations:
        raise ValueError("NO_AUDITED_OBSERVATIONS: review source WIP and selection exclusions")
    refs = sorted({o["source_ref"] for o in observations})
    sources = {s["source_ref"]: s for s in registry["sources"]}
    for ref in refs:
        if not sources[ref]["execution_enabled"]:
            raise ValueError("SOURCE_WIP: " + ref)
    selected_trees = [
        copy.deepcopy(t)
        for t in trees
        if (t["source_ref"], t["tree_id"])
        in {(o["source_ref"], o["tree_id"]) for o in observations}
    ]
    archives = []
    for ref in refs:
        wanted = {o["archive"] for o in observations if o["source_ref"] == ref}
        for asset in sources[ref]["assets"]:
            if asset["name"] in wanted:
                archives.append(
                    dict(
                        source_ref=ref,
                        **asset,
                        traversal="sequential-complete"
                        if asset["name"].endswith(".tar.zst")
                        else "selective-zip",
                    )
                )
        if wanted != {a["name"] for a in archives if a["source_ref"] == ref}:
            raise ValueError("UNKNOWN_ARCHIVE")
    prepared = sum(
        o["points"] * (o["point_record_length"] + 24) + o["size_bytes"] + 1048576
        for o in observations
    )
    largest = max(o["size_bytes"] for o in observations)
    block_bytes = max(
        min(o["points"], 250000) * (o["point_record_length"] + 24) for o in observations
    )
    plan = dict(
        schema_version=SCHEMA,
        task_ref=TASK,
        request=dict(use=use, rank=rank),
        filters=copy.deepcopy(filters),
        observations=observations,
        trees=selected_trees,
        vocabulary=copy.deepcopy(vocabulary),
        vocabulary_sha256=fingerprint(vocabulary),
        source_dependencies={ref: fingerprint(sources[ref]) for ref in refs},
        runtime_sha256=runtime_sha256,
        code_sha256=code_sha256,
        archives=archives,
        exclusions=exclusions,
        totals=dict(
            trees=len(selected_trees),
            observations=len(observations),
            points=sum(o["points"] for o in observations),
            sequential_download_bytes=sum(
                a["size_bytes"] for a in archives if a["traversal"] == "sequential-complete"
            ),
            estimated_browser_storage_bytes=2 * prepared + largest + 64 * 1024**2,
            estimated_worker_memory_bytes=2 * largest + 2 * block_bytes + 128 * 1024**2,
        ),
        output=dict(
            schema="tree-classification-dataset:1.0.0",
            partitions=sorted({o["published_split"] for o in observations}),
            identity_scope="source-release/tree/sensor-observation",
            partition_policy="preserve-published",
        ),
        rights={
            ref: dict(license=sources[ref]["license"], url=sources[ref]["url"]) for ref in refs
        },
        spatial_audit=dict(
            shared_plots=shared_plots(selected_trees),
            independence="not-demonstrated",
            source_scope_cloud_duplicates={
                ref: copy.deepcopy(
                    sources[ref]
                    .get("native_audit", {})
                    .get("summary", {})
                    .get("byte_identical_cloud_groups", [])
                )
                for ref in refs
                if sources[ref]
                .get("native_audit", {})
                .get("summary", {})
                .get("byte_identical_cloud_groups")
            },
        ),
        limitations=[
            "Sensor views are separate; coordinates are not fused or assumed aligned",
            "Native traits are provenance, not automatic model inputs",
            "Duplicate cloud bytes do not transfer labels or merge provider identities; published partitions remain unchanged",
            "All sequential archive bytes must be verified before ZIP validation",
            "Selective ZIP intake verifies members; whole-provider ZIP checksum remains unchecked",
        ],
    )
    plan["plan_sha256"] = fingerprint(plan)
    return plan


def shared_plots(trees):
    groups = {}
    for t in trees:
        if t["published_split"] != "unassigned":
            groups.setdefault((t["source_ref"], t["collection"]), set()).add(t["published_split"])
    return [
        dict(source_ref=ref, collection=plot, partitions=sorted(parts))
        for (ref, plot), parts in sorted(groups.items())
        if len(parts) > 1
    ]


def check(registry, vocabulary, trees, plan, *, runtime_sha256, code_sha256):
    if plan.get("schema_version") != SCHEMA or plan.get("task_ref") != TASK:
        raise ValueError("PLAN_REVIEW_REQUIRED: legacy plans retain their original task reader")
    expected = resolve(
        registry,
        vocabulary,
        trees,
        **plan["request"],
        filters=plan["filters"],
        runtime_sha256=runtime_sha256,
        code_sha256=code_sha256,
    )
    if plan != expected:
        raise ValueError(
            "PLAN_REVIEW_REQUIRED: source, taxonomy, selection, code or runtime changed"
        )
    return plan


def apply_admission(registry, model):
    """Derive execution gates exclusively from the reviewed canonical graph."""
    registry = copy.deepcopy(registry)
    for source in registry["sources"]:
        routes = [
            node["data"]
            for node in model["nodes"].values()
            if node["type"] == "pipeline_spec"
            and node["data"]["task_ref"] == TASK
            and node["data"]["source_ref"] == source["source_ref"]
        ]
        enabled = [route for route in routes if route["execution_enabled"]]
        if len(enabled) > 1:
            raise ValueError("AMBIGUOUS_CLASSIFICATION_PIPELINE")
        source["execution_enabled"] = bool(enabled)
        source["status"] = "validated" if enabled else "wip"
        source["blockers"] = (
            [] if enabled else ["Maintainer source admission required by CONTRIBUTING.md"]
        )
    return registry
