"""Protect graph identity, references and lossless existing catalog projections."""
import copy
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

from jsonschema.exceptions import ValidationError

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'knowledge-hub' if (ROOT / 'knowledge-hub').is_dir() else ROOT
sys.path.insert(0, str(ROOT / 'scripts'))
import knowledge_model as model


class KnowledgeModel(unittest.TestCase):
    def setUp(self):
        self.graph = model.load()
        self.schema = model.read_json(WEB / 'knowledge-model.schema.json')

    def rejects(self, mutate):
        mutate(self.graph)
        with self.assertRaises((ValueError, ValidationError)):
            model.validate(self.graph, self.schema)

    def test_current_content_round_trips_without_promoting_evidence(self):
        before = copy.deepcopy(self.graph)
        profiles, relationships, tasks = model.project(self.graph)
        catalog = model.read_json(WEB / 'catalog.json')
        self.assertEqual(set(profiles), {d['id'] for d in catalog['datasets']})
        self.assertEqual(relationships, catalog['mappings'])
        self.assertEqual(tasks, catalog['tasks'])
        self.assertEqual(self.graph, before)
        model.check_views()

    def test_dangling_reference_is_rejected(self):
        self.rejects(lambda g: g['edges']['relation:tls-v2'].update(target='zenodo:999999'))

    def test_endpoint_type_is_checked_beyond_json_schema_shape(self):
        self.rejects(lambda g: g['edges']['relation:tls-v2'].update(target='task:instances'))

    def test_missing_assessment_does_not_silently_mean_unsupported(self):
        self.rejects(lambda g: g['edges'].pop('support:8287792:instances'))

    def test_duplicate_assessment_is_rejected(self):
        self.rejects(lambda g: g['edges'].update({
            'support:duplicate': copy.deepcopy(g['edges']['support:8287792:instances'])}))

    def test_record_identity_is_version_scoped(self):
        self.rejects(lambda g: g['nodes']['zenodo:8287792']['data'].update(record_id='9'))

    def test_evidence_must_exist_and_be_shared(self):
        evidence = next(k for k, v in self.graph['nodes'].items() if v['type'] == 'evidence')
        self.rejects(lambda g: g['nodes'].pop(evidence))
        self.graph = model.load()
        self.rejects(lambda g: g['nodes'].update({'evidence:duplicate': copy.deepcopy(g['nodes'][evidence])}))

    def test_unknown_fields_and_model_versions_are_rejected(self):
        self.rejects(lambda g: g['nodes']['zenodo:8287792']['data']['profile'].update(typo='value'))
        self.graph = model.load()
        self.rejects(lambda g: g.update(schema_version='9.0'))

    def test_legacy_relationship_is_not_an_executable_pipeline(self):
        self.rejects(lambda g: g['edges']['relation:tls-v2']['data']['contract'].update(status='execution_ready'))

    def test_duplicate_json_keys_cannot_replace_graph_entities_silently(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'temp') as folder:
            path = Path(folder) / 'duplicate.json'
            path.write_text('{"nodes":{},"nodes":{}}')
            with self.assertRaisesRegex(ValueError, 'Duplicate JSON key'):
                model.read_json(path)

    def test_evidence_graph_cycles_are_allowed_without_execution_semantics(self):
        edge = copy.deepcopy(self.graph['edges']['relation:v1-v2-lineage'])
        edge['source'], edge['target'] = edge['target'], edge['source']
        edge['order'] = sum(e['type'] == 'dataset_relationship' for e in self.graph['edges'].values())
        self.graph['edges']['relation:reverse-review'] = edge
        model.validate(self.graph, self.schema)

    def test_refresh_is_deterministic_and_preserves_observed_snapshot(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'temp') as folder:
            folder = Path(folder)
            for name in ('knowledge-model.json', 'knowledge-model.schema.json', 'catalog.json'):
                shutil.copyfile(WEB / name, folder / name)
            (folder / 'evidence').mkdir()
            shutil.copyfile(WEB / 'evidence/for-instance-v1.json', folder / 'evidence/for-instance-v1.json')
            (folder / 'scripts').mkdir()
            shutil.copyfile(ROOT / 'scripts/harmonize_lidar.py', folder / 'scripts/harmonize_lidar.py')
            shutil.copytree(ROOT / 'scripts/for_instance', folder / 'scripts/for_instance', ignore=shutil.ignore_patterns('__pycache__'))
            for source in (WEB / 'evidence').glob('*.json'):
                shutil.copyfile(source, folder / 'evidence' / source.name)
            before = model.read_json(folder / 'catalog.json')
            model.export_views(folder)
            after = model.read_json(folder / 'catalog.json')
            for key in ('datasets', 'tasks', 'mappings', 'summary', 'snapshot_provenance', 'generated_at'):
                self.assertEqual(before[key], after[key])
            first = (folder / 'catalog.json').read_bytes()
            model.export_views(folder)
            self.assertEqual(first, (folder / 'catalog.json').read_bytes())
            code = folder / 'scripts/harmonize_lidar.py'
            original = code.read_bytes()
            code.write_bytes(original + b'\n# changed implementation\n')
            with self.assertRaisesRegex(ValueError, 'Pinned metadata artifact changed'):
                model.check_views(folder)
            code.write_bytes(original)
            changed = model.read_json(folder / 'catalog.json')
            changed['datasets'][0]['name'] = 'stale view'
            (folder / 'catalog.json').write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, 'source view is stale'):
                model.check_views(folder)

    def test_for_instance_contract_is_explicit_and_not_execution_admission(self):
        nodes = self.graph['nodes']
        native = nodes['contract:for-instance-native:1.0.0']['data']
        tree = next(f for f in native['fields'] if f['name'] == 'treeID')
        self.assertEqual(tree['dtypes'], ['int32', 'float64'])
        self.assertEqual({x['code'] for x in native['annotation_codes']}, set(range(7)))
        pipeline = nodes['pipeline:for-instance-plot-instances:1.0.0']['data']
        self.assertTrue(pipeline['execution_enabled'])
        self.assertEqual(pipeline['status'], 'validated')
        for operation in pipeline['transformation_refs']:
            self.assertTrue(nodes[operation]['data']['execution_enabled'])
        self.assertNotIn('relation:v1-v2', self.graph['edges'])

    def test_for_instance_partition_discrepancy_keeps_its_observation_scope(self):
        evidence = model.read_json(WEB / 'evidence/for-instance-v1.json')
        partition = evidence['partition_review']
        self.assertEqual(partition['csv_rows'], 82)
        self.assertEqual(partition['acquired_las_files'], 32)
        self.assertEqual(partition['matched_counts'], {'dev': 21, 'test': 11})
        self.assertEqual(len(partition['unmatched_rows']), 50)
        self.assertEqual({r['folder'] for r in partition['unmatched_rows']}, {'NIBIO2'})
        self.assertEqual(partition['las_without_split'], [])

    def test_data_flow_requires_contract_endpoints_and_all_ports(self):
        self.rejects(lambda g: g['edges']['flow:for-instance-decode-input'].update(target='task:instances'))
        self.graph = model.load()
        self.rejects(lambda g: g['edges'].pop('flow:for-instance-decode-output'))

    def test_pipeline_metadata_cannot_skip_contracts_or_enable_execution(self):
        key = 'pipeline:for-instance-plot-instances:1.0.0'
        self.rejects(lambda g: g['nodes'][key]['data']['transformation_refs'].insert(0, 'transformation:for-instance-existing-normalization:1.0.0'))
        self.graph = model.load()
        self.rejects(lambda g: g['nodes'][key]['data'].pop('validation_ref'))

    def test_contract_identity_tracks_the_declared_version(self):
        self.rejects(lambda g: g['nodes']['contract:for-instance-native:1.0.0']['data'].update(version='2.0.0'))


    def test_ready_badge_requires_an_enabled_source_specific_pipeline(self):
        self.rejects(lambda g: g['nodes']['zenodo:16742708']['data']['profile']['discovery']['preparation'].update(status='ready'))
        self.graph=model.load()
        self.rejects(lambda g: g['nodes']['transformation:for-instance-task-preparation:1.0.0']['data']['blockers'].append('unresolved'))

if __name__ == '__main__':
    (ROOT / 'temp').mkdir(exist_ok=True)
    unittest.main()
