"""Resolve task requests against reviewed source-specific pipeline outputs.

This module adds no point transformation. It consumes the independently checked
task package produced by the admitted adapter, and records optional omissions.
"""
import argparse
import hashlib
import json
from pathlib import Path


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def dependency_fingerprint(model, source_ref, task_ref):
    """Bind complete reviewed dependencies, excluding unrelated catalog entries.

    Referenced nodes, native contracts, candidate pipelines and task support
    belong to the closure. Cross-dataset comparison edges do not.
    """
    nodes = model['nodes']
    roots = {source_ref, task_ref}
    roots.update(key for key, node in nodes.items() if node['type'] == 'pipeline_spec'
                 and node['data']['source_ref'] == source_ref and node['data']['task_ref'] == task_ref)
    edges = {key: edge for key, edge in model['edges'].items()
             if edge['source'] == source_ref and
             ((edge['type'] == 'task_support' and edge['target'] == task_ref) or
              (edge['type'] == 'data_flow' and edge['role'] == 'describes'))}
    roots.update(edge['target'] for edge in edges.values())
    closure = {}

    def visit(value):
        if isinstance(value, str) and value in nodes and value not in closure:
            closure[value] = nodes[value]
            visit(nodes[value])
        elif isinstance(value, dict):
            for item in value.values():
                visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)

    for key in sorted(roots):
        visit(key)
    return fingerprint(dict(scope='task-source-dependency-closure-v1',
                            model_schema_version=model['schema_version'], nodes=closure, edges=edges))


def plan_request(model, record_id, use='training', variables=None, *, schema_version='1.1.0'):
    if schema_version not in {'1.0.0', '1.1.0'}:
        raise ValueError('Unsupported task plan schema version')
    nodes = model['nodes']
    task = nodes['task:instances']['data']['requirements']
    if not isinstance(use, str) or use not in task['uses']:
        raise ValueError('Unknown task use')
    definitions = {v['key']: v for v in task['variables']}
    if variables is not None and not isinstance(variables, dict):
        raise ValueError('Variable requirements must be an object')
    choices = {v['key']: v['default'] for v in task['variables']}
    for key, choice in (variables or {}).items():
        if key not in definitions or choice not in {'required', 'optional', 'off'}:
            raise ValueError('Unknown variable or requirement level')
        choices[key] = choice
    for key in task['uses'][use]['required_variables']:
        if variables and key in variables and variables[key] != 'required':
            raise ValueError('Task minimum cannot be relaxed: ' + key)
        choices[key] = 'required'
    source = 'zenodo:' + str(record_id)
    if source not in nodes or nodes[source]['type'] != 'source_release':
        raise ValueError('Unknown reviewed source')
    pipelines = [(key, node['data']) for key, node in nodes.items()
                 if node['type'] == 'pipeline_spec' and node['data']['source_ref'] == source
                 and node['data']['task_ref'] == 'task:instances' and node['data']['execution_enabled']]
    if len(pipelines) > 1:
        raise ValueError('Ambiguous admitted task pipeline')
    pipeline_id, pipeline = pipelines[0] if pipelines else (None, None)
    outputs = pipeline.get('variable_outputs', {}) if pipeline else {}
    included, omitted, blockers = {}, {}, []
    for key, choice in choices.items():
        if choice == 'off':
            continue
        if key in outputs:
            included[key] = outputs[key]
        else:
            reason = 'No audited output for this variable in the selected source pipeline'
            omitted[key] = reason
            if choice == 'required':
                blockers.append(key + ': ' + reason)
    if not pipeline:
        blockers.insert(0, 'No admitted source-specific preparation pipeline')
    binding = ({'model_sha256': fingerprint(model)} if schema_version == '1.0.0' else
               {'dependencies_sha256': dependency_fingerprint(model, source, 'task:instances'),
                'fingerprint_scope': 'task-source-dependency-closure-v1'})
    return dict(schema_version=schema_version, task_ref='task:instances', source_ref=source,
                use=use, variables=choices, allowed_partitions=task['uses'][use]['allowed_partitions'], pipeline_ref=pipeline_id,
                output_ref=pipeline['output_ref'] if pipeline else None,
                status='blocked' if blockers else 'ready', included=included, omitted=omitted,
                blockers=blockers, **binding,
                scope='Preparation and consumption requirements; no training run or benchmark evaluator is certified')


