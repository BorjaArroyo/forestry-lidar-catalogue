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
from treelearn_ray import workbench as ray_workbench
import task_contracts
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, quote
from urllib.request import urlopen

REPO = Path(__file__).resolve().parents[1]
WEB = REPO / 'knowledge-hub' if (REPO / 'knowledge-hub').is_dir() else REPO
STATE = REPO / 'temp' / 'canopy-workbench'
TOKEN = secrets.token_urlsafe(32)
GUARD = threading.Lock()
RAY_CHECKED = {}


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
    pinned = next((r for r in records() if r['record_id'] == rid), None)
    if pinned:
        record = pinned
    else:
        with urlopen(f'https://zenodo.org/api/records/{rid}', timeout=30) as response:
            raw = response.read(8 * 1024**2 + 1)
        if len(raw) > 8 * 1024**2:
            raise ValueError('Record metadata exceeds size limit')
        meta = json.loads(raw)
        if int(meta['id']) != rid or meta['metadata'].get('access_right') != 'open':
            raise ValueError('Only version-specific, openly downloadable records are supported')
        files = []
        for f in meta.get('files', []):
            name = f['key']
            if Path(name).name != name or name in {'.', '..'} or not re.fullmatch(r'md5:[a-fA-F0-9]{32}', f.get('checksum', '')):
                raise ValueError('Unsupported asset filename or missing provider checksum')
            files.append({'name':name, 'size_bytes':int(f['size']), 'provider_checksum':f['checksum'],
                          'download_url':f'https://zenodo.org/api/records/{rid}/files/{quote(name, safe="")}/content'})
        record = {'record_id':rid, 'title':meta['metadata']['title'], 'url':f'https://zenodo.org/records/{rid}',
                  'license_declared':meta['metadata'].get('license', {}), 'files':files,
                  'metadata_sha256':hashlib.sha256(raw).hexdigest(), 'metadata_snapshot':meta}
    if not record['files']:
        raise ValueError('Record has no downloadable files')
    save(STATE / 'records' / f'{rid}.json', record)
    return record


def registry():
    return read(WEB / 'benchmarks.json')


def runtime():
    try:
        p = subprocess.run(['docker','info','--format','{{.OSType}}/{{.Architecture}}'], capture_output=True, text=True, timeout=5)
        return {'available':p.returncode == 0,'platform':p.stdout.strip() if p.returncode == 0 else None,
                'detail': 'Docker daemon connected' if p.returncode == 0 else 'Docker daemon is unavailable'}
    except (OSError, subprocess.TimeoutExpired):
        return {'available':False,'platform':None,'detail':'Docker CLI or daemon is unavailable'}


def recipe_check(recipe_id, root):
    reg = registry()
    recipe = next(r for r in reg['recipes'] if r['id'] == recipe_id)
    image = next(i for i in reg['images'] if i['id'] == recipe['image_id'])
    blockers = list(recipe.get('blockers', []))
    if not recipe.get('enabled') or not recipe['command']:
        blockers.append('Recipe has not passed execution validation')
    ref = image.get('reference') or ''
    if not image.get('validated') or not re.fullmatch(r'[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}', ref) or not re.fullmatch(r'[a-f0-9]{40}', image.get('commit') or ''):
        blockers.append('Register a validated image digest and full source commit')
    rt = runtime()
    if not rt['available']:
        blockers.append(rt['detail'])
    else:
        p = subprocess.run(['docker','image','inspect',ref or 'canopy-unconfigured'],capture_output=True,text=True,timeout=10)
        if p.returncode:
            blockers.append('Pinned image is not installed locally; automatic pulls are disabled')
        else:
            info = json.loads(p.stdout)[0]
            if f"{info['Os']}/{info['Architecture']}" != image['platform']:
                blockers.append('Image platform differs from registered platform')
        if image.get('gpu'):
            blockers.append('GPU recipes require a separately validated execution adapter')
    for name in recipe['required_files']:
        if not (root / name).is_file():
            blockers.append(f'Missing input: {name}')
    return recipe, image, list(dict.fromkeys(blockers))


