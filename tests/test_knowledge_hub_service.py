"""Small, offline integration checks for the local workbench."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
if REPO.name == 'temp':
    REPO = REPO.parent
sys.path.insert(0, str(REPO / 'scripts'))
SPEC = importlib.util.spec_from_file_location('canopy_service', REPO / 'scripts/serve_knowledge_hub.py')
service = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(service)


class WorkbenchTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(dir=REPO / 'temp')
        self.root = Path(self.scratch.name)
        self.state_patch = patch.object(service, 'STATE', self.root / 'state')
        self.state_patch.start()
        service.STATE.mkdir()

    def tearDown(self):
        self.state_patch.stop()
        self.scratch.cleanup()

    def test_record_validation(self):
        with patch.object(service, 'urlopen', side_effect=AssertionError('Unexpected network')):
            self.assertEqual(service.inspect_record('8287792')['record_id'], 8287792)
            for invalid in ['../8287792', 'https://other.example/records/8287792', '0']:
                with self.assertRaises(ValueError):
                    service.inspect_record(invalid)

    def test_protected_directories(self):
        for value in ['relative', '/', str(Path.home()), str(REPO)]:
            with self.assertRaises(ValueError):
                service.directory(value)

    def test_audit_errors_and_path_escape(self):
        root = self.root / 'data'
        root.mkdir()
        for name in ['a.bin', 'b.bin']:
            (root / name).write_bytes(b'data')
        manifest = root / 'sources/1/manifests/asset.json'
        items = [{'path':name,'size_bytes':4,'sha256':service.sha(root / name)} for name in ['a.bin','b.bin']]
        service.save(manifest, {'outputs':items})
        self.assertFalse(service.audit(root, self.root / 'report'))
        report = service.read(self.root / 'report/curation-report.json')
        self.assertEqual(len(report['duplicate_groups']), 1)
        self.assertFalse(report['curation_applied'])
        (root / 'b.bin').write_bytes(b'x')
        self.assertTrue(service.audit(root, self.root / 'report'))
        service.save(manifest, {'outputs':[dict(items[0], path='../outside')]})
        with self.assertRaises(ValueError):
            service.audit(root, self.root / 'report')

    def test_unprepared_benchmarks_are_blocked(self):
        with patch.object(service, 'runtime', return_value={'available':False,'detail':'Test daemon offline'}):
            _, _, blockers = service.recipe_check('treelearn-evaluation', self.root)
        self.assertIn('Test daemon offline', blockers)
        self.assertTrue(any('digest' in b for b in blockers))
        self.assertIn('Missing input: evaluate.yaml', blockers)

    def test_existing_normalization_runs_without_new_approval(self):
        root = self.root / 'existing-source'
        original = root / 'sources/16742708/originals/tiny.ply'
        original.parent.mkdir(parents=True)
        payload = b'ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nproperty int semantic_seg\nproperty int treeID\nend_header\n1 2 3 2 1\n4 5 6 3 1\n'
        original.write_bytes(payload)
        service.save(root / 'sources/16742708/manifests/tiny.json', {'record_id': 16742708,
            'outputs': [{'path': str(original.relative_to(root)), 'size_bytes': len(payload), 'sha256': service.sha(original)}]})
        folder = service.STATE / 'jobs/known-normalization'
        service.save(folder / 'job.json', {'id': 'known-normalization', 'kind': 'harmonize', 'root': str(root), 'status': 'queued'})
        service.worker(folder)
        self.assertEqual(service.read(folder / 'job.json')['status'], 'completed')
        scenes = list((root / 'harmonized').glob('*/scene.json'))
        self.assertEqual(len(scenes), 1)
        self.assertEqual(service.read(scenes[0])['point_count'], 2)
        self.assertEqual(original.read_bytes(), payload)

    def test_new_sources_and_schemas_still_need_review(self):
        from normalization_inputs import source_policy
        for source, fields in [(999999999, None), (15193973, None), (16742708, ['x', 'y', 'z', 'new_label'])]:
            with self.assertRaises(ValueError):
                source_policy(source, fields)
        root = self.root / 'new-source'
        service.save(root / 'sources/999999999/manifests/tiny.json', {'record_id': 999999999, 'outputs': []})
        with self.assertRaisesRegex(ValueError, 'New dataset'):
            service.submit({'kind': 'harmonize', 'root': str(root)})
        folder = service.STATE / 'jobs/new-source'
        service.save(folder / 'job.json', {'id': 'new-source', 'kind': 'harmonize', 'root': str(root), 'status': 'queued'})
        service.worker(folder)
        self.assertEqual(service.read(folder / 'job.json')['status'], 'failed')
        self.assertFalse((root / 'harmonized').exists())

    def test_integrity_failure_remains_blocking(self):
        from normalization_inputs import verified_local_input
        root = self.root / 'corrupted-source'
        root.mkdir()
        (root / 'tiny.ply').write_bytes(b'changed!')
        expected = hashlib.sha256(b'original').hexdigest()
        with self.assertRaisesRegex(ValueError, 'integrity'):
            with verified_local_input(root, {'path': 'tiny.ply', 'size_bytes': 8, 'sha256': expected}):
                self.fail('Corrupt input accepted')
        self.assertEqual((root / 'tiny.ply').read_bytes(), b'changed!')

    def test_existing_worker_prevents_submission(self):
        service.save(service.STATE / 'jobs/active/job.json', {'id':'active','kind':'audit','root':str(self.root),'status':'queued'})
        with self.assertRaisesRegex(ValueError, 'already active'):
            service.submit({'kind':'audit','root':str(self.root)})

    def test_acquisition_worker_uses_verified_stage_and_resumes(self):
        root = self.root / 'dataset'
        folder = service.STATE / 'jobs/offline-acquisition'
        payload = b'canopy integration fixture\n'
        asset = {'name':'fixture.txt','size_bytes':len(payload),
                 'provider_checksum':'md5:' + hashlib.md5(payload).hexdigest(),
                 'download_url':'https://zenodo.org/api/records/8287792/files/fixture.txt/content'}
        service.save(folder / 'inventory.json', {'records':[{'record_id':8287792,'files':[asset]}]})
        job = {'id':'offline-acquisition','kind':'acquire','root':str(root),'status':'queued'}
        service.save(folder / 'job.json', job)
        stage = REPO / 'temp' / ('canopy-stage-' + hashlib.sha256(str(root).encode()).hexdigest()[:16])
        stage.mkdir()
        (stage / '8287792_fixture.txt').write_bytes(payload)
        try:
            service.worker(folder)
            self.assertEqual(service.read(folder / 'job.json')['status'], 'completed')
            self.assertFalse(any(stage.iterdir()))
            original = root / 'sources/8287792/originals/fixture.txt'
            self.assertEqual(original.read_bytes(), payload)
            self.assertEqual(len(service.read(root / 'acquisition-status.json')['completed']), 1)
            # A second run succeeds without a staged asset or network request.
            service.worker(folder)
            self.assertEqual(service.read(folder / 'job.json')['status'], 'completed')
            self.assertEqual(original.read_bytes(), payload)
        finally:
            stage.rmdir()

    def ray_profile(self):
        p = dict(context='test', namespace='kuberay', pvc='storage', reader_cluster='reader',
                 input_dir='/mnt/storage/forestseg/runs/frozen', output_base='/mnt/storage/forestseg/runs/workbench')
        service.save(service.STATE/'ray-profile.json', p)
        return p

    def test_ray_submission_is_pinned_and_durable(self):
        p = self.ray_profile()
        body = dict(kind='benchmark', recipe_id=service.ray_workbench.RECIPE, root=p['input_dir'])
        with patch.object(service.ray_workbench, 'preflight', return_value='ready'), patch.object(service.ray_workbench, 'call', side_effect=['{"items":[]}', 'created']) as call:
            response = service.submit(body)
        job = service.read(service.job_path(response['id']))
        self.assertEqual(job['backend'], 'ray')
        self.assertFalse('pid' in job)
        self.assertEqual(job['status'], 'queued')
        manifest = json.loads(call.call_args.kwargs['payload'])
        self.assertIn(service.ray_workbench.IMAGE, json.dumps(manifest))
        self.assertEqual(manifest['metadata']['name'], job['ray_name'])
        for override in ({'image':'evil:latest'}, {'command':['sh']}, {'root':'/unreviewed/input'}):
            with self.assertRaises(ValueError): service.submit(body | override)
        with patch.object(service.ray_workbench, 'reconcile'), patch.object(service.ray_workbench, 'preflight') as check:
            with self.assertRaisesRegex(ValueError, 'already active'): service.submit(body)
            check.assert_not_called()

    def test_ray_uncertain_create_is_not_retried(self):
        p = self.ray_profile()
        with patch.object(service.ray_workbench, 'preflight'), patch.object(service.ray_workbench, 'call', side_effect=['{"items":[]}', ValueError('timeout')]):
            with self.assertRaisesRegex(ValueError, 'do not resubmit'):
                service.submit(dict(kind='benchmark', recipe_id=service.ray_workbench.RECIPE, root=p['input_dir']))
        path, = (service.STATE/'jobs').glob('*/job.json')
        job = service.read(path)
        self.assertEqual(job['status'], 'queued')
        self.assertTrue((path.parent/'rayjob.json').is_file())
        with patch.object(service.ray_workbench, 'reconcile', side_effect=ValueError('offline')):
            service.RAY_CHECKED.clear()
            self.assertEqual(service.jobs()[0]['status'], 'queued')
        self.assertIn('offline', service.read(path)['connection_error'])

    def test_ray_cancellation_intent_survives_timeout(self):
        self.ray_profile()
        jid = '20261016T170000-1234abcd'
        service.save(service.job_path(jid), dict(id=jid, backend='ray', status='running'))
        with patch.object(service.ray_workbench, 'cancel', side_effect=ValueError('timeout')):
            with self.assertRaises(ValueError): service.cancel_ray(jid)
        job = service.read(service.job_path(jid))
        self.assertEqual(job['status'], 'cancelling')
        self.assertTrue(job['cancel_requested'])


    def test_task_preparation_blocks_changed_scope_and_existing_destination(self):
        self.ray_profile()
        subset = service.task_contracts.load()['prepared_subset']['id']
        target = self.root/'prepared'
        body = dict(kind='prepare-task',root=str(target),subset_id=subset,objective='diagnostic')
        for override in ({'objective':'geographic'},{'subset_id':'unreviewed-source'}):
            with self.assertRaises(ValueError): service.submit(body | override)
        target.mkdir()
        original = target/'keep.txt';original.write_text('keep')
        with self.assertRaisesRegex(ValueError,'not overwritten'): service.submit(body)
        self.assertEqual(original.read_text(),'keep')

    def test_task_worker_rejects_evidence_changed_since_submission(self):
        target = self.root/'prepared'
        folder = service.STATE/'jobs/task-fixture'
        service.save(folder/'job.json',dict(id='task-fixture',kind='prepare-task',root=str(target),status='queued',dossier_sha256='outdated',subset_id='wytham-frozen-reference-v1'))
        with patch.object(service.task_contracts,'prepare_subset') as prepare:
            service.worker(folder)
            prepare.assert_not_called()
        self.assertEqual(service.read(folder/'job.json')['status'],'failed')
        self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
