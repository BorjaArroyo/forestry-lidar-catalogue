"""Small, offline integration checks for the local workbench."""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import subprocess
import sys
import threading
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import zipfile
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
        self.root_patch = patch.object(service, 'STATE_ROOT', self.root)
        self.root_patch.start()
        service.STATE.mkdir()

    def tearDown(self):
        self.root_patch.stop()
        self.state_patch.stop()
        self.scratch.cleanup()

    def test_required_unsupported_variable_is_rejected_before_any_acquisition(self):
        body=dict(kind='acquire',record_id=8287792,root=str(self.root/'download'),
                  prepare_output=str(self.root/'prepared'),
                  task_request={'use':'training','variables':{'reflectance':'required'}})
        with patch.object(service,'inspect_record') as inspect, patch.object(service,'launch_worker') as launch:
            with self.assertRaisesRegex(ValueError,'blocked'): service.submit(body)
            inspect.assert_not_called();launch.assert_not_called()
        self.assertFalse((self.root/'download').exists())

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
        stage = service.STATE_ROOT / ('canopy-stage-' + hashlib.sha256(str(root).encode()).hexdigest()[:16])
        stage.mkdir()
        (stage / '8287792_fixture.txt').write_bytes(payload)
        try:
            import numpy  # Match the threaded service after loading preparation dependencies.
            errors=[]
            def launch():
                try:
                    service.launch_worker(folder)
                except Exception as error:
                    errors.append(error)
            thread=threading.Thread(target=launch)
            thread.start();thread.join(timeout=5)
            self.assertFalse(thread.is_alive())
            self.assertFalse(errors)
            deadline=time.monotonic()+5
            while service.read(folder/'job.json')['status'] in {'queued','running'} and time.monotonic()<deadline:
                time.sleep(.02)
            self.assertEqual(service.read(folder / 'job.json')['status'], 'completed')
            self.assertFalse(any(stage.iterdir()))
            original = root / 'sources/8287792/originals/fixture.txt'
            self.assertEqual(original.read_bytes(), payload)
            self.assertEqual(len(service.read(root / 'acquisition-status.json')['completed']), 1)
            index = service.read(service.STATE_ROOT / 'acquisitions' / 'index.json')
            entry = index['acquisitions'][str(root.resolve())]
            self.assertEqual(entry['completed_assets'], 1)
            self.assertEqual(entry['acquisition_status_sha256'],
                             hashlib.sha256((root / 'acquisition-status.json').read_bytes()).hexdigest())
            service.worker(folder)
            self.assertEqual(service.read(folder / 'job.json')['status'], 'completed')
            self.assertEqual(original.read_bytes(), payload)
        finally:
            stage.rmdir()

    def test_state_root_follows_canopy_state_and_defaults_to_checkout_temp(self):
        with patch.dict(os.environ, {'CANOPY_STATE': str(self.root / 'dedicated')}):
            self.assertEqual(service.state_root(), self.root / 'dedicated')
        without = {key: value for key, value in os.environ.items() if key != 'CANOPY_STATE'}
        with patch.dict(os.environ, without, clear=True):
            self.assertEqual(service.state_root(), REPO / 'temp')

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
    def test_preparation_rejects_other_sources_and_overrides(self):
        for body in [
            {'kind':'prepare-instances','record_id':16742708,'root':str(self.root),'output':str(self.root/'output')},
            {'kind':'prepare-instances','record_id':8287792,'root':str(self.root),'output':str(self.root/'output'),'command':['sh']},
            {'kind':'acquire','record_id':16742708,'root':str(self.root/'source'),'prepare_output':str(self.root/'output')},
        ]:
            with self.subTest(body=body), self.assertRaises(ValueError):
                service.submit(body)
        self.assertFalse((service.STATE/'jobs').exists() and list((service.STATE/'jobs').glob('*/job.json')))

    def test_pipeline_changes_after_submission_block_the_worker(self):
        folder=service.STATE/'jobs/preparation-fixture'
        service.save(folder/'job.json',dict(id='fixture',kind='prepare-instances',root=str(self.root),output=str(self.root/'output'),status='queued',package_sha256='old'))
        with patch.object(service,'preparation_status',return_value={'package_sha256':'new'}), patch.object(service.subprocess,'run') as run:
            service.worker(folder)
            run.assert_not_called()
        self.assertEqual(service.read(folder/'job.json')['status'],'failed')
        self.assertFalse((self.root/'output').exists())

    def test_preparation_worker_runs_the_self_contained_offline_package(self):
        spec=importlib.util.spec_from_file_location('instance_fixture',REPO/'scripts/for_instance/test_pipeline.py')
        fixture=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture)
        case=fixture.PipelineTests('test_lossless_fields_masks_splits_and_no_source_mutation')
        case.setUp()
        try:
            fingerprint=fixture.pipeline.package_fingerprint(case.package)
            folder=service.STATE/'jobs/preparation-fixture'
            service.save(folder/'job.json',dict(id='fixture',kind='prepare-instances',root=str(case.source),output=str(case.output),status='queued',package_sha256=fingerprint))
            with patch.object(service,'INSTANCE_PACKAGE',case.package), patch.object(service,'preparation_status',return_value={'package_sha256':fingerprint}):
                service.worker(folder)
            self.assertEqual(service.read(folder/'job.json')['status'],'completed')
            report=service.read(folder/'task-package-report.json')
            self.assertEqual((report['plots'],report['points'],report['unmatched_split_rows']),(2,18,1))
        finally:
            case.tearDown()

    def test_download_prepare_validate_and_resume_end_to_end(self):
        import acquire_lidar as acquisition
        spec=importlib.util.spec_from_file_location('e2e_fixture',REPO/'scripts/for_instance/test_pipeline.py')
        fixture=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture)
        case=fixture.PipelineTests()
        case.setUp()
        self.addCleanup(case.tearDown)
        archive=self.root/'FORinstance_dataset.zip'
        native=case.source/fixture.pipeline.PREFIX
        with zipfile.ZipFile(archive,'w') as output:
            for path in sorted(native.rglob('*')):
                if path.is_file():
                    output.write(path,str(path.relative_to(native)))
        payload=archive.read_bytes()
        checksum='md5:'+hashlib.md5(payload).hexdigest()
        case.lock.update(download_sha256=hashlib.sha256(payload).hexdigest(),provider_checksum=checksum)
        fixture.pipeline.save(case.package/'source-lock.json',case.lock)
        fixture.lock_package(case.package)
        fingerprint=fixture.pipeline.package_fingerprint(case.package)
        requests=[]
        class Provider(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append(self.path)
                self.send_response(200)
                self.send_header('Content-Length',str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            def log_message(self,*args):
                pass
        provider=ThreadingHTTPServer(('127.0.0.1',0),Provider)
        thread=threading.Thread(target=provider.serve_forever,daemon=True)
        thread.start()
        def close_provider():
            provider.shutdown()
            provider.server_close()
            thread.join(timeout=2)
        self.addCleanup(close_provider)
        url=f'http://127.0.0.1:{provider.server_port}/FORinstance_dataset.zip'
        record=dict(record_id=8287792,title='Offline native fixture',files=[dict(name=archive.name,size_bytes=len(payload),provider_checksum=checksum,download_url=url)])
        real_run=subprocess.run
        def run(command,**kwargs):
            if command[1]==str(REPO/'scripts/acquire_lidar.py'):
                with patch.object(sys,'argv',command[1:]):
                    acquisition.main()
                return subprocess.CompletedProcess(command,0)
            return real_run(command,**kwargs)
        def open_asset(record,asset,headers):
            return urlopen(Request(url,headers=headers),timeout=5),url
        def launch(folder):
            (folder/'worker.log').write_text('Offline end-to-end worker fixture\n')
            service.worker(folder)
            return 0
        phases=[]
        real_save=service.save
        def save(path,value):
            if path.name=='job.json' and value.get('phase'):
                phases.append(value['phase'])
            real_save(path,value)
        root=self.root/'fresh-download'
        output=self.root/'prepared'
        body=dict(kind='acquire',record_id=8287792,root=str(root),prepare_output=str(output),task_request={'use':'training','variables':{'reflectance':'optional'}})
        with patch.object(service,'INSTANCE_PACKAGE',case.package), patch.object(service,'preparation_status',return_value={'available':True,'package_sha256':fingerprint}), patch.object(service,'records',return_value=[record]), patch.object(service,'launch_worker',side_effect=launch), patch.object(service.subprocess,'run',side_effect=run), patch.object(acquisition,'open_asset',side_effect=open_asset), patch.object(service,'save',side_effect=save):
            class LocalHandler(service.Handler):
                def log_message(self,*args):
                    pass
            workbench=ThreadingHTTPServer(('127.0.0.1',0),LocalHandler)
            web_thread=threading.Thread(target=workbench.serve_forever,daemon=True)
            web_thread.start()
            def close_workbench():
                workbench.shutdown()
                workbench.server_close()
                web_thread.join(timeout=2)
            self.addCleanup(close_workbench)
            base=f'http://127.0.0.1:{workbench.server_port}'
            with urlopen(base+'/api/state',timeout=5) as response:
                token=json.load(response)['token']
            runtime=service.read(REPO/'browser-prepare/runtime-lock.json')
            for name in ['browser-prepare/kernel.py', 'scripts/task_package.py', 'task-package.schema.json']:
                with urlopen(base+'/'+name,timeout=5) as response:
                    self.assertEqual(hashlib.sha256(response.read()).hexdigest(),runtime['files'][name]['sha256'])
            def submit_http():
                request=Request(base+'/api/jobs',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Canopy-Token':token,'Origin':base})
                with urlopen(request,timeout=10) as response:
                    self.assertEqual(response.status,202)
                    return json.load(response)
            submitted=submit_http()
            folder=service.STATE/'jobs'/submitted['id']
            job=service.read(folder/'job.json')
            report=service.read(folder/'task-package-report.json')
            private=base+'/'+(folder/'job.json').relative_to(REPO).as_posix()
            with self.assertRaises(HTTPError) as refused:
                urlopen(private,timeout=5)
            self.assertEqual(refused.exception.code,404)
            self.assertEqual(job['status'],'completed')
            self.assertEqual(job['task_plan']['status'],'ready')
            self.assertEqual(report['task_request']['eligible_points'],9)
            self.assertEqual(list(report['task_request']['omitted']),['reflectance'])
            self.assertTrue((output/'task-plan.json').is_file())
            self.assertTrue((output/'task-validation.json').is_file())
            self.assertEqual(list(dict.fromkeys(phases)),['starting','downloading','preparing','validating','completed'])
            self.assertEqual((report['status'],report['plots'],report['points']),('validated',2,18))
            self.assertEqual(job['validation_report_sha256'],service.sha(folder/'task-package-report.json'))
            self.assertEqual(report['manifest_sha256'],service.sha(output/'task-package.json'))
            marker=root/'sources/8287792/manifests/FORinstance_dataset.zip.json'
            self.assertEqual(service.read(marker)['download_sha256'],case.lock['download_sha256'])
            self.assertEqual(len(requests),1)
            manifest=service.read(output/'task-package.json')
            first=output/manifest['scenes'][0]['chunks'][0]['path']
            before=first.stat().st_mtime_ns
            with urlopen(base+'/api/log?id='+submitted['id'],timeout=5) as response:
                self.assertEqual(json.load(response)['reports']['task-package-report.json'],report)
            resumed=submit_http()
            self.assertEqual(service.read(service.STATE/'jobs'/resumed['id']/'job.json')['status'],'completed')
            self.assertEqual(len(requests),1)
            self.assertEqual(first.stat().st_mtime_ns,before)
            self.assertEqual(service.sha(first),manifest['scenes'][0]['chunks'][0]['sha256'])
        stage=service.STATE_ROOT/('canopy-stage-'+hashlib.sha256(str(root).encode()).hexdigest()[:16])
        self.assertFalse(any(stage.iterdir()))

    def test_independent_validation_rejects_corruption_after_producer_success(self):
        import numpy as np
        spec=importlib.util.spec_from_file_location('corruption_fixture',REPO/'scripts/for_instance/test_pipeline.py')
        fixture=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture)
        case=fixture.PipelineTests()
        case.setUp()
        self.addCleanup(case.tearDown)
        fingerprint=fixture.pipeline.package_fingerprint(case.package)
        folder=service.STATE/'jobs/corrupt-after-prepare'
        service.save(folder/'job.json',dict(id='corrupt',kind='prepare-instances',root=str(case.source),output=str(case.output),status='queued',package_sha256=fingerprint))
        real_run=subprocess.run
        def run(command,**kwargs):
            result=real_run(command,**kwargs)
            manifest=service.read(case.output/'task-package.json')
            chunk=manifest['scenes'][0]['chunks'][0]
            path=case.output/chunk['path']
            with np.load(path,allow_pickle=False) as stored:
                arrays={k:stored[k] for k in stored.files}
            arrays['instance_valid'][0]=True
            np.savez(path,**arrays)
            chunk['sha256']=service.sha(path)
            service.save(case.output/'task-package.json',manifest)
            return result
        with patch.object(service,'INSTANCE_PACKAGE',case.package), patch.object(service,'preparation_status',return_value={'package_sha256':fingerprint}), patch.object(service.subprocess,'run',side_effect=run):
            service.worker(folder)
        job=service.read(folder/'job.json')
        self.assertEqual((job['status'],job['phase']),('failed','validating'))
        self.assertIn('instance_valid',job['error'])
        self.assertNotIn('validation_report_sha256',job)
        self.assertFalse((folder/'task-package-report.json').exists())

    def test_failed_worker_start_is_persisted_instead_of_left_queued(self):
        folder=service.STATE/'jobs/failed-launch'
        service.save(folder/'job.json',dict(id='fixture',kind='acquire',status='queued',root=str(self.root)))
        with patch.object(service.os,'posix_spawn',return_value=123456), patch.object(service.os,'waitpid',return_value=(123456,11)):
            with self.assertRaisesRegex(ValueError,'exit -11'):
                service.launch_worker(folder)
        job=service.read(folder/'job.json')
        self.assertEqual(job['status'],'failed')
        self.assertIn('finished_at',job)

if __name__ == '__main__':
    unittest.main()