def check_plan(model, plan):
    expected = plan_request(model, plan['source_ref'].removeprefix('zenodo:'), plan['use'], plan['variables'], schema_version=plan.get('schema_version'))
    if expected != plan:
        raise ValueError('Task plan differs from current reviewed requirements or pipeline')
    if plan['status'] != 'ready':
        raise ValueError('Task request is blocked: ' + '; '.join(plan['blockers']))
    return plan


def validate_prepared(model, plan, package):
    """Require complete independent payload validation before admitting this run."""
    check_plan(model, plan)
    if plan['pipeline_ref'] != 'pipeline:' + package.manifest['pipeline']:
        raise ValueError('Prepared package belongs to another task pipeline')
    if plan['source_ref'] != 'zenodo:' + str(package.manifest['source']['record_id']):
        raise ValueError('Prepared package belongs to another source')
    report = package.validate()
    eligible = [s for s in package.scenes.values() if s['published_split'] in plan['allowed_partitions']]
    if not eligible:
        raise ValueError('No scene belongs to the published partitions permitted for this use')
    if 'instance_reference' in plan['included']:
        # Each scene must supply some positive tree reference, not just background.
        if any(s['tree_points'] == 0 for s in eligible):
            raise ValueError('Selected scene has no positive instance reference for this request')
    return dict(status='validated', task_plan_sha256=fingerprint(plan),
                plan_validator_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                use=plan['use'], included=plan['included'], omitted=plan['omitted'], package=report,
                eligible_scenes=[s['id'] for s in eligible], eligible_points=sum(s['points'] for s in eligible),
                limitations=['Use instance_valid for supervised loss and reference comparisons',
                            'Official partitions are preserved; geographic independence is not established',
                            'Evaluation preparation is not an audited article scoring protocol'])


def iter_task_blocks(model, plan, package):
    """Yield requested arrays; never fill absent optional channels or filter rows.

    Validate the whole package first with validate_prepared(). This iterator
    checks each block again, but partial consumption is not whole-run validation.
    """
    check_plan(model, plan)
    if plan['pipeline_ref'] != 'pipeline:' + package.manifest['pipeline']:
        raise ValueError('Prepared package belongs to another task pipeline')
    if plan['source_ref'] != 'zenodo:' + str(package.manifest['source']['record_id']):
        raise ValueError('Prepared package belongs to another source')
    for scene_id in package.scenes:
        if package.scenes[scene_id]['published_split'] not in plan['allowed_partitions']:
            continue
        for block in package.iter_scene(scene_id):
            yield dict(scene_id=scene_id, published_split=block.published_split,
                       row_offset=block.row_offset,
                       arrays={name: getattr(block, name) for names in plan['included'].values() for name in names})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['plan', 'validate', 'sample'])
    parser.add_argument('--record', default='8287792')
    parser.add_argument('--use', choices=['training', 'evaluation', 'inference'], default='training')
    parser.add_argument('--variable', action='append', default=[], metavar='NAME=required|optional|off')
    parser.add_argument('--package', type=Path)
    parser.add_argument('--plan', type=Path, help='Validate an exported plan exactly; use its recorded request')
    parser.add_argument('--allow-selection', action='store_true')
    args = parser.parse_args()
    from knowledge_model import load
    from task_package import TaskPackage
    model = load()
    try:
        choices = {}
        for item in args.variable:
            key, value = item.split('=', 1)
            if key in choices:
                raise ValueError('Duplicate variable: ' + key)
            choices[key] = value
        if args.plan:
            if choices or args.use != 'training' or args.record != '8287792':
                raise ValueError('--plan cannot be combined with request overrides')
            plan = check_plan(model, json.loads(args.plan.read_text()))
        else:
            plan = plan_request(model, args.record, args.use, choices)
        result = plan
        if args.operation != 'plan':
            check_plan(model, plan)
            if not args.package:
                raise ValueError('--package is required')
            package = TaskPackage(args.package, allow_selection=args.allow_selection)
            report = validate_prepared(model, plan, package)
            result = dict(plan=plan, validation=report)
            if args.operation == 'sample':
                block = next(iter_task_blocks(model, plan, package))
                result['sample'] = {**{k: v for k, v in block.items() if k != 'arrays'},
                                    'arrays': {k: dict(shape=list(v.shape), dtype=str(v.dtype)) for k, v in block['arrays'].items()}}
        print(json.dumps(result, indent=2, allow_nan=False))
        return 0 if plan['status'] == 'ready' else 2
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f'Task request rejected: {error}\n')


if __name__ == '__main__':
    raise SystemExit(main())
