"""Classification plans, independent readers and metadata evidence auditing."""

from canopy.classification.dataio import artifact_bytes
from canopy.classification.dataio import read_json

import argparse
import hashlib
import json
from pathlib import Path
from canopy.paths import repository_root


def audit_metadata():
    from .model import load_registry

    registry, vocabulary, trees = load_registry()
    root = repository_root()
    findings = []
    for source in registry["sources"]:
        for field in ["native_audit", "browser_acceptance"]:
            evidence = source[field]
            entries = (
                [evidence]
                if "path" in evidence
                else [v for v in evidence.values() if isinstance(v, dict) and "path" in v]
            )
            for entry in entries:
                path = (root / entry["path"]).resolve()
                if (
                    not path.is_relative_to(root)
                    or hashlib.sha256(artifact_bytes(path)).hexdigest() != entry["sha256"]
                ):
                    raise ValueError("AUDIT_EVIDENCE_CHANGED: " + entry["path"])
        summary = source["native_audit"]["summary"]
        selected = [tree for tree in trees if tree["source_ref"] == source["source_ref"]]
        if (
            len(selected) != summary["trees"]
            or len(source["observations"]) != summary["observations"]
        ):
            raise ValueError("AUDIT_MEMBERSHIP_CHANGED")
        if sum(o["points"] for o in source["observations"]) != summary["points"]:
            raise ValueError("AUDIT_POINT_TOTAL_CHANGED")
        findings.append(
            dict(
                source_ref=source["source_ref"],
                status=source["status"],
                execution_enabled=source["execution_enabled"],
                summary=summary,
            )
        )
    return dict(
        status="verified",
        scope="Pinned historical metadata and evidence; no new full-cloud audit",
        taxa=len(vocabulary["taxa"]),
        sources=findings,
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="operation", required=True)
    commands.add_parser("audit")
    validate = commands.add_parser("validate")
    validate.add_argument("root", type=Path)
    plan = commands.add_parser("plan")
    plan.add_argument("--selection", required=True, type=Path, help="JSON array of source subsets")
    plan.add_argument(
        "--use", choices=["training", "validation", "evaluation", "inference"], default="training"
    )
    plan.add_argument("--rank", choices=["genus", "species"], default="species")
    plan.add_argument("--check", type=Path, help="Re-resolve an exact saved plan")
    args = parser.parse_args(argv)
    try:
        if args.operation == "audit":
            result = audit_metadata()
        elif args.operation == "validate":
            from .package import TreeDataset

            result = TreeDataset(args.root).validate()
        else:
            from .model import load_registry, resolve, check
            from .canonical import fingerprint

            root = repository_root()
            raw = (root / "browser-prepare/classification-runtime-lock.json").read_bytes()
            lock = json.loads(raw)
            pins = dict(
                runtime_sha256=hashlib.sha256(raw).hexdigest(),
                code_sha256=fingerprint(
                    {k: v for k, v in lock["files"].items() if k.endswith((".js", ".mjs", ".py"))}
                ),
            )
            context = load_registry()
            result = (
                check(*context, read_json(args.check), **pins)
                if args.check
                else resolve(
                    *context,
                    use=args.use,
                    rank=args.rank,
                    filters=read_json(args.selection),
                    **pins,
                )
            )
        print(json.dumps(result, indent=2))
        return 0
    except (ValueError, OSError, KeyError) as error:
        print(str(error))
        return 1
