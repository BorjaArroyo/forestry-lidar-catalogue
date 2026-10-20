"""Validate curated graph metadata and generate existing catalog views."""
import argparse
import copy
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'knowledge-hub' if (ROOT / 'knowledge-hub').is_dir() else ROOT


def snapshot_timestamp(root=ROOT):
    """Date a snapshot by reproducible provenance, not by wall-clock build time.

    SOURCE_DATE_EPOCH wins when set; otherwise the HEAD commit date of the
    content checkout, so identical inputs and commits regenerate identical
    bytes. Only a checkout without git history falls back to the current time.
    """
    epoch = os.environ.get('SOURCE_DATE_EPOCH')
    if epoch:
        return datetime.fromtimestamp(int(epoch), tz=timezone.utc).isoformat()
    try:
        head = subprocess.run(['git', '-C', str(root), 'log', '-1', '--format=%cI'],
                              capture_output=True, text=True, timeout=10)
        if head.returncode == 0 and head.stdout.strip():
            return head.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return datetime.now(timezone.utc).isoformat()


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


def validate_input_requirements(data, nodes):
    """Check declared inputs; metadata checks do not validate a running consumer."""
    fields = {f['name']: f for f in nodes[data['input_ref']]['data']['fields']}
    seen = set()
    for requirement in data.get('input_requirements', []):
        name = requirement['field']
        identity = name, requirement['purpose']
        if name not in fields or identity in seen:
            raise ValueError('Input requirements must name existing fields without duplicate purposes')
        seen.add(identity)
        field = fields[name]
        measurement = field.get('measurement')
        if requirement['purpose'] != 'feature':
            if requirement['calibration'] != 'not_required' or requirement['association'] != 'not_required' or requirement['unit'] is not None:
                raise ValueError('Measurement constraints require a feature input')
            continue
        if not measurement or field.get('role') != 'measurement':
            raise ValueError('Feature inputs require a typed measurement field')
        if not data['execution_enabled']:
            continue
        if measurement['semantic_status'] != 'documented':
            raise ValueError('Enabled feature input has unresolved measurement semantics')
        if requirement['unit'] is not None and (measurement['unit']['status'] != 'documented' or measurement['unit']['symbol'] != requirement['unit']):
            raise ValueError('Feature unit is unknown or incompatible')
        missing = measurement['missingness']
        if missing['status'] == 'not_documented' or requirement['missing_policy'] == 'preserve':
            raise ValueError('Enabled feature inputs require documented missingness and an explicit mask or rejection')
        channel = nodes[measurement['channel_ref']]['data']
        if requirement['calibration'] == 'validated' and channel['calibration']['status'] != 'validated':
            raise ValueError('Required channel calibration has not been validated')
        if requirement['association'] == 'validated' and measurement['association']['status'] != 'validated':
            raise ValueError('Required channel association has not been validated')


