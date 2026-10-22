"""The supported command-line interface for the Canopy application."""

import argparse
from importlib import import_module

COMMANDS = {
    "classification": "canopy.classification.cli",
    "plan": "canopy.task_plan",
    "acquire": "canopy.tools.acquire",
    "model": "canopy.knowledge_model",
    "package": "canopy.task_package",
    "dataset": "canopy.task_dataset",
    "service": "canopy.service.cli",
    "publication": "canopy.tools.check_publication",
    "sources": "canopy.tools.check_pinned_sources",
    "admission": "canopy.tools.validate_catalog_reviews",
    "catalog": "canopy.tools.build_knowledge_hub_catalog",
    "verify": "canopy.tools.verify",
}


def main(argv=None):
    parser = argparse.ArgumentParser(prog="canopy", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in COMMANDS:
        commands.add_parser(name, add_help=False)
    args, remaining = parser.parse_known_args(argv)
    return import_module(COMMANDS[args.command]).main(remaining)
