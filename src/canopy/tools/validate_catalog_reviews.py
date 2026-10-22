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
    print(f"Validated admission evidence for {count} added or changed datasets")


if __name__ == "__main__":
    main()
