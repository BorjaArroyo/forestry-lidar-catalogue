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
        (REPO / 'temp').mkdir(exist_ok=True)
        self.scratch = tempfile.TemporaryDirectory(dir=REPO / 'temp')
        self.root = Path(self.scratch.name)
        self.state_patch = patch.object(service, 'STATE', self.root / 'state')
        self.state_patch.start()
        service.STATE.mkdir()

    def tearDown(self):
        self.state_patch.stop()
        self.scratch.cleanup()

    def test_record_validation(self):
        self.assertEqual(service.inspect_record('8287792')['record_id'], 8287792)
        for invalid in ['../8287792', 'https://other.example/records/8287792', '0', '999999999']:
            with self.assertRaises(ValueError):
                service.inspect_record(invalid)

    def test_protected_directories(self):
        for value in ['relative', '/', str(Path.home()), str(REPO)]:
            with self.assertRaises(ValueError):
                service.directory(value)

    def test_existing_worker_prevents_submission(self):
        service.save(service.STATE / 'jobs/active/job.json', {'id': 'active', 'kind': 'acquire', 'root': str(self.root), 'status': 'queued'})
        with self.assertRaisesRegex(ValueError, 'already active'):
            service.submit({'kind': 'acquire', 'record_id': 8287792, 'root': str(self.root / 'new-data')})

    def test_acquisition_worker_uses_verified_stage_and_resumes(self):
        root = self.root / 'dataset'
        folder = service.STATE / 'jobs/offline-acquisition'
        payload = b'canopy integration fixture\n'
        asset = {'name': 'fixture.txt', 'size_bytes': len(payload), 'provider_checksum': 'md5:' + hashlib.md5(payload).hexdigest(), 'download_url': 'https://zenodo.org/api/records/8287792/files/fixture.txt/content'}
        service.save(folder / 'inventory.json', {'records': [{'record_id': 8287792, 'files': [asset]}]})
        job = {'id': 'offline-acquisition', 'kind': 'acquire', 'root': str(root), 'status': 'queued'}
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
            service.worker(folder)
            self.assertEqual(service.read(folder / 'job.json')['status'], 'completed')
            self.assertEqual(original.read_bytes(), payload)
        finally:
            stage.rmdir()

    def test_retired_operations_are_not_submittable(self):
        for kind in ['audit', 'harmonize', 'benchmark', 'prepare-task']:
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, 'Only original-source'):
                service.submit({'kind': kind, 'root': str(self.root)})
        self.assertFalse((service.STATE / 'jobs').exists())

    def test_existing_inventory_is_never_repurposed(self):
        target = self.root / 'existing'
        service.save(target / 'inventory.json', {'records': [{'record_id': 16742708, 'files': []}]})
        original = (target / 'inventory.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'another inventory'):
            service.submit({'kind': 'acquire', 'record_id': 8287792, 'root': str(target)})
        self.assertEqual((target / 'inventory.json').read_bytes(), original)
if __name__ == '__main__':
    unittest.main()