def jobs():
    result = []
    for path in sorted((STATE / 'jobs').glob('*/job.json'), reverse=True):
        job = read(path)
        if job.get('backend') == 'ray':
            if job['status'] in ray_workbench.ACTIVE and time.monotonic() - RAY_CHECKED.get(job['id'], -100) > 15:
                try:
                    ray_workbench.reconcile(job)
                except (ValueError, OSError, subprocess.TimeoutExpired) as e:
                    job['connection_error'] = str(e)
                RAY_CHECKED[job['id']] = time.monotonic()
                save(path, job)
            result.append(job)
            continue
        pid_file = path.parent / 'worker.pid'
        if not job.get('pid') and pid_file.exists():
            job['pid'] = int(pid_file.read_text())
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
    if body.get('kind') == 'benchmark' and body.get('recipe_id') == ray_workbench.RECIPE:
        return submit_ray(body)
    kind = body.get('kind')
    if kind not in {'acquire','audit','harmonize','benchmark','prepare-task'}:
        raise ValueError('Unknown job type')
    root = directory(body.get('root', ''), exists=kind not in {'acquire','prepare-task'})
    with GUARD, FileLock(str(STATE / 'submission.lock'), timeout=0):
        if any(j['status'] in ray_workbench.ACTIVE for j in jobs()):
            raise ValueError('A Canopy job is already active. Wait for it to finish.')
        job_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + secrets.token_hex(4)
        folder = STATE / 'jobs' / job_id
        job = {'id':job_id,'kind':kind,'root':str(root),'status':'queued','created_at':now()}
        if kind == 'prepare-task':
            dossier = task_contracts.load()
            if body.get('objective') != 'diagnostic' or body.get('subset_id') != dossier['prepared_subset']['id']:
                raise ValueError('Only the audited frozen diagnostic reference can be prepared')
            if root.exists():
                raise ValueError('Choose a new task-package directory; existing directories are not overwritten')
            task_contracts_fingerprint = task_contracts.fingerprint(dossier)
            job.update(subset_id=body['subset_id'], objective='diagnostic',
                       dossier_sha256=task_contracts_fingerprint)
            ray_workbench.profile(STATE)
        elif kind == 'acquire':
            rid = int(body['record_id'])
            record = read(STATE / 'records' / f'{rid}.json')
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
        elif kind == 'harmonize':
            normalization_manifests(root)
        elif kind == 'benchmark':
            recipe, image, blockers = recipe_check(body['recipe_id'], root)
            if blockers:
                raise ValueError('; '.join(blockers))
            job.update(recipe=recipe, image=image)
        save(folder / 'job.json', job)
        with (folder / 'worker.log').open('ab') as log:
            p = subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--worker',str(folder)],
                                 stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        (folder / 'worker.pid').write_text(str(p.pid))
        # The worker owns subsequent state writes, avoiding a launch-time update race.
        return {'id':job_id,'pid':p.pid}


def submit_ray(body):
    from filelock import FileLock
    if set(body) - {'kind', 'recipe_id', 'root'}:
        raise ValueError('Ray deployment, image and command are fixed by the audited server profile')
    p = ray_workbench.profile(STATE)
    if body.get('root') != p['input_dir']:
        raise ValueError('Only the audited frozen Wytham input directory is supported')
    with GUARD, FileLock(str(STATE / 'submission.lock'), timeout=0):
        if any(j['status'] in ray_workbench.ACTIVE for j in jobs()):
            raise ValueError('A Canopy job is already active')
        ray_workbench.preflight(p)
        remote = json.loads(ray_workbench.call(p, 'get', 'rayjobs', '-l', 'app.kubernetes.io/part-of=canopy', '-o', 'json'))
        if any(j.get('status', {}).get('jobDeploymentStatus') not in {'Complete', 'Failed', 'ValidationFailed'} for j in remote['items']):
            raise ValueError('An existing Canopy RayJob is still active; inspect it before submitting')
        jid = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + secrets.token_hex(4)
        job = {'id':jid, 'kind':'benchmark', 'backend':'ray', 'recipe_id':ray_workbench.RECIPE,
               'root':p['input_dir'], 'output_dir':p['output_base']+'/'+jid,
               'ray_name':'canopy-'+jid.lower(), 'ray_profile':p, 'status':'queued', 'created_at':now()}
        folder = STATE / 'jobs' / jid
        manifest = ray_workbench.manifest(job)
        # Persist submission intent before network I/O. Never retry an uncertain create.
        save(folder / 'job.json', job)
        save(folder / 'rayjob.json', manifest)
        try:
            response = ray_workbench.call(p, 'create', '-f', '-', payload=json.dumps(manifest))
            (folder/'worker.log').write_text(response)
        except (ValueError, OSError, subprocess.TimeoutExpired) as e:
            job['connection_error'] = str(e)
            save(folder/'job.json', job)
            raise ValueError(f'Submission outcome requires reconciliation: {jid}. Refresh jobs; do not resubmit.') from e
        return {'id':jid, 'backend':'ray'}


