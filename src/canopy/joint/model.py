"""Frozen plans for two reference targets on the same native plot observation."""

import copy
import hashlib
import json
from pathlib import Path

from canopy.classification.canonical import fingerprint
from canopy.paths import repository_root
from canopy.joint.source import PIPELINE, SOURCE

TASKS = ["task:instances", "task:species"]
FORMAT = "joint-tree-reference:1.0.0"
LABEL_LEVELS = ("species", "genus", "leaf_group")
LIMITATIONS = [
    "Only listed, completely audited plots are executable; this is not whole-release admission.",
    "Selected cloud hashes are checked; whole provider ZIP checksums are unchecked.",
    "All points remain in native order. Crown and reference filters change target eligibility only.",
    "Native treeID zero is retained with unavailable instance reference; it is not certified background.",
    "Tree taxonomy is not broadcast to points. Point-to-tree links are reference relationships, not model inputs.",
    "No provider split is admitted. All plots remain unassigned; no independent evaluation is claimed.",
    "Native XYZ is preserved without coordinate, unit or height-datum harmonization.",
]


def load_source(path=None):
    path = Path(path) if path else repository_root() / "data/joint/source-lock.json"
    source = json.loads(path.read_text())
    validate_source(source)
    return source


def validate_source(source):
    if (
        source.get("schema_version") != "1.0.0"
        or source.get("source_ref") != SOURCE
        or source.get("pipeline_ref") != PIPELINE
    ):
        raise ValueError("Unsupported joint source registry")
    paths = [plot["path"] for plot in source["plots"]]
    if not paths or len(set(paths)) != len(paths):
        raise ValueError("Duplicate or empty joint plot scope")
    codes = [row["native_code"] for row in source["taxonomy"]]
    if len(codes) != len(set(codes)) or any(type(code) is not int or code <= 0 for code in codes):
        raise ValueError("Invalid joint taxonomic lookup")
    for plot in source["plots"]:
        if Path(plot["path"]).name != plot["path"] or any(c in plot["path"] for c in "\\:\x00"):
            raise ValueError("Unsafe joint plot path")
        ids = [tree["native_id"] for tree in plot["trees"]]
        if ids != sorted(set(ids)) or any(type(i) is not int or i <= 0 for i in ids):
            raise ValueError("Invalid joint tree identities")
        if any(
            t["native_code"] not in [0, *codes] or type(t["complete_crown"]) is not bool
            for t in plot["trees"]
        ):
            raise ValueError("Unmapped joint reference")
        if plot["published_split"] != "unassigned":
            raise ValueError("No reviewed provider partition exists for TreeScan")
        offset = 0
        for block in plot["chunks"]:
            if block["offset"] != offset or not 0 < block["points"] <= 250000:
                raise ValueError("Noncontiguous audited native blocks")
            offset += block["points"]
        if (
            offset != plot["points"]
            or sum(t["points"] for t in plot["trees"]) + plot["unassigned_points"] != offset
        ):
            raise ValueError("Joint point/tree coverage mismatch")
    return source


def require_admitted(source):
    admission = source.get("admission", {})
    if admission.get("status") != "admitted" or not admission.get("authorization"):
        raise ValueError(
            "Maintainer scientific admission is required for the audited joint scope (CONTRIBUTING.md)"
        )
    scope = {key: value for key, value in source.items() if key != "admission"}
    if admission.get("source_scope_sha256") != fingerprint(scope) or sorted(
        admission.get("approved_plots", [])
    ) != sorted(plot["path"] for plot in source["plots"]):
        raise ValueError(
            "Joint admission does not cover this source scope; maintainer review is required"
        )


def tree_table(source, plot, request):
    mapping = {row["native_code"]: row for row in source["taxonomy"]}
    names = sorted(
        {row[request["target"]] for row in mapping.values() if row[request["target"]] is not None}
    )
    table = []
    for native in plot["trees"]:
        reference = mapping.get(native["native_code"], {})
        taxon = reference.get(request["target"])
        valid = taxon is not None
        selected = not request["complete_crowns"] or native["complete_crown"]
        table.append(
            dict(
                **native,
                key=SOURCE + "/" + plot["path"] + "/" + str(native["native_id"]),
                taxonomy=names.index(taxon) if valid else -1,
                taxonomy_valid=valid,
                labels={
                    level: dict(value=reference.get(level), valid=reference.get(level) is not None)
                    for level in LABEL_LEVELS
                },
                taxonomy_unavailable_reason=""
                if valid
                else "unknown_native_reference"
                if native["native_code"] == 0
                else "coarser_rank",
                instance_eligible=selected and (request["policy"] == "partial" or valid),
                taxonomy_eligible=selected and valid,
            )
        )
    return table


