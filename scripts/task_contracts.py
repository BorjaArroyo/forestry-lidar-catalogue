"""Evidence-backed task decisions; dataset schemas are not universal ontologies."""
import argparse
import hashlib
import inspect
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'knowledge-hub' if (ROOT / 'knowledge-hub').is_dir() else ROOT
TASK = 'plot-tree-instances-v1'
GT_SHA = 'f0405d94b303862ff82fb0472785bf0cffaa60d4bd58bec6fbb92f21e0f55883'
CHECKPOINT_SHA = 'eb01b97061047783989ea0c311f1ef6eaa2f8423b422ce0620b69e136c5cebf9'


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def map_reference_instances(record_id, native):
    """Exact existing two-source instance rules, scoped to plot evaluation."""
    import numpy as np
    if record_id == '16742708':
        field, ground_field, ground_value = 'treeID', 'semantic_seg', 1
    elif record_id == '16875688':
        field, ground_field, ground_value = 'instance', 'semantic', 0
    else:
        raise ValueError('No audited plot-instance mapping for this source')
    labels = np.asarray(native[field])
    ground = np.asarray(native[ground_field])
    if (labels.ndim != 1 or labels.shape != ground.shape or not np.isfinite(labels).all()
            or not np.isfinite(ground).all() or not np.equal(ground, np.floor(ground)).all()
            or not np.equal(labels, np.floor(labels)).all()
            or (labels >= 2**63).any()):
        raise ValueError('Instance labels must be finite integral int64-compatible vectors')
    instances = np.full(labels.shape, -1, dtype=np.int64)
    positive = labels > 0
    instances[positive] = labels[positive].astype(np.int64)
    instances[ground == ground_value] = 0
    return instances, instances >= 0


PROFILES = {
    '16742708': {'reference':'conditional', 'field':'treeID',
        'reason':'Plot tree IDs are present. Annotation completeness and capture identities must be checked for the selected scenes.',
        'mapping':'16742708', 'loss':'Nonpositive tree IDs outside semantic ground remain unknown. Numeric IDs are local to each scene.',
        'coverage':'No exhaustive per-point coverage certification in this catalog snapshot.'},
    '16875688': {'reference':'conditional', 'field':'instance + semantic',
        'reason':'Annotated plot schemas and XYZ-only extracted-tree schemas coexist. Only annotated plots can supply full-scene instance reference.',
        'mapping':'16875688', 'loss':'XYZ-only exports cannot reconstruct background or omitted neighboring trees. Shared extracted trees must be grouped before splitting.',
        'coverage':'A frozen Wytham validation export is verified separately; this does not certify the entire collection.'},
    '17172162': {'reference':'unsupported', 'field':'semantic_GT; no instance reference',
        'reason':'Component labels cannot identify individual trees. The source has no documented tree-instance ground truth.',
        'mapping':None, 'loss':'A semantic crosswalk or pseudo-labels cannot create independent instance reference.',
        'coverage':'Geometry diagnostics and component tasks are separate uses requiring their own contracts.'},
    '16910335': {'reference':'conditional', 'field':'StemID / treeIDv1 / treeIDv2',
        'reason':'Select the annotation version and manual plot reference first. Automatic tree exports are predictions, not interchangeable ground truth.',
        'mapping':None, 'loss':'The current normalizer does not map these instance fields. No executable plot-instance crosswalk is admitted here.',
        'coverage':'Manual and automatic variants must retain separate identities.'},
    '7307956': {'reference':'unsupported', 'field':'tree identity in individual-tree filenames',
        'reason':'Isolated-tree exports do not provide complete plot reference, background, omissions or commission errors.',
        'mapping':None, 'loss':'Concatenating tree exports would not recover the original scene or missing annotations.',
        'coverage':'The source is useful for other tree-level questions, not this plot-instance evaluation contract.'}
}


