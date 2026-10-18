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
        self.assertEqual(profiles, model.read_json(WEB / 'dataset-profiles.json'))
        self.assertEqual(relationships, model.read_json(WEB / 'relationships.json'))
        self.assertEqual(tasks, model.read_json(WEB / 'catalog.json')['tasks'])
        self.assertEqual(self.graph, before)
        model.check_views()

    def test_dangling_reference_is_rejected(self):
        self.rejects(lambda g: g['edges']['relation:v1-v2'].update(target='zenodo:999999'))

    def test_endpoint_type_is_checked_beyond_json_schema_shape(self):
        self.rejects(lambda g: g['edges']['relation:v1-v2'].update(target='task:instances'))

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
        self.rejects(lambda g: g['edges']['relation:v1-v2']['data']['contract'].update(status='execution_ready'))

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
            for name in ('knowledge-model.json', 'knowledge-model.schema.json', 'dataset-profiles.json',
                         'relationships.json', 'catalog.json'):
                shutil.copyfile(WEB / name, folder / name)
            before = model.read_json(folder / 'catalog.json')
            model.export_views(folder)
            after = model.read_json(folder / 'catalog.json')
            for key in ('datasets', 'tasks', 'mappings', 'summary', 'snapshot_provenance', 'generated_at'):
                self.assertEqual(before[key], after[key])
            first = (folder / 'catalog.json').read_bytes()
            model.export_views(folder)
            self.assertEqual(first, (folder / 'catalog.json').read_bytes())
            changed = model.read_json(folder / 'dataset-profiles.json')
            changed['8287792']['name'] = 'stale view'
            (folder / 'dataset-profiles.json').write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, 'canonical graph'):
                model.check_views(folder)


if __name__ == '__main__':
    (ROOT / 'temp').mkdir(exist_ok=True)
    unittest.main()
