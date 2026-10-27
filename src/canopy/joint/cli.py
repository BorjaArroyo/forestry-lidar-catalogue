"""Inspect, plan, prepare and validate linked instance/taxonomy datasets."""

import argparse
import json
from pathlib import Path

from canopy.joint.model import load_source, native_runtime_sha256, resolve
from canopy.joint.package import JointDataset, prepare_native
from canopy.joint.source import encoded


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="operation", required=True)
    review = commands.add_parser("plan")
    review.add_argument("--plot", action="append", required=True)
    review.add_argument("--target", choices=["genus", "species", "leaf_group"], default="species")
    review.add_argument("--policy", choices=["partial", "joint"], required=True)
    review.add_argument("--complete-crowns", action="store_true")
    review.add_argument("--output", type=Path, required=True)
    prepare = commands.add_parser("prepare")
    prepare.add_argument("--plan", type=Path, required=True)
    prepare.add_argument("--input", type=Path, required=True)
    prepare.add_argument("--output", type=Path, required=True)
    validate = commands.add_parser("validate")
    validate.add_argument("root", type=Path)
    args = parser.parse_args(argv)
    if args.operation == "validate":
        print(json.dumps(JointDataset(args.root).validate(), indent=2))
        return 0
    source = load_source()
    if args.operation == "plan":
        plan = resolve(
            source,
            dict(
                plots=args.plot,
                target=args.target,
                policy=args.policy,
                complete_crowns=args.complete_crowns,
            ),
            runtime_sha256=native_runtime_sha256(),
        )
        if args.output.exists():
            raise ValueError("Plan output already exists")
        args.output.write_bytes(encoded(plan))
        print(json.dumps(plan["totals"], indent=2))
    else:
        from canopy.joint.model import check

        plan = json.loads(args.plan.read_text())
        check(source, plan, runtime_sha256=native_runtime_sha256())
        print(json.dumps(prepare_native(source, plan, args.input, args.output), indent=2))
    return 0
