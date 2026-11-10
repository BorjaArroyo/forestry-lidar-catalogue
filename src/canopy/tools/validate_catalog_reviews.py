"""Require evidence-backed admission records for added or changed datasets."""

import argparse
import hashlib
import json
import re
from datetime import date
from pathlib import Path
from ..paths import repository_root


def fingerprint(dataset):
    return hashlib.sha256(
        json.dumps(dataset, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def validate_metadata_correction(dataset, previous, catalog, base, review):
    """Allow bounded editorial reconciliation without granting scientific admission."""
    if (
        review.get("dataset_id") != dataset["id"]
        or review.get("decision") != "metadata-corrected"
        or review.get("base_dataset_sha256") != fingerprint(previous)
        or review.get("dataset_sha256") != fingerprint(dataset)
    ):
        raise ValueError("Metadata correction must bind the actual previous and final source")
    for field in ("reviewed_by", "reviewed_at", "scope", "evidence"):
        if not review.get(field):
            raise ValueError("Incomplete metadata correction: " + field)
    if date.fromisoformat(review["reviewed_at"]) > date.today():
        raise ValueError("Metadata correction date is in the future")
    editable = {
        "role",
        "readiness",
        "labels",
        "note",
        "correction",
        "provenance",
        "review",
        "discovery",
        "source_task_support",
        "tasks",
        "conditional",
    }
    if {k: v for k, v in dataset.items() if k not in editable} != {
        k: v for k, v in previous.items() if k not in editable
    }:
        raise ValueError(
            "Metadata corrections cannot change source identity, terms or measured observations"
        )
    if dataset["review"]["observations_snapshot"] != previous["review"]["observations_snapshot"]:
        raise ValueError("Metadata corrections cannot change historical observation evidence")
    old_discovery, discovery = previous["discovery"], dataset["discovery"]
    for key in ("unit",):
        if discovery[key] != old_discovery[key]:
            raise ValueError("Metadata corrections cannot change source units")
    for key, fields in {
        "preparation": ("status", "limited_reference_copy"),
        "instance_reference": ("status",),
    }.items():
        if any(discovery[key][field] != old_discovery[key][field] for field in fields):
            raise ValueError("Metadata corrections cannot change admission or reference status")
    old_support, support = previous["source_task_support"], dataset["source_task_support"]
    if set(old_support) != set(support):
        raise ValueError("Metadata corrections cannot add task support")
    for task, assessment in support.items():
        before, after = old_support[task]["status"], assessment["status"]
        if after != before and after != "not_documented":
            raise ValueError("New positive task claims require scientific admission")
    if any(not set(dataset[field]) <= set(previous[field]) for field in ("tasks", "conditional")):
        raise ValueError("Metadata corrections cannot expand task listings")

    def executable_tasks(value):
        return {
            task["id"]: {k: task[k] for k in ("requirements", "preparation_sources") if k in task}
            for task in value["tasks"]
        }

    if executable_tasks(catalog) != executable_tasks(base):
        raise ValueError(
            "Metadata corrections cannot change executable tasks or preparation admission"
        )


def validate(catalog, base, reviews):
    previous = {str(d["id"]): d for d in base["datasets"]}
    tasks = {t["id"] for t in catalog["tasks"]}
    ids = [str(d["id"]) for d in catalog["datasets"]]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate dataset IDs")
    required = [d for d in catalog["datasets"] if previous.get(str(d["id"])) != d]
    for dataset in required:
        identifier = str(dataset["id"])
        if not identifier.isdecimal() and not re.fullmatch(
            r"grodata-[1-9][0-9]*-[0-9]+\.[0-9]+", identifier
        ):
            raise ValueError("Dataset ID must be a numeric provider record ID")
        metadata_path = reviews / "metadata" / (identifier + ".json")
        if identifier in previous and metadata_path.exists():
            correction = json.loads(metadata_path.read_text())
            if correction.get("dataset_sha256") == fingerprint(dataset):
                validate_metadata_correction(
                    dataset, previous[identifier], catalog, base, correction
                )
                continue
        review = json.loads((reviews / (identifier + ".json")).read_text())
        if review.get("dataset_id") != identifier or review.get("dataset_sha256") != fingerprint(
            dataset
        ):
            raise ValueError(f"{identifier}: review does not match the dataset snapshot")
        if review.get("decision") != "admitted":
            raise ValueError(f"{identifier}: admission decision required")
        for field in ("reviewed_by", "proposal_url", "scope", "limitations"):
            if not isinstance(review.get(field), str) or not review[field].strip():
                raise ValueError(f"{identifier}: missing {field}")
        reviewed = date.fromisoformat(review["reviewed_at"])
        if reviewed > date.today():
            raise ValueError(f"{identifier}: review date is in the future")
        for field in ("provenance", "rights", "integrity", "schema", "coverage", "duplicates"):
            evidence = review.get("analysis", {}).get(field)
            if (
                not isinstance(evidence, dict)
                or not evidence.get("finding")
                or not evidence.get("evidence")
            ):
                raise ValueError(f"{identifier}: missing {field} analysis/evidence")
        assessments = review.get("tasks", {})
        if set(assessments) != tasks:
            raise ValueError(f"{identifier}: assess every catalog task, including unknown cases")
        for task, assessment in assessments.items():
            if (
                assessment.get("status")
                not in {"supported", "conditional", "unsupported", "unknown"}
                or not assessment.get("rationale")
                or not assessment.get("evidence")
            ):
                raise ValueError(f"{identifier}: incomplete assessment for {task}")
    return len(required)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    root = repository_root()
    parser.add_argument("--catalog", type=Path, default=root / "data/catalog.json")
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--reviews", type=Path, default=root / "reviews")
    args = parser.parse_args(argv)
    count = validate(
        json.loads(args.catalog.read_text()), json.loads(args.base.read_text()), args.reviews
    )
    print(f"Validated source review records for {count} added or changed datasets")


if __name__ == "__main__":
    main()
