"""Small regressions for task compatibility, mappings and scientific claims."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import task_contracts as t


class TaskContracts(unittest.TestCase):
    def setUp(self):
        self.catalog=json.loads((ROOT/'knowledge-hub/catalog.json').read_text())
        self.policy=json.loads((ROOT/'knowledge-hub/normalization-policy.json').read_text())
        self.validation=json.loads((ROOT/'scripts/treelearn_ray/workbench-validation.json').read_text())

    def test_native_source_mapping_is_precise_and_does_not_mutate(self):
        import numpy as np
        native={'treeID':np.array([7,0,-1,9]), 'semantic_seg':np.array([2,3,3,1])}
        before=native['treeID'].copy()
        ids,mask=t.map_reference_instances('16742708',native)
        np.testing.assert_array_equal(ids,[7,-1,-1,0])
        np.testing.assert_array_equal(mask,[True,False,False,True])
        np.testing.assert_array_equal(native['treeID'],before)
        ids,_=t.map_reference_instances('16875688',{'instance':np.array([4,0]),'semantic':np.array([1,0])})
        np.testing.assert_array_equal(ids,[4,0])
        with self.assertRaises(ValueError):t.map_reference_instances('16910335',native)
        with self.assertRaises(ValueError):t.map_reference_instances('16742708',dict(native,treeID=np.array([float('nan')]*4)))

    def test_components_or_isolated_trees_do_not_become_plot_reference(self):
        for rid in ('17172162','7307956'):
            row=t.assess_dataset(self.catalog,self.policy,rid,'diagnostic')
            self.assertEqual(row['status'],'unsupported')
            self.assertFalse(row['execution_ready'])
            self.assertFalse(row['originals_action']['task_ready'])

    def test_known_reference_is_conditional_not_universal_admission(self):
        for rid in ('16742708','16875688','16910335'):
            row=t.assess_dataset(self.catalog,self.policy,rid,'diagnostic')
            self.assertEqual(row['status'],'conditional')
            self.assertFalse(row['execution_ready'])
        row=t.assess_dataset(self.catalog,self.policy,'15193973','diagnostic')
        self.assertEqual(row['status'],'unsupported')
        self.assertNotEqual(t.assess_dataset(self.catalog,self.policy,'19127709','diagnostic')['status'],'supported')

    def test_geographic_claim_needs_sites_lineage_and_selection_exposure(self):
        for exposure in ({},{'training_sites':['a'],'evaluation_sites':['b']},{'published_protocol_exact':True}):
            self.assertEqual(t.assess_experiment(exposure,'geographic')['status'],'unknown')
        e=dict(training_sites=['a'],evaluation_sites=['b'],training_capture_groups=['c1'],evaluation_capture_groups=['c2'],training_exposure_complete=True,capture_lineage_complete=True,selection_exposure_complete=True,geographic_identity_complete=True)
        self.assertEqual(t.assess_experiment(e,'geographic')['status'],'supported')
        for override in ({'evaluation_sites':['a']},{'evaluation_capture_groups':['c1']},{'evaluation_used_for_training_or_selection':True}):
            self.assertEqual(t.assess_experiment(e|override,'geographic')['status'],'unsupported')
        self.assertEqual(t.assess_experiment(e|{'training_exposure_complete':False},'geographic')['status'],'unknown')

    def test_successful_wytham_run_does_not_establish_geographic_accuracy(self):
        result=t.build(self.catalog,self.policy,self.validation)
        claims=result['experiments']['16875688']['claims']
        self.assertEqual(claims['diagnostic']['status'],'supported')
        self.assertEqual(claims['geographic']['status'],'unsupported')
        self.assertEqual(claims['reproduction']['status'],'unknown')
        self.assertEqual(result['experiments']['16742708']['claims']['geographic']['status'],'unknown')
        self.assertEqual(result['experiments']['17172162']['claims']['diagnostic']['status'],'unsupported')
        self.assertEqual(result['prepared_subset']['sha256'],t.GT_SHA)
        self.assertEqual(result['prepared_subset']['objective'],'diagnostic')

    def test_pins_change_when_evidence_changes_and_schema_is_task_scoped(self):
        result=t.build(self.catalog,self.policy,self.validation)
        original=result['snapshot']['catalog_sha256']
        self.catalog['datasets'][0]['note']='changed evidence'
        self.assertNotEqual(t.build(self.catalog,self.policy,self.validation)['snapshot']['catalog_sha256'],original)
        self.assertIn('not the catalog ontology',result['task']['reference_schema'])
        self.assertEqual(len(result['assessments']),2*len(self.catalog['datasets']))


if __name__=='__main__':unittest.main()
