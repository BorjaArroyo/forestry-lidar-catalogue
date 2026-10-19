"""Loopback-only Canopy service and durable background job worker."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

REPO = Path(__file__).resolve().parents[1]
WEB = REPO / 'knowledge-hub' if (REPO / 'knowledge-hub').is_dir() else REPO


def state_root():
    """Resolve the single state root: CANOPY_STATE when set, else the checkout temp/."""
    return Path(os.environ.get('CANOPY_STATE') or REPO / 'temp')


STATE_ROOT = state_root()
STATE = STATE_ROOT / 'canopy-workbench'
TOKEN = secrets.token_urlsafe(32)
GUARD = threading.Lock()
ACTIVE = {'queued', 'running', 'cancelling'}
INSTANCE_PACKAGE = REPO / 'scripts/for_instance'


def now():
    return datetime.now(timezone.utc).isoformat()

def read(path):
    return json.loads(path.read_text())

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.write-tmp')
    tmp.write_text(json.dumps(value, indent=2) + '\n')
    tmp.replace(path)

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        while block := f.read(8 * 1024**2):
            h.update(block)
    return h.hexdigest()

def directory(value, exists=True):
    p = Path(value).expanduser()
    if not p.is_absolute() or ',' in str(p) or '\n' in str(p):
        raise ValueError('Choose an absolute directory without commas or newlines')
    p = p.resolve()
    if exists and not p.is_dir():
        raise ValueError('Directory does not exist')
    if p == Path('/') or p == Path.home() or p == REPO or p in REPO.parents:
        raise ValueError('Choose a dedicated data directory')
    return p

def records():
    return read(REPO / 'docs/lidar-acquisition-inventory.json')['records']

def inspect_record(value):
    match = re.fullmatch(r'(?:https://zenodo.org/records/)?([1-9][0-9]*)/?', str(value).strip())
    if not match:
        raise ValueError('Enter a numeric Zenodo record ID or its record URL')
    rid = int(match[1])
    record = next((r for r in records() if r['record_id'] == rid), None)
    if record is None:
        raise ValueError('Record is outside the reviewed inventory; source admission requires prior analysis')
    if not record['files']:
        raise ValueError('Record has no downloadable files')
    save(STATE / 'records' / f'{rid}.json', record)
    return record


def preparation_status():
    from for_instance.prepare import package_fingerprint, read
    from knowledge_model import load
    model = load(WEB / 'knowledge-model.json')
    if not model['nodes']['pipeline:for-instance-plot-instances:1.0.0']['data']['execution_enabled']:
        raise ValueError('FOR-instance preparation is not enabled by the reviewed model')
    validation = read(WEB / 'evidence/for-instance-preparation-validation.json')
    fingerprint = package_fingerprint(INSTANCE_PACKAGE)
    if validation.get('status') != 'succeeded' or validation.get('package_sha256') != fingerprint or validation.get('plots') != 32 or validation.get('points') != 151478959:
        raise ValueError('FOR-instance preparation has not passed complete-source validation')
    return {'record_id':8287792, 'pipeline':'for-instance-plot-instances:1.0.0',
            'package_sha256':fingerprint, 'scope':'32 archive plots; 50 NIBIO2 split rows absent',
            'available':True}


def preparation_destination(root, output, fingerprint):
    if root == output or output.is_relative_to(root) or root.is_relative_to(output):
        raise ValueError('Prepared output must be separate from original-source directories')
    if output.exists():
        marker = output/'task-package.json'
        marker = marker if marker.exists() else output/'.incomplete.json'
        if not marker.exists() or read(marker).get('package_sha256') != fingerprint:
            raise ValueError('Existing output is not a matching resumable instance package')


def preparation_input(root, output):
    from for_instance.prepare import source_selection, read
    status = preparation_status()
    preparation_destination(root, output, status['package_sha256'])
    source_selection(root, read(INSTANCE_PACKAGE / 'source-lock.json'))
    return status


def jobs():
    result = []
    for path in sorted((STATE / 'jobs').glob('*/job.json'), reverse=True):
        job = read(path)
        if job.get('backend') == 'ray':
            # Historical remote records remain preserved; this build does not manage them.
            result.append(job)
            continue
        pid_file = path.parent / 'worker.pid'
        if not job.get('pid') and pid_file.exists():
            job['pid'] = int(pid_file.read_text())
        if job.get('pid'):
            try:
                stopped, _ = os.waitpid(job['pid'],os.WNOHANG)
                if stopped:
                    job = read(path)
            except ChildProcessError:
                pass
        if job['status'] in {'queued','running'} and job.get('pid'):
            try:
                os.kill(job['pid'], 0)
            except ProcessLookupError:
                job['status'] = 'interrupted'
                job['error'] = 'Worker stopped without recording completion; inspect logs before resuming'
        result.append(job)
    return result

def submit(body):
    from filelock import FileLock
    kind = body.get('kind')
    allowed = {'kind','record_id','root','output'} if kind == 'prepare-instances' else {'kind','record_id','root','prepare_output'}
    if kind not in {'acquire','prepare-instances'} or set(body) - allowed:
        raise ValueError('Only original-source acquisition and the audited FOR-instance preparation are available')
    root = directory(body.get('root', ''), exists=kind == 'prepare-instances')
    with GUARD, FileLock(str(STATE / 'submission.lock'), timeout=0):
        if any(j['status'] in ACTIVE for j in jobs()):
            raise ValueError('A Canopy job is already active. Wait for it to finish.')
        job_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + secrets.token_hex(4)
        folder = STATE / 'jobs' / job_id
        job = {'id':job_id,'kind':kind,'root':str(root),'status':'queued','created_at':now()}
        rid = int(body['record_id'])
        if rid != 8287792 and (kind == 'prepare-instances' or body.get('prepare_output')):
            raise ValueError('Only the reviewed FOR-instance release has an admitted instance adapter')
        job['record_id'] = rid
        if kind == 'prepare-instances':
            if rid != 8287792:
                raise ValueError('Only the reviewed FOR-instance release has an admitted instance adapter')
            output = directory(body.get('output',''), exists=False)
            ready = preparation_input(root, output)
            job.update(output=str(output), package_sha256=ready['package_sha256'])
        else:
            record = inspect_record(rid)
            inv = {'records':[record]}
            if (root / 'inventory.json').exists():
                inv = read(root / 'inventory.json')
                if [r['record_id'] for r in inv['records']] != [rid]:
                    raise ValueError('Destination belongs to another inventory. Select a new record directory.')
                if inv['records'][0]['files'] != record['files']:
                    raise ValueError('Pinned asset inventory differs from destination; inspect before resuming')
            elif root.exists() and any(root.iterdir()):
                raise ValueError('Choose an empty destination or a matching acquisition directory')
            parent = root
            while not parent.exists():
                parent = parent.parent
            total = sum(f['size_bytes'] for f in record['files'])
            if shutil.disk_usage(parent).free < total:
                raise ValueError('Insufficient destination space even for compressed assets')
            job['expected_bytes'] = total
            job['record_id'] = rid
            save(folder / 'inventory.json', inv)
            if body.get('prepare_output'):
                if rid != 8287792:
                    raise ValueError('Only FOR-instance supports download followed by audited preparation')
                output = directory(body['prepare_output'], exists=False)
                ready = preparation_status()
                preparation_destination(root, output, ready['package_sha256'])
                job.update(output=str(output), package_sha256=ready['package_sha256'])
        save(folder / 'job.json', job)
        pid = launch_worker(folder)
        return {'id':job_id,'pid':pid}


def launch_worker(folder):
    # posix_spawn avoids forking the multithreaded macOS HTTP process after NumPy loads.
    command = [sys.executable,str(Path(__file__).resolve()),'--worker',str(folder)]
    try:
        with (folder / 'worker.log').open('ab') as log:
            pid = os.posix_spawn(sys.executable, command, os.environ,
                file_actions=[(os.POSIX_SPAWN_OPEN,0,'/dev/null',os.O_RDONLY,0),
                              (os.POSIX_SPAWN_DUP2,log.fileno(),1),
                              (os.POSIX_SPAWN_DUP2,log.fileno(),2)], setsid=True)
        (folder / 'worker.pid').write_text(str(pid))
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            current = read(folder / 'job.json')
            if current['status'] != 'queued':
                return pid
            stopped, status = os.waitpid(pid,os.WNOHANG)
            if stopped:
                raise ValueError(f'Worker stopped during startup (exit {os.waitstatus_to_exitcode(status)}); inspect its log')
            time.sleep(.02)
        return pid
    except (OSError, ValueError) as error:
        current = read(folder / 'job.json')
        current.update(status='failed',error=str(error),finished_at=now())
        save(folder / 'job.json',current)
        raise


def job_path(jid):
    if not re.fullmatch(r'[0-9T]+-[a-f0-9]{8}', jid):
        raise ValueError('Invalid job ID')
    return STATE / 'jobs' / jid / 'job.json'

def worker(folder):
    job = read(folder / 'job.json')
    job.update(status='running',pid=os.getpid(),started_at=now())
    save(folder / 'job.json', job)
    try:
        root = Path(job['root'])
        if job['kind'] not in {'acquire','prepare-instances'}:
            raise ValueError('Unsupported job type')
        if job['kind'] == 'acquire':
            # Staging, locks and the acquisition index stay colocated with the
            # state root that owns this job (folder = ROOT/canopy-workbench/jobs/<id>),
            # so a relocated root moves them together in the worker process too.
            state_root = folder.parents[2]
            command = [sys.executable,str(REPO/'scripts/acquire_lidar.py'),'--inventory',str(folder/'inventory.json'),
                       '--root',str(root),'--stage',str(state_root/('canopy-stage-'+hashlib.sha256(str(root).encode()).hexdigest()[:16])),'--resume']
            job['command'] = command
            save(folder/'job.json',job)
            subprocess.run(command,check=True)
        if 'output' in job:
            status = preparation_status()
            if status['package_sha256'] != job['package_sha256']:
                raise ValueError('Pipeline changed after submission; inspect before resuming')
            command = [sys.executable,str(INSTANCE_PACKAGE/'prepare.py'),'--input',str(root),'--output',job['output']]
            job['preparation_command'] = command
            save(folder/'job.json',job)
            subprocess.run(command,check=True)
            package = read(Path(job['output'])/'task-package.json')
            save(folder/'task-package-report.json', {'pipeline':package['pipeline'],
                 'package_sha256':package['package_sha256'], 'plots':len(package['scenes']),
                 'points':sum(s['points'] for s in package['scenes']),
                 'unmatched_split_rows':len(package['unmatched_split_rows']),
                 'geographic_independence':package['geographic_independence']})
        job['status'] = 'completed'
    except Exception as exc:
        job.update(status='failed',error=str(exc))
        print(f'FAILED: {exc}',flush=True)
    job['finished_at'] = now()
    save(folder / 'job.json', job)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(WEB),**kwargs)

    def send_json(self, data, status=200):
        raw = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(raw)))
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        self.wfile.write(raw)

    def local(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}

    def do_GET(self):
        if not self.local():
            return self.send_json({'error':'Invalid host'},403)
        parsed = urlparse(self.path)
        try:
            if parsed.path == '/api/state':
                with GUARD:
                    current_jobs = [j for j in jobs() if j['kind'] in {'acquire','prepare-instances'}]
                try:
                    preparation = preparation_status()
                except (ValueError, OSError) as e:
                    preparation = {'available':False,'detail':str(e)}
                return self.send_json({'token':TOKEN, 'jobs':current_jobs, 'preparation':preparation,
                                       'records':[{'id':r['record_id'],'title':r['title']} for r in records()]})
            if parsed.path == '/api/log':
                jid = parse_qs(parsed.query).get('id',[''])[0]
                folder = job_path(jid).parent
                job = read(folder/'job.json')
                if job['kind'] not in {'acquire','prepare-instances'}:
                    raise ValueError('Historical experiments are outside this build')
                p = folder / 'worker.log'
                with p.open('rb') as f:
                    f.seek(max(0,p.stat().st_size-32000))
                    log = f.read().decode(errors='replace')
                folder = p.parent
                reports = {q.name:read(q) for q in folder.glob('*report.json')}
                return self.send_json({'log':log,'reports':reports})
            if parsed.path.startswith('/api/'):
                return self.send_json({'error':'Unknown endpoint'},404)
            # Serve only the public application, never job files or repository paths.
            relative = Path(parsed.path.lstrip('/') or 'index.html')
            path = (WEB/relative).resolve()
            if not path.is_relative_to(WEB) or not path.is_file() or path.suffix not in {'.html','.js','.css','.json','.jpg'}:
                return self.send_json({'error':'Not found'},404)
            if path.name == 'index.html':
                raw = path.read_bytes().replace(b'window.CANOPY_PUBLIC = true;', b'window.CANOPY_PUBLIC = false;')
                self.send_response(200)
                self.send_header('Content-Type','text/html; charset=utf-8')
                self.send_header('Content-Length',str(len(raw)))
                self.send_header('Cache-Control','no-store')
                self.end_headers()
                self.wfile.write(raw)
                return
            super().do_GET()
        except (ValueError, KeyError, OSError, subprocess.TimeoutExpired) as e:
            self.send_json({'error':str(e)},400)

    def do_POST(self):
        origin = self.headers.get('Origin')
        if not self.local() or origin not in {None,f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'} or not secrets.compare_digest(self.headers.get('X-Canopy-Token',''),TOKEN):
            return self.send_json({'error':'Local session token required'},403)
        try:
            size = int(self.headers.get('Content-Length','0'))
            if size < 1 or size > 16384:
                raise ValueError('Invalid request size')
            body = json.loads(self.rfile.read(size))
            if self.path == '/api/inspect':
                return self.send_json(inspect_record(body['record']))
            if self.path == '/api/jobs':
                return self.send_json(submit(body),202)
            self.send_json({'error':'Unknown endpoint'},404)
        except Exception as e:
            self.send_json({'error':str(e)},400)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--worker',type=Path)
    args = parser.parse_args()
    if args.worker:
        worker(args.worker)
    else:
        STATE.mkdir(parents=True,exist_ok=True)
        print(f'Canopy workbench: http://127.0.0.1:{args.port}',flush=True)
        ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()

if __name__ == '__main__':
    main()
