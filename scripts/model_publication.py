"""Validate pinned artifacts and refresh derived catalog views."""
import copy
import hashlib
import json
from pathlib import Path
from model_io import CONTENT, read_json, _write_json
from model_validation import validate
from model_projection import project

def load(path=None):
    path = Path(path) if path else CONTENT / "knowledge-model.json"
    return validate(read_json(path), read_json(path.with_name("knowledge-model.schema.json")))


def check_views(content=CONTENT):
    graph = load(content / 'knowledge-model.json')
    profiles, relationships, tasks = project(graph)
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
    root = content.parent if content.name == 'knowledge-hub' else content
    for node in graph['nodes'].values():
        data = node['data']
        pinned = data.get('implementation') if node['type'] == 'transformation' else None
        if node['type'] == 'evidence' and 'local' in data and 'sha256' in data:
            pinned = {'path': data['local'], 'sha256': data['sha256']}
            base = content
        else:
            base = root
        if pinned:
            path = (base / pinned['path']).resolve()
            if not path.is_relative_to(base.resolve()) or path.is_symlink():
                raise ValueError('Pinned metadata artifact escapes its declared root')
            if hashlib.sha256(path.read_bytes()).hexdigest() != pinned['sha256']:
                raise ValueError(f"Pinned metadata artifact changed: {pinned['path']}")


    for node in graph['nodes'].values():
        data = node['data']
        if node['type'] == 'transformation' and data['execution_enabled']:
            validation = read_json(content / graph['nodes'][data['validation_ref']]['data']['local'])
            implementation = data['implementation']
            if validation.get('status') != 'succeeded' or validation.get('implementation_sha256') != implementation['sha256']:
                raise ValueError('Execution evidence does not validate the current implementation')
            package = root / Path(implementation['path']).parent
            package_lock = read_json(package / 'package-lock.json')['files']
            for name, expected in package_lock.items():
                artifact = (package / name).resolve()
                if not artifact.is_relative_to(package.resolve()) or hashlib.sha256(artifact.read_bytes()).hexdigest() != expected:
                    raise ValueError('Execution package differs from its locked artifact: ' + name)
            fingerprint = hashlib.sha256(json.dumps(package_lock, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
            if validation.get('package_sha256') != fingerprint:
                raise ValueError('Execution package has no matching complete validation')


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

    if catalog['tasks'] != tasks:
        catalog['tasks'] = tasks
    if catalog['mappings'] != relationships:
        previous = {mapping['id']: mapping for mapping in catalog['mappings']}
        catalog['mappings'] = [previous[m['id']] if previous.get(m['id']) == m else m
                               for m in relationships]
    for dataset in catalog['datasets']:
        profile = copy.deepcopy(profiles[dataset['id']])
        current = {k: dataset[k] for k in ('source_metadata_sha256', 'cloud_count', 'points', 'schemas')}
        profile['review']['observations_current'] = current == profile['review']['observations_snapshot']
        for key, value in profile.items():
            if dataset.get(key) != value:
                dataset[key] = value
    catalog['content_review'].update(model_hashes(content))
    _write_json(content / 'catalog.json', catalog)
    snapshot = json.dumps(catalog, indent=2, ensure_ascii=False)
    (content / 'catalog.js').write_text('window.LIDAR_CATALOG = ' + snapshot + ';\n')
    check_views(content)
