"""Compatibility facade and CLI for the curated knowledge model.

Graph admission, projection and publication live in separate modules. Public
imports are retained for existing consumers and the pinned browser runtime.
"""
import argparse
from pathlib import Path
from model_io import ROOT, CONTENT, snapshot_timestamp, read_json
from model_validation import validate, validate_input_requirements, validate_task_requirements
from model_projection import project, source_task_context
from model_publication import load, check_views, model_hashes, export_views


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--content', type=Path, default=CONTENT)
    parser.add_argument('--export-views', action='store_true',
                        help='Regenerate presentation metadata; do not reread or transform source data')
    args = parser.parse_args()
    if args.export_views:
        export_views(args.content)
    check_views(args.content)
    print('Knowledge graph schema, references and catalog views validated')
