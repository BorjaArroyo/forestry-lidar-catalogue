"""Offline regression checks for remote lifecycle and artifact boundaries."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from treelearn_ray import workbench as r


class RemoteWorkflow(unittest.TestCase):
    def setUp(self):
        self.p = dict(context='cluster', namespace='kuberay', pvc='storage', reader_cluster='reader',
                      input_dir='/mnt/storage/forestseg/runs/frozen', output_base='/mnt/storage/forestseg/runs/workbench')
        self.job = dict(id='20261016T170000-1234abcd', ray_name='canopy-20261016t170000-1234abcd',
                        ray_profile=self.p, output_dir=self.p['output_base']+'/new', status='running')
        self.obj = {'metadata': {'labels': {'canopy-workbench-job': self.job['id'].lower()}}, 'status': {}}
        self.result = dict(status='succeeded', image=r.IMAGE, source_commit=r.COMMIT, input_sha256=r.INPUT_SHA,
                           checkpoint_sha256=r.CHECKPOINT_SHA, coverage={'points':3378949}, prediction_sha256='a'*64)

    def test_pinned_manifest(self):
        obj = r.manifest(self.job)
        self.assertEqual(obj['metadata']['labels']['canopy-workbench-job'], self.job['id'].lower())
        worker = obj['spec']['rayClusterSpec']['workerGroupSpecs'][0]['template']['spec']
        self.assertEqual(worker['containers'][0]['image'], r.IMAGE)
        self.assertEqual(worker['containers'][0]['resources']['limits']['nvidia.com/gpu'], '1')
        self.assertFalse(worker['automountServiceAccountToken'])

    def test_profile_and_traversal(self):
        with tempfile.TemporaryDirectory(dir='temp') as folder:
            root = Path(folder)
            for change in ({'image':'latest'}, {'output_base':'/tmp/out'}, {'input_dir':'/mnt/storage/forestseg/runs/../secret'}):
                (root/'ray-profile.json').write_text(json.dumps(self.p | change))
                with self.assertRaises(ValueError): r.profile(root)
            (root/'ray-profile.json').write_text(json.dumps(self.p))
            self.assertEqual(r.profile(root), self.p)
        with self.assertRaises(ValueError): r.download(self.job, '../secret', Path('unused'))

    def test_recovery_after_rayjob_ttl_and_invalid_evidence(self):
        with patch.object(r, 'lookup', return_value=None), patch.object(r, 'evidence', return_value={'reports':{'result.json':self.result}}):
            r.reconcile(self.job)
            self.assertEqual(self.job['status'], 'succeeded')
            self.result['image'] = 'untrusted:latest'
            with self.assertRaises(ValueError): r.reconcile(self.job)

    def test_failure_missing_output_and_connectivity(self):
        with patch.object(r, 'lookup', return_value=self.obj), patch.object(r, 'evidence', return_value={'reports':{}}):
            self.obj['status'] = {'jobStatus':'FAILED', 'message':'OOM'}
            r.reconcile(self.job)
            self.assertEqual(self.job['status'], 'failed')
            self.assertEqual(self.job['error'], 'OOM')
        self.job['status'] = 'running'
        with patch.object(r, 'lookup', side_effect=ValueError('offline')):
            with self.assertRaisesRegex(ValueError, 'offline'): r.reconcile(self.job)
            self.assertEqual(self.job['status'], 'running')
        with patch.object(r, 'lookup', return_value=None), patch.object(r, 'evidence', return_value={'reports':{}}):
            r.reconcile(self.job)
            self.assertEqual(self.job['status'], 'interrupted')

    def test_cancel_checks_ownership_and_retains_outputs(self):
        obj = {'metadata': {'labels': {'canopy-workbench-job':'someone-else'}}}
        with patch.object(r, 'call', return_value=json.dumps(obj)) as call:
            with self.assertRaisesRegex(ValueError, 'ownership'): r.cancel(self.job)
            self.assertEqual(call.call_count, 1)
        with patch.object(r, 'lookup', return_value=self.obj), patch.object(r, 'call') as call:
            r.cancel(self.job)
            self.assertEqual(self.job['status'], 'cancelling')
            self.assertIn('delete', call.call_args.args)
            self.assertNotIn('pvc', call.call_args.args)

    def test_chunk_download_retries_truncation_and_verifies_final_hash(self):
        import base64, hashlib
        payload = b'expected'
        digest = hashlib.sha256(payload).hexdigest()
        self.job.update(status='succeeded', result={'prediction_sha256':digest})
        metadata = json.dumps({'size_bytes':len(payload), 'sha256':digest})
        packet = json.dumps({'offset':0, 'size_bytes':len(payload), 'sha256':digest,
                             'data':base64.b64encode(payload).decode()})
        with tempfile.TemporaryDirectory(dir='temp') as folder:
            destination = Path(folder)/'prediction.npy'
            with patch.object(r, 'reader', return_value='head'), patch.object(r, 'call', side_effect=[metadata, packet[:-5], packet]) as call:
                r.download(self.job, 'instance-predictions.npy', destination)
            self.assertEqual(destination.read_bytes(), payload)
            self.assertEqual(call.call_count, 3)
            bad = json.loads(packet);bad['offset'] = 1
            with patch.object(r, 'reader', return_value='head'), patch.object(r, 'call', side_effect=[metadata]+[json.dumps(bad)]*3):
                with self.assertRaisesRegex(ValueError, 'offset 0'):
                    r.download(self.job, 'instance-predictions.npy', destination)
            self.assertFalse(destination.exists())
            with patch.object(r, 'reader', return_value='head'), patch.object(r, 'call', return_value=json.dumps({'size_bytes':len(payload),'sha256':'0'*64})):
                with self.assertRaisesRegex(ValueError, 'Persisted prediction checksum'):
                    r.download(self.job, 'instance-predictions.npy', destination)

    def test_read_script_blocks_symlink_escape_and_streams(self):
        import subprocess
        # Execute the exact remote reader locally with a substituted test root.
        with tempfile.TemporaryDirectory(dir='temp') as folder:
            root = Path(folder).resolve()
            script = r.READ.replace("assert root.is_relative_to('/mnt/storage/forestseg/runs')", 'assert True')
            (root/'result.json').symlink_to('/etc/hosts')
            args = [sys.executable, '-c', script, str(root), '["result.json"]', 'inspect']
            result = subprocess.run(args, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            (root/'instance-predictions.npy').write_bytes(b'example-binary')
            args[-2:] = ['["instance-predictions.npy"]', 'chunk', '0', '14']
            import base64
            packet = json.loads(subprocess.check_output(args))
            self.assertEqual(base64.b64decode(packet['data']), b'example-binary')


if __name__ == '__main__':
    unittest.main()