def validate_task_requirements(nodes):
    """Validate typed task outputs against existing source pipeline contracts."""
    for key, node in nodes.items():
        if node['type'] != 'task' or 'requirements' not in node['data']:
            continue
        req = node['data']['requirements']
        variables = {v['key']: v for v in req['variables']}
        if len(variables) != len(req['variables']):
            raise ValueError('Duplicate task variable')
        if any(not set(use['required_variables']) <= set(variables) for use in req['uses'].values()):
            raise ValueError('Task use names an undefined variable')
        for variable in variables.values():
            measurement = variable['purpose'] == 'measurement'
            if measurement != bool(variable['quantity']) or measurement != (variable['minimum_channels'] > 0):
                raise ValueError('Spectral constraints require a measurement variable')
            fields = variable['output_fields']
            if len({f['name'] for f in fields}) != len(fields):
                raise ValueError('Duplicate variable output field')
        for pipeline in (n['data'] for n in nodes.values() if n['type'] == 'pipeline_spec' and n['data']['task_ref'] == key):
            bindings = pipeline.get('variable_outputs', {})
            if pipeline['execution_enabled'] and not bindings:
                raise ValueError('Enabled task pipeline needs explicit variable outputs')
            output = {f['name']:f for f in nodes[pipeline['output_ref']]['data']['fields']}
            for name, fields in bindings.items():
                if name not in variables:
                    raise ValueError('Pipeline binds an undefined task variable')
                expected = variables[name]['output_fields']
                if fields != [f['name'] for f in expected]:
                    raise ValueError('Pipeline output binding differs from task variable fields')
                for field in expected:
                    actual = output.get(field['name'])
                    if not actual or any(actual[k] != field[k] for k in ['dtypes', 'shape']) or not actual['required']:
                        raise ValueError('Pipeline output does not meet task dtype/shape requirements')
                if variables[name]['purpose'] == 'measurement':
                    native = {f['name']:f for f in nodes[pipeline['input_ref']]['data']['fields']}
                    channels = set()
                    for requirement in pipeline.get('input_requirements', []):
                        field = native[requirement['field']]
                        m = field.get('measurement', {})
                        if requirement['purpose']=='feature' and m.get('quantity')==variables[name]['quantity']:
                            channels.add(m['channel_ref'])
                    if len(channels) < variables[name]['minimum_channels']:
                        raise ValueError('Task measurement output lacks audited channel input requirements')
            if pipeline['execution_enabled']:
                if not any(set(u['required_variables']) <= set(bindings) for u in req['uses'].values()):
                    raise ValueError('Pipeline cannot satisfy any declared task use')

def source_task_context(model, source_ref):
    """Project reviewed outputs separately from native spectral descriptions."""
    nodes = model['nodes']
    native = [nodes[e['target']]['data'] for e in model['edges'].values()
              if e['type']=='data_flow' and e['role']=='describes' and e['source']==source_ref]
    spectra = []
    for contract in native:
        for field in contract['fields']:
            m = field.get('measurement')
            if field.get('role')=='measurement' and m and m['quantity']=='reflectance' and m['semantic_status']=='documented':
                channel = nodes[m['channel_ref']]['data']
                spectra.append(dict(field=field['name'], channel_ref=m['channel_ref'], wavelength_nm=channel['wavelength_nm']))
    pipelines = [{'id':key, 'output_ref':n['data']['output_ref'], 'variable_outputs':copy.deepcopy(n['data'].get('variable_outputs', {}))}
                 for key,n in nodes.items() if n['type']=='pipeline_spec' and n['data']['source_ref']==source_ref and n['data']['task_ref']=='task:instances' and n['data']['execution_enabled']]
    return dict(pipelines=pipelines, native_reflectance=spectra,
                note='Native availability does not admit feature extraction, calibration or a preparation pipeline.')

