"""Task requirements must reach the audited producer and independent consumer."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import knowledge_model as model
from task_plan import plan_request, check_plan, validate_prepared, iter_task_blocks
from task_package import TaskPackage
import test_task_package as fixtures


class TaskPlans(unittest.TestCase):
    def setUp(self):
        self.graph = model.load()

    def test_optional_channels_keep_monospectral_preparation_without_filling_values(self):
        plan = plan_request(self.graph, '8287792')
        self.assertEqual(plan['status'], 'ready')
        self.assertEqual(set(plan['included']), {'xyz', 'instance_reference'})
        self.assertEqual(set(plan['omitted']), {'reflectance'})
        self.assertEqual(plan['allowed_partitions'], ['dev', 'train'])

    def test_required_multispectral_channels_and_unadmitted_fgi_cannot_run(self):
        for record, choices in [('8287792', {'reflectance':'required'}), ('19351234', {})]:
            plan = plan_request(self.graph, record, variables=choices)
            self.assertEqual(plan['status'], 'blocked')
            with self.assertRaises(ValueError): check_plan(self.graph, plan)

    def test_inference_does_not_require_labels_or_reinterpret_them_as_features(self):
        plan = plan_request(self.graph, '8287792', 'inference')
        self.assertEqual(set(plan['included']), {'xyz'})
        self.assertEqual(plan['variables']['instance_reference'], 'off')
        with self.assertRaises(ValueError):
            plan_request(self.graph, '8287792', variables={'instance_reference':'off'})

    def test_unknown_or_stale_requests_fail_closed(self):
        for args in [dict(use='prediction'), dict(variables=[]), dict(variables={'rgb':'required'}), dict(variables={'reflectance':'maybe'})]:
            with self.assertRaises(ValueError): plan_request(self.graph, '8287792', **args)
        plan = plan_request(self.graph,'8287792')
        plan['included']['reflectance'] = ['features']
        with self.assertRaises(ValueError): check_plan(self.graph,plan)
        plan = plan_request(self.graph,'8287792'); self.graph['schema_version']='changed'
        with self.assertRaises(ValueError): check_plan(self.graph,plan)

    def test_bindings_cannot_invent_fields_shapes_or_channels(self):
        key='pipeline:for-instance-plot-instances:1.0.0'
        for mutate in [lambda g:g['nodes'][key]['data']['variable_outputs'].update(xyz=['instance']),
                       lambda g:g['nodes'][key]['data']['variable_outputs'].update(reflectance=['features','feature_valid']),
                       lambda g:g['nodes'][key]['data'].pop('variable_outputs'),
                       lambda g:g['nodes']['contract:for-instance-plot-instances:1.0.0']['data']['fields'][0].update(dtypes=['float32'])]:
            graph=copy.deepcopy(self.graph);mutate(graph)
            with self.assertRaises(ValueError): model.validate_task_requirements(graph['nodes'])

    def test_javascript_selection_matches_python_execution_decisions(self):
        cases=[]
        for record in ['8287792','19351234']:
            for use in ['training','evaluation','inference']:
                for choice in ['required','optional','off']:
                    plan=plan_request(self.graph,record,use,{'reflectance':choice})
                    cases.append(dict(record=record,request={k:plan[k] for k in ['use','variables']},
                                      expected={k:plan[k] for k in ['status','included','omitted','blockers','pipeline_ref','allowed_partitions']}))
        script="""const vm=require('node:vm'),fs=require('node:fs');
        const c=vm.createContext({window:{}});
        vm.runInContext(fs.readFileSync('catalog.js','utf8'),c);
        vm.runInContext(fs.readFileSync('task-selection.js','utf8'),c);
        const cases=JSON.parse(fs.readFileSync(0,'utf8'));
        const selection=c.window.CanopyTaskSelection;
        process.stdout.write(JSON.stringify({decisions:cases.map(x=>selection.assess(x.record,x.request)),
          discovery:[selection.matches('17172162',selection.normalize('training')),
                     selection.matches('17172162',selection.normalize('inference')),
                     selection.matches('8287792',selection.normalize('training',{reflectance:'optional'})),
                     selection.matches('8287792',selection.normalize('training',{reflectance:'required'}))]}));"""
        values=json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT,input=json.dumps(cases),text=True))
        self.assertEqual(values['discovery'],[False,True,True,False])
        for case,value in zip(cases,values['decisions']):
            self.assertEqual({k:value[k] for k in case['expected']},case['expected'])


class TaskPlanPayloads(unittest.TestCase):
    """Reuse native LAS fixture acquisition and the real pinned producer."""
    def setUp(self):
        self.fixture=fixtures.ContractTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)

    def test_plan_validates_payload_and_streams_only_requested_arrays(self):
        # Fixture package has dev and test scenes. The consumer must keep them apart.
        graph=model.load();plan=plan_request(graph,'8287792')
        package=TaskPackage(self.fixture.root,profile=self.fixture.profile)
        report=validate_prepared(graph,plan,package)
        blocks=list(iter_task_blocks(graph,plan,package))
        self.assertEqual(report['status'],'validated')
        self.assertTrue(blocks)
        self.assertTrue(all(b['published_split']=='dev' for b in blocks))
        self.assertTrue(all(set(b['arrays'])=={'xyz','instance','instance_valid'} for b in blocks))
        inference=plan_request(graph,'8287792','inference')
        self.assertTrue(all(set(b['arrays'])=={'xyz'} for b in iter_task_blocks(graph,inference,package)))


if __name__=='__main__': unittest.main()