def assess_dataset(catalog, policy, record_id, role):
    if role not in {'diagnostic', 'geographic'}:
        raise ValueError('Unsupported evaluation objective')
    dataset = next(d for d in catalog['datasets'] if d['id'] == record_id)
    profile = PROFILES.get(record_id)
    source_reference = dataset.get('source_task_support', {}).get('instances', {})
    if profile is None and source_reference.get('status') in {'documented','partial'}:
        profile = {'reference':'conditional', 'reason':source_reference['reason'], 'mapping':None,
                   'loss':'Native labels are described, but no executable plot-reference adapter is admitted for this source.',
                   'coverage':'Review the selected plots, annotation version, boundary masks and coverage before scoring.'}
    requirements = []
    def check(name, status, reason):
        requirements.append({'requirement':name, 'status':status, 'reason':reason})
    if not profile:
        check('Plot reference', 'unknown', 'This dataset has not been assessed against this versioned task contract.')
        profile = {'mapping':None, 'loss':'No task mapping is admitted.', 'coverage':'Unassessed.'}
    else:
        check('Plot reference', profile['reference'], profile['reason'])
        check('Annotation coverage', 'unknown' if profile['reference'] != 'unsupported' else 'unsupported', profile['coverage'])
    source = policy['sources'].get(record_id, {})
    if source.get('status') == 'rights_review':
        check('Derivative rights', 'unsupported', 'The existing derivative-rights gate remains closed.')
    else:
        check('Derivative rights', 'unknown', 'Record-declared terms are retained; intended-use and component terms are not universally certified.')
    check('Coordinate contract', 'unknown', 'Task coordinates must use documented units and a shared reference frame. Preserved numeric XYZ alone is insufficient.')
    check('Executable label mapping', 'supported' if profile['mapping'] else 'unsupported',
          'A precise, tested mapping is available; it does not certify source annotations.' if profile['mapping'] else profile['loss'])
    if role == 'geographic':
        check('Independent evaluation zones', 'unknown', 'Provide model training/adaptation exposure and selected capture lineage. Different record IDs are insufficient.')
    status = ('unsupported' if profile.get('reference') == 'unsupported' or source.get('status') == 'rights_review'
              else 'conditional' if profile.get('reference') == 'conditional' else 'unknown')
    return {'dataset_id':record_id, 'dataset_name':dataset['name'], 'role':role,
            'status':status, 'execution_ready':False, 'requirements':requirements, 'mapping_source':profile['mapping'],
            'information_loss':profile['loss'], 'source_url':dataset['url'],
            'evidence':{'provider_metadata_sha256':source.get('metadata_sha256'),
                        'catalog_dataset_sha256':fingerprint(dataset), 'policy_source_sha256':fingerprint(source)},
            'originals_action':{'record_id':record_id, 'task_ready':False,
                                'label':'Inspect original source assets', 'scope':'Source acquisition is not task admission.'}}


def assess_experiment(exposure, role):
    if role not in {'diagnostic', 'geographic', 'reproduction'}:
        raise ValueError('Unsupported experiment objective')
    overlap = bool(set(exposure.get('training_capture_groups', [])) & set(exposure.get('evaluation_capture_groups', [])))
    overlap = overlap or bool(set(exposure.get('training_sites', [])) & set(exposure.get('evaluation_sites', [])))
    complete = all(exposure.get(k) is True for k in ('training_exposure_complete', 'capture_lineage_complete', 'selection_exposure_complete', 'geographic_identity_complete'))
    if role == 'diagnostic':
        status, reason = 'supported', 'An in-source diagnostic can test execution and reference agreement; it does not establish independent accuracy.'
    elif role == 'reproduction':
        status = 'supported' if exposure.get('published_protocol_exact') is True else 'unknown'
        reason = 'Exact published inputs, checkpoint, preprocessing and evaluator must all be recovered. Successful execution alone is not published-score reproduction.'
    elif overlap or exposure.get('evaluation_used_for_training_or_selection') is True:
        status, reason = 'unsupported', 'Evaluation captures were used in training, adaptation or model selection. This is not independent geographic evaluation.'
    elif not complete or not exposure.get('training_capture_groups') or not exposure.get('evaluation_capture_groups') or not exposure.get('training_sites') or not exposure.get('evaluation_sites'):
        status, reason = 'unknown', 'Training exposure, capture lineage or selection exposure is incomplete. Independence is not established.'
    else:
        status, reason = 'supported', 'Reviewed capture groups are disjoint and training/selection exposure is complete. This supports the recorded geographic protocol only.'
    return {'status':status, 'reason':reason, 'objective':role}