def validate(model, schema):
    """Check JSON structure, reference types and lossless projection invariants."""
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(model)
    nodes, edges = model['nodes'], model['edges']

    def require(key, expected):
        if key not in nodes or nodes[key]['type'] != expected:
            raise ValueError(f'{key}: expected an existing {expected} node')

    def require_pinned_validation(key, evidence_refs):
        require(key, 'evidence')
        if key not in evidence_refs or not {'local', 'sha256'} <= set(nodes[key]['data']):
            raise ValueError('Validated measurements require pinned local validation evidence')

    sources, tasks, locators = set(), set(), set()
    for key, node in nodes.items():
        data = node['data']
        if node['type'] == 'source_release':
            if key != 'zenodo:' + data['record_id']:
                raise ValueError('Source identity must match its version-specific Zenodo record')
            sources.add(key)
            semantics = data['profile'].get('class_semantics')
            if semantics:
                codes = [entry['code'] for entry in semantics]
                if len(codes) != len(set(codes)):
                    raise ValueError(f'{key}: class semantics codes must be unique within a source')
                for entry in semantics:
                    require(entry['evidence_ref'], 'evidence')
            for fact in data['profile']['review']['source_facts']:
                require(fact['evidence_ref'], 'evidence')
                if 'url' not in nodes[fact['evidence_ref']]['data']:
                    raise ValueError('Provider facts require a public evidence URL')
        elif node['type'] == 'task':
            if key != 'task:' + data['key']:
                raise ValueError('Task identity does not match its key')
            tasks.add(key)
        elif node['type'] == 'evidence':
            if not key.startswith('evidence:'):
                raise ValueError('Evidence identity must use the evidence namespace')
            locator = tuple(data.items())
            if locator in locators:
                raise ValueError('Evidence resources must be shared by reference, not duplicated')
            locators.add(locator)
        else:
            namespaces = {'data_contract': 'contract:', 'transformation': 'transformation:',
                          'pipeline_spec': 'pipeline:', 'coordinate_frame': 'coordinates:',
                          'measurement_channel': 'channel:'}
            if not key.startswith(namespaces[node['type']]) or not key.endswith(':' + data['version']):
                raise ValueError('Contract, transformation and pipeline identity must include their version')
            for evidence in data['evidence_refs']:
                require(evidence, 'evidence')
            if data.get('execution_enabled'):
                require(data.get('validation_ref'), 'evidence')
                validation = nodes[data['validation_ref']]['data']
                if data['status'] != 'validated' or data['validation_ref'] not in data['evidence_refs'] or not {'local','sha256'} <= set(validation):
                    raise ValueError('Enabled execution requires validated status and pinned local validation evidence')
                if node['type'] == 'transformation' and (not data['implementation'] or data['blockers'] or any(r['status'] == 'unresolved' for r in data['rules'])):
                    raise ValueError('Enabled transformation requires implementation and resolved blockers/rules')
            if node['type'] == 'data_contract':
                require(data['coordinate_ref'], 'coordinate_frame')
                fields = [field['name'] for field in data['fields']]
                if len(fields) != len(set(fields)):
                    raise ValueError('Contract field names must be unique')
                for field in data['fields']:
                    measurement = field.get('measurement')
                    if not measurement:
                        continue
                    if field.get('role') not in {'measurement', 'display'}:
                        raise ValueError('Measurement descriptors require a measurement or display role')
                    if (field['role'] == 'display') != (measurement['quantity'] == 'pseudocolor'):
                        raise ValueError('Pseudo colors must remain display attributes')
                    require(measurement['channel_ref'], 'measurement_channel')
                    for evidence in measurement['evidence_refs']:
                        require(evidence, 'evidence')
                    unit, missing, association = (measurement[k] for k in ('unit', 'missingness', 'association'))
                    if (unit['status'] == 'unknown') != (unit['symbol'] is None):
                        raise ValueError('Unknown measurement units must remain null')
                    if (missing['status'] == 'documented_sentinel') != bool(missing['values']):
                        raise ValueError('Missingness must distinguish documented sentinels from undocumented values')
                    if (association['method'] == 'nearest_neighbor') != (association['max_distance_m'] is not None):
                        raise ValueError('Nearest-neighbor association requires a positive distance bound')
                    if (association['method'] == 'not_documented') != (association['status'] == 'not_documented'):
                        raise ValueError('Association provenance must distinguish unknown and reported methods')
                    if association['status'] == 'validated':
                        require_pinned_validation(association.get('validation_ref'), measurement['evidence_refs'])
            elif node['type'] == 'measurement_channel':
                require(data['source_ref'], 'source_release')
                if data['calibration']['status'] == 'validated':
                    require_pinned_validation(data['calibration'].get('validation_ref'), data['evidence_refs'])
            elif node['type'] == 'pipeline_spec':
                for field, kind in (('source_ref', 'source_release'), ('task_ref', 'task'),
                                    ('input_ref', 'data_contract'), ('output_ref', 'data_contract')):
                    require(data[field], kind)
                validate_input_requirements(data, nodes)
                for operation in data['transformation_refs']:
                    require(operation, 'transformation')
                    if data['execution_enabled'] and not nodes[operation]['data']['execution_enabled']:
                        raise ValueError('Enabled pipeline cannot contain a disabled transformation')
    for source in sources:
        if nodes[source]['data']['profile']['discovery']['preparation']['status'] == 'ready':
            admitted = [n for n in nodes.values() if n['type'] == 'pipeline_spec' and n['data']['source_ref'] == source and n['data']['task_ref'] == 'task:instances' and n['data']['execution_enabled']]
            if len(admitted) != 1:
                raise ValueError('A ready source requires exactly one enabled instance pipeline for its pinned release')
            if not nodes[source]['data']['profile'].get('class_semantics'):
                raise ValueError('A ready preparation must declare its native class semantics as source-scoped data')
    if not sources or not tasks:
        raise ValueError('The graph requires sources and tasks')
    _ordered([nodes[t]['data']['order'] for t in tasks], 'Tasks')
    support = {}
    relationship_orders = []
    flows = set()
    ports = {}
    for key, edge in edges.items():
        if edge['type'] == 'data_flow':
            endpoint_types = {'describes': ('source_release', 'data_contract'),
                              'consumes': ('transformation', 'data_contract'),
                              'produces': ('transformation', 'data_contract'),
                              'designed_for': ('data_contract', 'task')}
            if not key.startswith('flow:'):
                raise ValueError('Data-flow identity must use the flow namespace')
            source_type, target_type = endpoint_types[edge['role']]
            require(edge['source'], source_type)
            require(edge['target'], target_type)
            link = edge['role'], edge['source'], edge['target']
            if link in flows:
                raise ValueError('Duplicate data-flow relationship')
            flows.add(link)
            if edge['role'] in {'consumes', 'produces'}:
                ports.setdefault(edge['source'], {}).setdefault(edge['role'], set()).add(edge['target'])
            continue
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
    for role, source, target in flows:
        if role != 'describes':
            continue
        for field in nodes[target]['data']['fields']:
            if 'measurement' in field and nodes[field['measurement']['channel_ref']]['data']['source_ref'] != source:
                raise ValueError('Measurement channels must belong to the described source release')
    if set(support) != {(source, task) for source in sources for task in tasks}:
        raise ValueError('Every source-task pair requires an explicit assessment, including unknowns')
    for source in sources:
        for field in ('listing_order', 'conditional_order'):
            _ordered([value[field] for (s, _), value in support.items()
                      if s == source and value[field] is not None], source + ':' + field)
    _ordered(relationship_orders, 'Relationships')
    for key, node in nodes.items():
        if node['type'] == 'transformation':
            if set(ports.get(key, {})) != {'consumes', 'produces'}:
                raise ValueError('Every described transformation needs explicit input and output contracts')
        elif node['type'] == 'pipeline_spec':
            data = node['data']
            if ('describes', data['source_ref'], data['input_ref']) not in flows:
                raise ValueError('Pipeline source does not describe its input contract')
            if ('designed_for', data['output_ref'], data['task_ref']) not in flows:
                raise ValueError('Pipeline output is not associated with its intended task')
            available = {data['input_ref']}
            for operation in data['transformation_refs']:
                port = ports.get(operation, {})
                if not port.get('consumes') or not port['consumes'] <= available:
                    raise ValueError('Pipeline metadata has disconnected or out-of-order contracts')
                available.update(port.get('produces', set()))
            if data['output_ref'] not in available:
                raise ValueError('Pipeline metadata does not reach its declared output')
    validate_task_requirements(nodes)
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
        contracts = []
        for edge in model['edges'].values():
            if edge['type'] != 'data_flow' or edge['role'] != 'describes' or edge['source'] != key:
                continue
            contract = nodes[edge['target']]['data']
            measurements = [f for f in contract['fields'] if 'measurement' in f]
            if not measurements:
                continue
            channels = sorted({f['measurement']['channel_ref'] for f in measurements})
            contracts.append({'id': edge['target'], **copy.deepcopy(contract),
                              'channels': [{'id': channel, **copy.deepcopy(nodes[channel]['data'])} for channel in channels]})
        if contracts:
            profile['native_measurement_contracts'] = contracts
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
    for task in tasks:
        if 'requirements' in task:
            task['preparation_sources'] = {key.removeprefix('zenodo:'): source_task_context(model, key)
                                           for key, node in nodes.items() if node['type'] == 'source_release'}
    return profiles, relationships, tasks


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


def _write_json(path, value):
    if not path.exists() or read_json(path) != value:
        path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


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
