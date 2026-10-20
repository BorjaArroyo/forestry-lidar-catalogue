"""Frozen execution plans reject changed semantics, coverage and runtime pins."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest
import jsonschema

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import dataset_plan
from knowledge_model import load
from task_plan import fingerprint


class DatasetPlans(unittest.TestCase):
    def setUp(self):
        self.model = load()
        path = ROOT / 'scripts/for_instance/source-lock.json'
        self.source = json.loads(path.read_text())
        self.dev = next(p for p in self.source['plots'] if '/RMIT/' in p['path'] and p['published_split'] == 'dev')
        self.test = next(p for p in self.source['plots'] if '/RMIT/' in p['path'] and p['published_split'] == 'test')
        self.pins = dict(source_lock_path='scripts/for_instance/source-lock.json',
                         source_lock_sha256=hashlib.sha256(path.read_bytes()).hexdigest(), runtime_lock_sha256='a' * 64)

    def resolve(self, **overrides):
        args = dict(use='training', variables=None, subsets=[[self.dev['path']]], **self.pins)
        args.update(overrides)
        return dataset_plan.resolve(self.model, self.source, **args)

    def check(self, plan, **pins):
        return dataset_plan.check(self.model, self.source, plan, **(self.pins | pins))

    def test_deterministic_exact_selection_and_overlap_accounting(self):
        plan = self.resolve(use='inference', subsets=[[self.test['path'], self.dev['path']], [self.dev['path']]])
        self.assertEqual(plan, self.resolve(use='inference', subsets=[[self.dev['path'], self.test['path']], [self.dev['path']]]))
        self.assertEqual(self.check(plan), plan)
        self.assertEqual(plan['totals']['overlapping_selections'], 1)
        self.assertEqual(plan['totals']['points'], self.dev['points'] + self.test['points'])
        self.assertEqual(plan['totals']['source_las_bytes'], self.dev['size_bytes'] + self.test['size_bytes'])
        self.assertGreater(plan['totals']['estimated_browser_storage_bytes'], plan['totals']['source_las_bytes'])
        self.assertEqual(plan['output']['partitions'], ['dev', 'test'])
        self.assertIn('reflectance', plan['task_plan']['omitted'])
        unsigned = {key: value for key, value in plan.items() if key != 'plan_sha256'}
        self.assertEqual(plan['plan_sha256'], fingerprint(unsigned))

    def test_unknown_duplicate_empty_or_excluded_paths_fail_closed(self):
        for subsets in [[], [[]], [['unreviewed.las']], [[self.dev['path']] * 2], [[self.test['path']]], [None], [[1]], [[self.dev['path']]] * 51]:
            with self.subTest(subsets=subsets), self.assertRaises(ValueError): self.resolve(subsets=subsets)
        with self.assertRaises(ValueError): self.resolve(variables={'reflectance': 'required'})

    def test_any_modified_plan_field_or_pin_is_rejected_even_if_rehashed(self):
        original = self.resolve()
        for edit in [lambda p: p['totals'].update(points=1),
                     lambda p: p['plots'][0].update(sha256='b' * 64),
                     lambda p: p['task_plan']['variables'].update(instance_reference='off'),
                     lambda p: p['output'].update(partitions=['train']),
                     lambda p: p['intake'].update(runtime_lock_sha256='b' * 64)]:
            plan = copy.deepcopy(original); edit(plan)
            plan['plan_sha256'] = fingerprint({k: v for k, v in plan.items() if k != 'plan_sha256'})
            with self.assertRaises(ValueError): self.check(plan)
        for key in self.pins:
            with self.assertRaises(ValueError): self.check(original, **{key: 'b' * 64})

    def test_changed_task_or_source_membership_rejects_stale_plan(self):
        plan = self.resolve()
        self.source['plots'][self.source['plots'].index(self.dev)]['points'] += 1
        with self.assertRaises(ValueError): self.check(plan)
        self.source['plots'][self.source['plots'].index(self.dev)]['points'] -= 1
        self.model['nodes']['task:instances']['data']['requirements']['uses']['training']['allowed_partitions'] = ['test']
        with self.assertRaises(ValueError): self.check(plan)

    def test_unknown_versions_extra_fields_and_invalid_estimates_are_rejected(self):
        for edit in [lambda p: p.update(schema_version='future'), lambda p: p.update(extra=True),
                     lambda p: p['intake'].update(kind='unreviewed'),
                     lambda p: p['totals'].update(estimated_browser_storage_bytes=-1)]:
            plan = self.resolve(); edit(plan)
            with self.assertRaises(jsonschema.ValidationError): self.check(plan)

    def test_prepared_coverage_must_match_every_selected_scene_and_source(self):
        plan = self.resolve()
        manifest = dict(source={'record_id': 8287792}, pipeline=plan['task_plan']['pipeline_ref'].removeprefix('pipeline:'),
                        scenes=[{k: self.dev[k] for k in dataset_plan.PLOT_FIELDS if k != 'size_bytes'}])
        self.assertEqual(dataset_plan.check_manifest(plan, manifest)['plan_sha256'], plan['plan_sha256'])
        for edit in [lambda m: m.update(scenes=[]), lambda m: m['scenes'].append(copy.deepcopy(m['scenes'][0])),
                     lambda m: m['scenes'][0].update(sha256='b' * 64),
                     lambda m: m['scenes'][0].update(published_split='test'),
                     lambda m: m['source'].update(record_id=123), lambda m: m.update(pipeline='unreviewed')]:
            changed = copy.deepcopy(manifest); edit(changed)
            with self.assertRaises(ValueError): dataset_plan.check_manifest(plan, changed)


if __name__ == '__main__': unittest.main()