def build(catalog, policy, validation):
    experiments = {}
    for dataset in catalog['datasets']:
        rid = dataset['id']
        exposure = {'training_sites':['wytham'], 'evaluation_sites':['wytham'] if rid in {'16875688','7307956'} else [],
                    'training_capture_groups':['wytham-2015-2016'],
                    'evaluation_capture_groups':['wytham-2015-2016'] if rid in {'16875688','7307956'} else [],
                    'evaluation_used_for_training_or_selection':True if rid in {'16875688','7307956'} else None,
                    'training_exposure_complete':False, 'capture_lineage_complete':False,
                    'selection_exposure_complete':False, 'geographic_identity_complete':False,
                    'published_protocol_exact':False}
        claims = {role:assess_experiment(exposure, role) for role in ('diagnostic','geographic','reproduction')}
        assessment = assess_dataset(catalog, policy, rid, 'diagnostic')
        if rid != '16875688':
            claims['diagnostic'] = {'status':assessment['status'], 'objective':'diagnostic',
                'reason':'Source relevance is described separately. No validated plot-instance diagnostic run or complete adapter exists for this selection.'}
        if assessment['status'] == 'unsupported':
            claims = {role:{'status':'unsupported', 'objective':role,
                            'reason':'Plot-instance reference is unavailable or the existing derivative gate is closed for this selection.'} for role in claims}
        if PROFILES.get(rid, {}).get('reference') == 'unsupported':
            claims = {role:{'status':'unsupported', 'objective':role,
                            'reason':'This source cannot supply the plot-instance reference required by this task. Geometry-only diagnostics are a different task.'} for role in claims}
        experiments[rid] = {'name':'TreeLearn finetuned-on-all', 'evaluation_source':dataset['name'],
            'checkpoint_sha256':CHECKPOINT_SHA, 'evidence':exposure, 'claims':claims,
            'validated_execution_for_selection':rid == '16875688',
            'execution_scope':'The recorded execution covers only the frozen Wytham export, not the full selected source.',
            'verified_run':{k:validation[k] for k in ('image','source_commit','prediction_sha256','points','instances','tiles')},
            'limitations':validation['limitations']}
    return {'schema_version':'1.0', 'task':{'id':TASK, 'name':'Evaluate individual-tree instances in complete plots',
                'unit':'Annotated plot / capture; tree IDs are scene-local',
                'target':'XYZ plus instance_id; -1 unknown, 0 non-tree, positive IDs identify trees',
                'reference_schema':'Task-specific instance representation; FOR-v2 is a native dataset schema, not the catalog ontology',
                'invariants':['Preserve source XYZ and point order', 'Retain native source labels and unknown masks',
                              'Record annotation coverage, boundary rules and evaluator thresholds', 'Group shared captures and derivatives before assigning splits']},
            'snapshot':{'catalog_sha256':fingerprint(catalog), 'policy_sha256':fingerprint(policy), 'runtime_evidence_sha256':fingerprint(validation)},
            'assessments':[assess_dataset(catalog, policy, d['id'], role) for d in catalog['datasets'] for role in ('diagnostic','geographic')],
            'mapping_code':inspect.getsource(map_reference_instances),
            'mapping_code_sha256':hashlib.sha256(inspect.getsource(map_reference_instances).encode()).hexdigest(),
            'experiments':experiments,
            'prepared_subset':{'id':'wytham-frozen-reference-v1', 'record_id':'16875688', 'task_id':TASK,
                'objective':'diagnostic', 'scope':'Frozen prevoxelized Wytham validation export only; not raw acquisition or independent evaluation',
                'points':3378949, 'reference_instances':178, 'sha256':GT_SHA,
                'layout':'reference.npy: float64[N,4] columns x,y,z,instance_id',
                'preparation':'Copy the already verified frozen export without changing points or labels; verify the final SHA256',
                'caveats':['Historical preprocessing of this prevoxelized export is not independently recovered.',
                           'Reference labels alone do not establish completeness or geographic independence.',
                           'TreeLearn finetuned-on-all has exposure to this source; its scores remain in-source diagnostics.']}}


def load():
    result = build(json.loads((WEB/'catalog.json').read_text()), json.loads((WEB/'normalization-policy.json').read_text()),
                 json.loads((ROOT/'scripts/treelearn_ray/workbench-validation.json').read_text()))
    result['snapshot']['implementation_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    return result


def prepare_subset(state, destination, subset_id):
    """Materialize the existing audited frozen reference, not a new transformation."""
    import numpy as np
    from treelearn_ray import workbench as ray
    dossier = load()
    subset = dossier['prepared_subset']
    if subset_id != subset['id']:
        raise ValueError('Unknown audited task subset')
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False)
    p = ray.profile(state)
    # Input files have a separate, fixed allowlist; output-artifact names cannot select arbitrary PVC files.
    args = ('exec', ray.reader(p), '-c', 'ray-head', '--', 'python', '-c', ray.READ,
            p['input_dir'], json.dumps(['gt/wytham_val_voxel01_gt.npy']))
    ray.copy_verified(p, args, destination/'reference.npy', GT_SHA)
    values = np.load(destination/'reference.npy', mmap_mode='r', allow_pickle=False)
    if values.shape != (3378949,4) or values.dtype != np.float64:
        raise ValueError('Frozen reference shape/dtype differs from its audited contract')
    package = {'task':dossier['task'], 'subset':subset, 'snapshot':dossier['snapshot'],
               'mapping_code_sha256':dossier['mapping_code_sha256'],
               'source':{'record':'https://zenodo.org/records/16875688','input_sha256':GT_SHA},
               'readiness':'Ready as the frozen diagnostic reference; independent-use compatibility remains unestablished'}
    (destination/'task-package.json').write_text(json.dumps(package,indent=2)+'\n')
    return package


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(load(),indent=2)+'\n')
