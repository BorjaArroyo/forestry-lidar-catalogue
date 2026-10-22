"""Freeze a reviewed public-source selection before any payload download.

Plans identify inputs and audited code; they do not certify annotation quality,
geographic independence, or successful execution. No point transformation lives here.
"""

import hashlib
import json
from pathlib import Path

import jsonschema

from .paths import repository_root
from .task_plan import check_plan, fingerprint, plan_request

ROOT = repository_root()
PLOT_FIELDS = ("path", "sha256", "points", "size_bytes", "published_split")
LIMITATIONS = [
    "Source LAS bytes are not compressed network download bytes",
    "Browser storage is an estimate including prepared blocks, ZIP export and one staged LAS",
    "Selected LAS checksums are verified; the whole provider archive is not verified",
    "Published partitions are preserved; geographic independence is not established",
    "No claim of annotation correctness or an audited article scoring protocol",
]


def resolve(
    model,
    source,
    *,
    source_lock_path,
    source_lock_sha256,
    runtime_lock_sha256,
    use,
    variables,
    subsets,
):
    """Resolve subset paths against current, integrity-checked source membership."""
    task = plan_request(model, source["record_id"], use, variables)
    check_plan(model, task)
    if not isinstance(subsets, list) or not 1 <= len(subsets) <= 50:
        raise ValueError("Choose between one and 50 subsets")
    normalized = []
    for paths in subsets:
        if (
            not isinstance(paths, list)
            or not paths
            or len(paths) > 10000
            or any(not isinstance(p, str) or not p or len(p) > 2048 for p in paths)
        ):
            raise ValueError("Each subset requires reviewed plot paths")
        if len(set(paths)) != len(paths):
            raise ValueError("Repeated path within one subset")
        normalized.append(sorted(paths))
    by_path = {p["path"]: p for p in source["plots"]}
    if len(by_path) != len(source["plots"]):
        raise ValueError("Source membership has duplicate paths")
    paths = sorted({p for subset in normalized for p in subset})
    if any(p not in by_path for p in paths):
        raise ValueError("Selection contains an unreviewed plot")
    plots = [{key: by_path[path][key] for key in PLOT_FIELDS} for path in paths]
    if any(p["published_split"] not in task["allowed_partitions"] for p in plots):
        raise ValueError("Selection contains a partition excluded for this task use")
    # Match the bounded browser producer: native records + derived arrays + NPZ overhead.
    prepared = prepared_bytes(task, plots)
    plan = dict(
        schema_version="1.0.0",
        task_plan=task,
        intake=dict(
            kind="zenodo-ranges",
            source_lock_path=source_lock_path,
            source_lock_sha256=source_lock_sha256,
            runtime_lock_sha256=runtime_lock_sha256,
        ),
        subsets=normalized,
        plots=plots,
        totals=dict(
            plots=len(plots),
            points=sum(p["points"] for p in plots),
            source_las_bytes=sum(p["size_bytes"] for p in plots),
            overlapping_selections=sum(map(len, normalized)) - len(plots),
            estimated_browser_storage_bytes=2 * prepared
            + max(p["size_bytes"] for p in plots)
            + 64 * 1024**2,
        ),
        output=dict(
            schema="task-dataset:1.0.0",
            partitions=sorted({p["published_split"] for p in plots}),
            identity_scope="source-release-and-scene",
            partition_policy="preserve-published",
        ),
        limitations=LIMITATIONS.copy(),
    )
    plan["plan_sha256"] = fingerprint(plan)
    _validate_schema(plan)
    return plan


def _validate_schema(plan):
    schema = json.loads((ROOT / "schemas/dataset-plan.schema.json").read_text())
    jsonschema.Draft202012Validator(schema).validate(plan)


def check(model, source, plan, *, source_lock_path, source_lock_sha256, runtime_lock_sha256):
    """Reject modified or stale plans, including changed code/runtime/source pins."""
    _validate_schema(plan)
    expected = resolve(
        model,
        source,
        source_lock_path=source_lock_path,
        source_lock_sha256=source_lock_sha256,
        runtime_lock_sha256=runtime_lock_sha256,
        use=plan["task_plan"]["use"],
        variables=plan["task_plan"]["variables"],
        subsets=plan["subsets"],
    )
    if plan != expected:
        raise ValueError(
            "Dataset plan changed or its reviewed dependencies are no longer current; review again"
        )
    return plan


def check_manifest(plan, manifest):
    """Check complete selected coverage in addition to independent payload validation."""
    actual = [
        {key: scene[key] for key in PLOT_FIELDS if key != "size_bytes"}
        for scene in manifest["scenes"]
    ]
    expected = [
        {key: plot[key] for key in PLOT_FIELDS if key != "size_bytes"} for plot in plan["plots"]
    ]
    if sorted(actual, key=lambda p: p["path"]) != expected:
        raise ValueError("Prepared scene coverage differs from the frozen dataset plan")
    if (
        "zenodo:" + str(manifest["source"]["record_id"]) != plan["task_plan"]["source_ref"]
        or "pipeline:" + manifest["pipeline"] != plan["task_plan"]["pipeline_ref"]
    ):
        raise ValueError("Prepared source or pipeline differs from the frozen dataset plan")
    return dict(
        status="matched",
        plan_sha256=plan["plan_sha256"],
        manifest_sha256=fingerprint(manifest),
        validator_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    )


