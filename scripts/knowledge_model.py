"""Validate curated graph metadata and generate existing catalog views."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'knowledge-hub' if (ROOT / 'knowledge-hub').is_dir() else ROOT


def read_json(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f'Duplicate JSON key: {key}')
            result[key] = value
        return result
    return json.loads(Path(path).read_text(), object_pairs_hook=unique)


def _ordered(values, label):
    orders = sorted(values)
    if orders != list(range(len(orders))):
        raise ValueError(f'{label}: order must be unique and contiguous from zero')


def validate(model, schema):
    """Check JSON structure, reference types and lossless projection invariants."""
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(model)
    nodes, edges = model['nodes'], model['edges']

    def require(key, expected):
        if key not in nodes or nodes[key]['type'] != expected:
            raise ValueError(f'{key}: expected an existing {expected} node')

    sources, tasks, locators = set(), set(), set()
    for key, node in nodes.items():
        data = node['data']
        if node['type'] == 'source_release':
            if key != 'zenodo:' + data['record_id']:
                raise ValueError('Source identity must match its version-specific Zenodo record')
            sources.add(key)
            for fact in data['profile']['review']['source_facts']:
                require(fact['evidence_ref'], 'evidence')
                if 'url' not in nodes[fact['evidence_ref']]['data']:
                    raise ValueError('Provider facts require a public evidence URL')
        elif node['type'] == 'task':
            if key != 'task:' + data['key']:
                raise ValueError('Task identity does not match its key')
            tasks.add(key)
        else:
            if not key.startswith('evidence:'):
                raise ValueError('Evidence identity must use the evidence namespace')
            locator = tuple(data.items())
            if locator in locators:
                raise ValueError('Evidence resources must be shared by reference, not duplicated')
            locators.add(locator)
    if not sources or not tasks:
        raise ValueError('The graph requires sources and tasks')
    _ordered([nodes[t]['data']['order'] for t in tasks], 'Tasks')
    support = {}
    relationship_orders = []
    for key, edge in edges.items():
        require(edge['source'], 'source_release')
        if edge['type'] == 'task_support':
            require(edge['target'], 'task')
            pair = edge['source'], edge['target']
            if pair in support:
                raise ValueError('Duplicate source-task assessment')
            support[pair] = edge['data']
            if not key.startswith('support:'):
                raise ValueError('Task support identity must use the support namespace')
            if edge['data']['conditional_order'] is not None and edge['data']['listing_order'] is None:
                raise ValueError('A conditional task must also be listed')
        else:
            require(edge['target'], 'source_release')
            if not key.startswith('relation:'):
                raise ValueError('Relationship identity must use the relation namespace')
            for task in edge['task_refs']:
                require(task, 'task')
            for evidence in edge['data']['evidence']:
                require(evidence['evidence_ref'], 'evidence')
            relationship_orders.append(edge['order'])
    if set(support) != {(source, task) for source in sources for task in tasks}:
        raise ValueError('Every source-task pair requires an explicit assessment, including unknowns')
    for source in sources:
        for field in ('listing_order', 'conditional_order'):
            _ordered([value[field] for (s, _), value in support.items()
                      if s == source and value[field] is not None], source + ':' + field)
    _ordered(relationship_orders, 'Relationships')
    return model


def load(path=None):
    path = Path(path) if path else CONTENT / 'knowledge-model.json'
    return validate(read_json(path), read_json(path.with_name('knowledge-model.schema.json')))


def project(model):
    """Resolve graph references without modifying the canonical graph."""
    nodes = model['nodes']
    task_nodes = sorted((n['data'] for n in nodes.values() if n['type'] == 'task'), key=lambda t: t['order'])
    tasks = [{**{k: v for k, v in task.items() if k not in {'key', 'order'}}, 'id': task['key']}
             for task in task_nodes]

    def evidence(item):
        result = copy.deepcopy(item)
        result.update(nodes[result.pop('evidence_ref')]['data'])
        return result

    profiles = {}
    for key, node in nodes.items():
        if node['type'] != 'source_release':
            continue
        profile = copy.deepcopy(node['data']['profile'])
        supports = {nodes[e['target']]['data']['key']: e['data'] for e in model['edges'].values()
                    if e['type'] == 'task_support' and e['source'] == key}
        for field, order in (('tasks', 'listing_order'), ('conditional', 'conditional_order')):
            profile[field] = [task for task, data in sorted(supports.items(), key=lambda item: item[1][order] if item[1][order] is not None else -1)
                              if data[order] is not None]
        profile['source_task_support'] = {task['key']: {k: supports[task['key']][k] for k in ('status', 'reason')} for task in task_nodes}
        profile['review']['source_facts'] = [evidence(fact) for fact in profile['review']['source_facts']]
        profiles[node['data']['record_id']] = profile
    relationships = []
    for key, edge in sorted(model['edges'].items(), key=lambda item: item[1].get('order', -1)):
        if edge['type'] != 'dataset_relationship':
            continue
        relationship = copy.deepcopy(edge['data'])
        relationship.update(id=key.removeprefix('relation:'), source=nodes[edge['source']]['data']['record_id'],
                            target=nodes[edge['target']]['data']['record_id'],
                            tasks=[nodes[t]['data']['key'] for t in edge['task_refs']])
        relationship['evidence'] = [evidence(item) for item in relationship['evidence']]
        relationships.append(relationship)
    return profiles, relationships, tasks


def check_views(content=CONTENT):
    profiles, relationships, tasks = project(load(content / 'knowledge-model.json'))
    for name, expected in (('dataset-profiles.json', profiles), ('relationships.json', relationships)):
        if read_json(content / name) != expected:
            raise ValueError(f'{name} differs from the canonical graph; regenerate the catalog views')
    catalog = read_json(content / 'catalog.json')
    if {d['id'] for d in catalog['datasets']} != set(profiles):
        raise ValueError('Catalog source membership differs from the canonical graph')
    if any(catalog['content_review'].get(key) != value for key, value in model_hashes(content).items()):
        raise ValueError('Catalog model fingerprints are stale; regenerate the catalog views')
    if catalog['tasks'] != tasks or catalog['mappings'] != relationships:
        raise ValueError('Catalog task or relationship views differ from the canonical graph')
    for dataset in catalog['datasets']:
        profile = copy.deepcopy(profiles[dataset['id']])
        actual = {key: copy.deepcopy(dataset[key]) for key in profile}
        actual['review'].pop('observations_current', None)
        if actual != profile:
            raise ValueError(f"Catalog source view is stale: {dataset['id']}")


def model_hashes(content=CONTENT):
    return {key: hashlib.sha256((content / name).read_bytes()).hexdigest()
            for key, name in (('model_sha256', 'knowledge-model.json'),
                              ('model_schema_sha256', 'knowledge-model.schema.json'))}


def export_views(content=CONTENT):
    """Refresh presentation metadata while retaining the observed acquisition snapshot."""
    profiles, relationships, tasks = project(load(content / 'knowledge-model.json'))
    catalog = read_json(content / 'catalog.json')
    if {d['id'] for d in catalog['datasets']} != set(profiles):
        raise ValueError('Changed source membership requires rebuilding from the acquisition inventory')

    write_profile_views(content)
    if catalog['tasks'] != tasks:
        catalog['tasks'] = tasks
    if catalog['mappings'] != relationships:
        catalog['mappings'] = relationships
    for dataset in catalog['datasets']:
        profile = copy.deepcopy(profiles[dataset['id']])
        current = {k: dataset[k] for k in ('source_metadata_sha256', 'cloud_count', 'points', 'schemas')}
        profile['review']['observations_current'] = current == profile['review']['observations_snapshot']
        for key, value in profile.items():
            if dataset.get(key) != value:
                dataset[key] = value
    catalog['content_review'].update(model_hashes(content))
    for name, key in (('dataset-profiles.json', 'profiles_sha256'),
                      ('relationships.json', 'relationships_sha256')):
        catalog['content_review'][key] = hashlib.sha256((content / name).read_bytes()).hexdigest()
    _write_json(content / 'catalog.json', catalog)
    snapshot = json.dumps(catalog, indent=2, ensure_ascii=False)
    (content / 'catalog.js').write_text('window.LIDAR_CATALOG = ' + snapshot + ';\n')
    check_views(content)


def _write_json(path, value):
    if not path.exists() or read_json(path) != value:
        path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def write_profile_views(content=CONTENT):
    profiles, relationships, _ = project(load(content / 'knowledge-model.json'))
    _write_json(content / 'dataset-profiles.json', profiles)
    _write_json(content / 'relationships.json', relationships)


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