def job_path(jid):
    if not re.fullmatch(r'[0-9T]+-[a-f0-9]{8}', jid):
        raise ValueError('Invalid job ID')
    return STATE / 'jobs' / jid / 'job.json'


def cancel_ray(jid):
    with GUARD:
        path = job_path(jid)
        job = read(path)
        if job.get('backend') != 'ray' or job['status'] not in ray_workbench.ACTIVE:
            raise ValueError('Only active Workbench Ray jobs can be cancelled')
        # Keep cancellation intent durable even if the API response is lost.
        job.update(cancel_requested=True, status='cancelling')
        save(path, job)
        try:
            ray_workbench.cancel(job)
        finally:
            save(path, job)
        RAY_CHECKED.pop(jid, None)
        return {'id':jid, 'status':job['status']}


def normalization_manifests(root):
    from normalization_inputs import source_policy
    manifests = []
    for path in sorted((root / 'sources').glob('*/manifests/*.json')):
        if path.name.startswith('._'):
            continue
        meta = read(path)
        if int(meta['record_id']) != 15193973:
            source_policy(int(meta['record_id']))
        manifests.append(meta)
    if not manifests:
        raise ValueError('Normalization requires acquired file manifests')
    return manifests


def audit(root, output):
    from plan_lidar_curation import build_plan, render_markdown

    report = build_plan(root, check_files=True, progress=lambda message: print(message, flush=True))
    save(output / 'curation-report.json', report)
    (output / 'curation-plan.md').write_text(render_markdown(report))
    print(f"Reviewed {report['files']} file records; {len(report['duplicate_groups'])} source duplicate groups; "
          f"{len(report['normalized_duplicate_groups'])} normalized groups; {len(report['errors'])} errors", flush=True)
    return bool(report['errors'])