def resolve(source, request, *, runtime_sha256):
    validate_source(source)
    if not isinstance(request, dict) or set(request) != {
        "plots",
        "target",
        "policy",
        "complete_crowns",
    }:
        raise ValueError(
            "Joint request must declare plots, classification target, reference policy and crown filter"
        )
    if (
        request["target"] not in LABEL_LEVELS
        or request["policy"] not in {"partial", "joint"}
        or type(request["complete_crowns"]) is not bool
    ):
        raise ValueError(
            "Choose an explicit joint reference policy and supported classification target"
        )
    paths = request["plots"]
    if (
        not isinstance(paths, list)
        or not 1 <= len(paths) <= 50
        or any(not isinstance(p, str) for p in paths)
        or len(set(paths)) != len(paths)
    ):
        raise ValueError("Select between one and 50 unique audited plots")
    by_path = {plot["path"]: plot for plot in source["plots"]}
    if any(path not in by_path for path in paths):
        raise ValueError("Selection contains an unaudited joint plot")
    if (
        not isinstance(runtime_sha256, str)
        or len(runtime_sha256) != 64
        or any(c not in "0123456789abcdef" for c in runtime_sha256)
    ):
        raise ValueError("A pinned execution runtime is required")
    request = copy.deepcopy(request)
    request["plots"] = sorted(paths)
    plots = [copy.deepcopy(by_path[path]) for path in request["plots"]]
    trees = [tree for plot in plots for tree in tree_table(source, plot, request)]
    if not any(tree["taxonomy_eligible"] for tree in trees):
        raise ValueError("The selection has no eligible taxonomic reference at the requested rank")
    prepared = sum(
        p["points"] * (p["native_schema"]["point_record_length"] + 42) + len(p["chunks"]) * 65536
        for p in plots
    )
    names = sorted(
        {row[request["target"]] for row in source["taxonomy"] if row[request["target"]] is not None}
    )
    plan = dict(
        schema_version="1.0.0",
        format=FORMAT,
        task_refs=TASKS.copy(),
        source_ref=SOURCE,
        pipeline_ref=PIPELINE,
        source_lock_sha256=fingerprint(source),
        runtime_sha256=runtime_sha256,
        request=request,
        plots=plots,
        taxonomy=copy.deepcopy(source["taxonomy"]),
        vocabulary=names,
        vocabularies={
            level: sorted({row[level] for row in source["taxonomy"] if row[level] is not None})
            for level in LABEL_LEVELS
        },
        archives=[
            copy.deepcopy(a)
            for a in source["archives"]
            if a["name"] in {p["archive"] for p in plots}
        ],
        totals=dict(
            plots=len(plots),
            points=sum(p["points"] for p in plots),
            trees=len(trees),
            taxonomy_valid=sum(t["taxonomy_valid"] for t in trees),
            instance_eligible=sum(t["instance_eligible"] for t in trees),
            taxonomy_eligible=sum(t["taxonomy_eligible"] for t in trees),
            source_bytes=sum(p["size_bytes"] for p in plots),
            estimated_browser_storage_bytes=2 * prepared
            + max(p["size_bytes"] for p in plots)
            + 64 * 1024**2,
        ),
        partition_policy="unassigned-no-reviewed-provider-split",
        sample_unit="plot-observation",
        limitations=LIMITATIONS.copy(),
    )
    plan["plan_sha256"] = fingerprint(plan)
    return plan


def check(source, plan, *, runtime_sha256):
    expected = resolve(source, plan["request"], runtime_sha256=runtime_sha256)
    if plan != expected:
        raise ValueError("Joint plan changed or its pinned dependencies are stale; review again")
    return plan


def check_embedded(plan):
    """Check a historical plan without granting admission or requiring today's pins."""
    value = dict(plan)
    claimed = value.pop("plan_sha256", None)
    if (
        plan.get("format") != FORMAT
        or plan.get("task_refs") != TASKS
        or fingerprint(value) != claimed
    ):
        raise ValueError("Corrupt or unsupported embedded joint plan")
    source = dict(
        schema_version="1.0.0",
        source_ref=SOURCE,
        pipeline_ref=PIPELINE,
        taxonomy=plan["taxonomy"],
        plots=plan["plots"],
        archives=plan["archives"],
    )
    expected = resolve(source, plan["request"], runtime_sha256=plan["runtime_sha256"])
    # A historical plan pins the complete admitted scope, not only its selection.
    expected["source_lock_sha256"] = plan["source_lock_sha256"]
    expected["plan_sha256"] = fingerprint({k: v for k, v in expected.items() if k != "plan_sha256"})
    if expected != plan:
        raise ValueError("Inconsistent embedded joint selection")
    return plan


def native_runtime_sha256():
    root = Path(__file__).parent
    return fingerprint(
        {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.glob("*.py"))}
    )