def prepared_bytes(task, plots):
    derived = {
        "pipeline:for-instance-plot-instances:1.0.0": 34,
        "pipeline:fgi-emit-plot-instances:1.0.0": 49,
    }[task["pipeline_ref"]]
    return sum(
        p["size_bytes"] + p["points"] * derived + ((p["points"] + 249999) // 250000) * 65536
        for p in plots
    )


def source_plans(plan):
    """Expose a checked legacy plan or a combined plan through one interface."""
    return [plan] if plan["schema_version"] == "1.0.0" else plan["source_plans"]


def resolve_dataset(model, contexts, *, use, variables, subsets, runtime_lock_sha256):
    """Freeze all selected sources against one common task request."""
    if not isinstance(subsets, list) or not 1 <= len(subsets) <= 50:
        raise ValueError("Choose between one and 50 subsets")
    groups = {}
    for subset in subsets:
        if not isinstance(subset, dict) or set(subset) != {"record_id", "paths"}:
            raise ValueError("Each subset requires a reviewed source and paths")
        record = subset["record_id"]
        if not isinstance(record, str) or record not in contexts:
            raise ValueError("Selection contains an unreviewed source")
        groups.setdefault(record, []).append(subset["paths"])
    plans = []
    for record, paths in sorted(groups.items()):
        context = contexts[record]
        if str(context["source"]["record_id"]) != record:
            raise ValueError("Source context belongs to another release")
        try:
            plans.append(
                resolve(
                    model,
                    context["source"],
                    source_lock_path=context["source_lock_path"],
                    source_lock_sha256=context["source_lock_sha256"],
                    runtime_lock_sha256=runtime_lock_sha256,
                    use=use,
                    variables=variables,
                    subsets=paths,
                )
            )
        except (ValueError, KeyError) as error:
            raise ValueError(f"zenodo:{record}: {error}") from error
    request = {key: plans[0]["task_plan"][key] for key in ("use", "variables")}
    if any({key: p["task_plan"][key] for key in request} != request for p in plans):
        raise ValueError("Sources must share one task request")
    plots = [plot for p in plans for plot in p["plots"]]
    totals = {
        key: sum(p["totals"][key] for p in plans)
        for key in ("plots", "points", "source_las_bytes", "overlapping_selections")
    }
    totals["sources"] = len(plans)
    totals["estimated_browser_storage_bytes"] = (
        2 * sum(prepared_bytes(p["task_plan"], p["plots"]) for p in plans)
        + max(p["size_bytes"] for p in plots)
        + 64 * 1024**2
    )
    plan = dict(
        schema_version="2.0.0",
        task_ref="task:instances",
        request=request,
        runtime_lock_sha256=runtime_lock_sha256,
        source_plans=plans,
        totals=totals,
        output=dict(
            schema="task-dataset:1.0.0",
            partitions=sorted({p["published_split"] for p in plots}),
            identity_scope="source-release-and-scene",
            partition_policy="preserve-published",
        ),
        limitations=LIMITATIONS.copy(),
    )
    plan["plan_sha256"] = fingerprint(plan)
    _validate_schema(plan)
    return plan


def check_dataset(model, contexts, plan, *, runtime_lock_sha256):
    """Rebuild every source and global total; no stale dependency is repaired."""
    _validate_schema(plan)
    if plan["schema_version"] == "1.0.0":
        record = plan["task_plan"]["source_ref"].removeprefix("zenodo:")
        if record not in contexts:
            raise ValueError("Plan contains an unreviewed source")
        context = contexts[record]
        return check(
            model,
            context["source"],
            plan,
            source_lock_path=context["source_lock_path"],
            source_lock_sha256=context["source_lock_sha256"],
            runtime_lock_sha256=runtime_lock_sha256,
        )
    subsets = [
        dict(record_id=p["task_plan"]["source_ref"].removeprefix("zenodo:"), paths=paths)
        for p in plan["source_plans"]
        for paths in p["subsets"]
    ]
    expected = resolve_dataset(
        model,
        contexts,
        use=plan["request"]["use"],
        variables=plan["request"]["variables"],
        subsets=subsets,
        runtime_lock_sha256=runtime_lock_sha256,
    )
    if plan != expected:
        raise ValueError(
            "Combined dataset plan changed or its dependencies are no longer current; review again"
        )
    return plan


def check_manifests(plan, manifests):
    """Require every planned source exactly once, with complete scene coverage."""
    expected = {p["task_plan"]["source_ref"]: p for p in source_plans(plan)}
    records = ["zenodo:" + str(m["source"]["record_id"]) for m in manifests]
    if len(records) != len(set(records)) or set(records) != set(expected):
        raise ValueError("Prepared sources differ from the frozen dataset plan")
    reports = [
        dict(source_ref=record, **check_manifest(expected[record], manifest))
        for record, manifest in sorted(zip(records, manifests))
    ]
    return dict(
        status="matched",
        plan_sha256=plan["plan_sha256"],
        source_validations=reports,
        validator_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    )
