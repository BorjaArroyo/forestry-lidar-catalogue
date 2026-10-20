"""Schema, graph and scientific admission invariants."""
from jsonschema import Draft202012Validator, FormatChecker


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