def worker(folder):
    from filelock import FileLock
    job = read(folder / 'job.json')
    job.update(status='running',pid=os.getpid(),started_at=now())
    save(folder / 'job.json', job)
    try:
        root = Path(job['root'])
        # All Canopy workers and the existing acquisition CLI share this lock.
        lock = REPO / 'temp/lidar-acquisition.lock'
        if job['kind'] == 'acquire':
            command = [sys.executable,str(REPO/'scripts/acquire_lidar.py'),'--inventory',str(folder/'inventory.json'),
                       '--root',str(root),'--stage',str(REPO/'temp'/('canopy-stage-'+hashlib.sha256(str(root).encode()).hexdigest()[:16])),'--resume']
            job['command'] = command
            save(folder/'job.json',job)
            subprocess.run(command,check=True)
        elif job['kind'] == 'prepare-task':
            if task_contracts.fingerprint(task_contracts.load()) != job['dossier_sha256']:
                raise ValueError('Task evidence or implementation changed after submission; review before retrying')
            print('Copying the audited frozen reference with chunk and final SHA256 verification', flush=True)
            report = task_contracts.prepare_subset(STATE, root, job['subset_id'])
            save(folder/'task-package-report.json', report)
            print(f'Prepared diagnostic task package in {root}', flush=True)
        else:
            with FileLock(str(lock), timeout=0):
                if job['kind'] == 'audit':
                    if audit(root, folder):
                        job['status'] = 'completed_with_errors'
                elif job['kind'] == 'harmonize':
                    from harmonize_lidar import harmonize
                    results = []
                    for meta in normalization_manifests(root):
                        for item in meta['outputs']:
                            result = harmonize(root, int(meta['record_id']), item)
                            if result:
                                results.append(result)
                                print(f"NORMALIZATION {item['path']}: {result['status']}", flush=True)
                    save(folder / 'harmonization-report.json', {'results': results, 'created_at': now(),
                         'scope': 'Existing source/schema normalization; original XYZ and fields preserved. Known mapping limitations remain; no new task or rights admission.'})
                else:
                    recipe,image = job['recipe'],job['image']
                    _,_,blockers = recipe_check(recipe['id'],root)
                    if blockers:
                        raise ValueError('; '.join(blockers))
                    (folder/'results').mkdir(exist_ok=True)
                    job['input_sha256'] = {n:sha(root/n) for n in recipe['required_files']}
                    command = ['docker','run','--rm','--pull=never','--network=none','--cap-drop=ALL',
                               '--security-opt=no-new-privileges','--user',f'{os.getuid()}:{os.getgid()}',
                               '--memory=16g','--cpus=4','--pids-limit=512',
                               '--mount',f'type=bind,src={root},dst=/inputs,readonly',
                               '--mount',f"type=bind,src={folder / 'results'},dst=/outputs",
                               '--workdir',image['working_directory'],image['reference'],*recipe['command']]
                    job['command'] = command
                    save(folder/'job.json',job)
                    subprocess.run(command,check=True)
        job['status'] = job['status'] if job['status'] == 'completed_with_errors' else 'completed'
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
            if parsed.path == '/api/task-dossiers':
                return self.send_json(task_contracts.load())
            if parsed.path == '/api/state':
                with GUARD:
                    current_jobs = jobs()
                try:
                    p = ray_workbench.profile(STATE)
                    remote = {'configured':True, 'input_dir':p['input_dir'], 'context':p['context'], 'namespace':p['namespace']}
                except ValueError as e:
                    remote = {'configured':False, 'detail':str(e)}
                return self.send_json({'token':TOKEN,'jobs':current_jobs,'registry':registry(), 'ray':remote,
                                       'records':[{'id':r['record_id'],'title':r['title']} for r in records()]})
            if parsed.path == '/api/log':
                jid = parse_qs(parsed.query).get('id',[''])[0]
                folder = job_path(jid).parent
                job = read(folder/'job.json')
                if job.get('backend') == 'ray':
                    result = ray_workbench.evidence(job)
                    result['log'] = json.dumps(job.get('ray_status', {}), indent=2) + '\n' + result['log']
                    return self.send_json(result)
                p = folder / 'worker.log'
                with p.open('rb') as f:
                    f.seek(max(0,p.stat().st_size-32000))
                    log = f.read().decode(errors='replace')
                folder = p.parent
                reports = {q.name:read(q) for q in folder.glob('*report.json')}
                return self.send_json({'log':log,'reports':reports})
            if parsed.path == '/api/artifact':
                query = parse_qs(parsed.query)
                jid, name = query.get('id',[''])[0], query.get('name',[''])[0]
                job = read(job_path(jid))
                if job.get('backend') != 'ray' or name not in ray_workbench.FILES:
                    raise ValueError('Unknown Ray artifact')
                folder = job_path(jid).parent/'artifacts'
                folder.mkdir(exist_ok=True)
                # Cache a complete read-back on disk before sending HTTP headers.
                with GUARD:
                    path = folder/Path(name).name
                    if not path.exists():
                        temporary = path.with_suffix('.partial')
                        try:
                            ray_workbench.download(job, name, temporary)
                            temporary.replace(path)
                        finally:
                            temporary.unlink(missing_ok=True)
                self.send_response(200)
                self.send_header('Content-Type','application/octet-stream')
                self.send_header('Content-Disposition',f'attachment; filename="{path.name}"')
                self.send_header('Content-Length',str(path.stat().st_size))
                self.send_header('Cache-Control','no-store')
                self.end_headers()
                with path.open('rb') as source:
                    shutil.copyfileobj(source, self.wfile, length=1024**2)
                return
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
            if self.path == '/api/cancel':
                return self.send_json(cancel_ray(body['id']))
            if self.path == '/api/preflight' and body['recipe_id'] == ray_workbench.RECIPE:
                p = ray_workbench.profile(STATE)
                if body.get('root') != p['input_dir']:
                    raise ValueError('Use the audited frozen Wytham input directory')
                detail = ray_workbench.preflight(p)
                return self.send_json({'ready':True, 'blockers':[], 'detail':detail})
            if self.path == '/api/preflight':
                _,_,blockers = recipe_check(body['recipe_id'],directory(body['root']))
                return self.send_json({'ready':not blockers,'blockers':blockers})
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
