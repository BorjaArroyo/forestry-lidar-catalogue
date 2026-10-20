"""Prevent editorial evidence from becoming unsupported scientific admission."""
import json
from pathlib import Path
import sys
import unittest
ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'knowledge-hub' if (ROOT / 'knowledge-hub').is_dir() else ROOT
sys.path.insert(0, str(ROOT / 'scripts'))
import build_knowledge_hub_catalog as builder
import knowledge_model

class CatalogContent(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((WEB / 'catalog.json').read_text())
        cls.profiles, _, _ = knowledge_model.project(knowledge_model.load())
        cls.inventory = json.loads((ROOT / 'docs/lidar-acquisition-inventory.json').read_text())

    def test_all_profiles_distinguish_reported_observed_and_unresolved(self):
        for dataset in self.catalog['datasets']:
            with self.subTest(record=dataset['id']):
                review = dataset['review']
                self.assertTrue(review['observation_unit'])
                self.assertTrue(review['local_observations'])
                self.assertTrue(review['open_questions'])
                self.assertTrue(all((f['text'] and f['url'].startswith('https://') for f in review['source_facts'])))
                self.assertEqual(set(dataset['source_task_support']), {t['id'] for t in self.catalog['tasks']})
                self.assertNotEqual(dataset['role'], 'Reserved evaluation')
                self.assertNotEqual(dataset['readiness'], 'Reference schema')

    def test_changed_observation_metadata_is_not_silently_reaffirmed(self):
        status = {'harmonized': [], 'completed': [], 'errors': [], 'conversion_errors': []}
        result = builder.build(self.inventory, status, [])
        reviewed = next((d for d in result['datasets'] if d['id'] == '16875688'))
        self.assertFalse(reviewed['review']['observations_current'])
        self.assertEqual(reviewed['review']['observations_snapshot']['cloud_count'], 3271)
        self.assertEqual(reviewed['cloud_count'], 0)
        for finding in result['findings']:
            if finding['id'] in {'duplicates', 'split-leakage', 'lautx', 'semantics', 'lineage', 'balance'}:
                self.assertEqual(finding['count'], 0)

    def test_relationships_do_not_imply_complete_executable_pipelines(self):
        for mapping in self.catalog['mappings']:
            contract = mapping['contract']
            self.assertTrue(contract['steps'] and contract['preconditions'])
            self.assertNotIn(contract['status'], {'validated', 'execution_ready'})
            self.assertIn('does not', contract['target_scope'])
        lautx = next((m for m in self.catalog['mappings'] if m['id'] == 'lautx-v2'))
        self.assertEqual(lautx['contract']['status'], 'review_required')
        self.assertTrue(lautx['contract']['steps'][0].startswith('STOP:'))

    def test_discovery_does_not_turn_reference_labels_into_pipeline_readiness(self):
        sources = {d['id']: d['discovery'] for d in self.catalog['datasets']}
        self.assertEqual(sources['15193973']['instance_reference']['status'], 'plots')
        self.assertEqual(sources['15193973']['preparation']['status'], 'blocked')
        self.assertEqual(sources['17172162']['instance_reference']['status'], 'none')
        self.assertEqual(sources['7307956']['instance_reference']['status'], 'trees')
        self.assertFalse(sources['16875688']['preparation']['limited_reference_copy'])
        self.assertEqual(sources['16875688']['preparation']['status'], 'tbd')
        self.assertEqual({rid for rid, d in sources.items() if d['preparation']['status']=='ready'}, {'8287792','19351234'})
if __name__ == '__main__':
    unittest.main()
