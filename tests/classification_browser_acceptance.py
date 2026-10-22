"""Isolated Chromium/Firefox acceptance against independent native references.

Uses the shipped UI/worker/decoders and an independent Python ZIP/LAS reader.
Fixture admission exists only in the test HTTP origin. Production pins are never
changed. Browser selections are bounded; native full-source auditing is separate.
"""
import argparse
import functools
import hashlib
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
import time
import zipfile

from playwright.sync_api import sync_playwright
from classification_fixtures import ROOT,build,build_real,build_full,build_paired
from classification_memory import ProcessMemory
sys.path.insert(0,str(ROOT/'scripts'))
from classification.model import check
from classification.package import TreeDataset
from classification.canonical import fingerprint
from classification.snapshot import FOR,BIODIV,write


def main():
    implementation_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser',choices=['chromium','firefox','both'],default='both')
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--real',action='store_true',help='Use locally available pinned real clouds in small repackaged archives')
    mode.add_argument('--full',action='store_true',help='Traverse complete original provider archives using the frozen native selection')
    mode.add_argument('--paired',action='store_true',help='Run all four uses with exact real paired clouds from full-original acceptance')
    parser.add_argument('--use',choices=['training','validation','evaluation','inference'],help='Run one full-original scenario')
    args=parser.parse_args()
    destination=ROOT/'temp/classification'/('full-fixtures' if args.full else 'paired-fixtures' if args.paired else 'real-fixtures' if args.real else 'fixtures')
    fixture=(build_full if args.full else build_paired if args.paired else build_real if args.real else build)(destination)
    class Handler(SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path.split('?')[0]=='/browser-prepare/classification-runtime-lock.json':
                self.path='/'+str((destination/'runtime-lock.json').relative_to(ROOT))
            super().do_GET()
        def log_message(self,*_):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    reports=[]
    try:
        with sync_playwright() as p:
            for browser_name in (['chromium','firefox'] if args.browser=='both' else [args.browser]):
                browser=getattr(p,browser_name).launch(headless=True,args=['--no-sandbox'] if browser_name=='chromium' else [])
                try:
                    scenarios=[('inference','genus')] if args.real else [('training','genus'),('validation','species'),('evaluation','species'),('inference','species')]
                    if args.use:scenarios=[s for s in scenarios if s[0]==args.use]
                    for use,rank in scenarios:
                        memory=ProcessMemory().start();started=time.monotonic()
                        page=browser.new_page(accept_downloads=True);errors=[]
                        page.on('pageerror',lambda e:errors.append(str(e)))
                        page.goto(f'http://127.0.0.1:{server.server_port}/index.html',wait_until='networkidle')
                        page.select_option('#preparation-task','task:species')
                        page.wait_for_function("document.querySelector('#classification-source').options.length===2")
                        page.select_option('#classification-use',use);page.select_option('#classification-rank',rank)
                        if args.full:page.locator('details').filter(has=page.locator('#classification-trees')).locator('summary').click()
                        sources=[FOR,BIODIV] if use in ['training','inference'] else [BIODIV]
                        for ref in sources:
                            page.select_option('#classification-source',ref)
                            if args.full:
                                identities=sorted({o['tree_id'] for o in fixture['observations'] if o['source_ref']==ref})
                                page.select_option('#classification-trees',identities)
                            if args.real and ref==BIODIV:page.select_option('#classification-modalities',['TLS'])
                            page.click('#classification-add')
                            if args.real and ref==BIODIV:
                                page.select_option('#classification-modalities',['ULS']);page.click('#classification-add')
                        if use=='training':
                            page.select_option('#preparation-task','task:instances')
                            assert page.locator('#classification-panel').is_hidden()
                            page.select_option('#preparation-task','task:species')
                            assert page.locator('#classification-draft-list li').count()==2
                            page.reload(wait_until='networkidle');page.select_option('#preparation-task','task:species')
                            page.wait_for_function("document.querySelector('#classification-draft-list').children.length===2")
                        page.click('#classification-review')
                        page.wait_for_function("!document.querySelector('#classification-plan').hidden",timeout=120000)
                        plan=json.loads(page.locator('#classification-plan-text').inner_text())
                        write(destination/(browser_name+'-'+use+'-plan.json'),plan)
                        check(fixture['registry'],fixture['vocabulary'],fixture['trees'],plan,
                              runtime_sha256=plan['runtime_sha256'],code_sha256=plan['code_sha256'])
                        input_root=ROOT/'temp/classification/originals' if args.full else destination
                        inputs=[str(input_root/a['name']) for a in plan['archives']]
                        page.set_input_files('#classification-files',inputs)
                        page.click('#classification-run')
                        phase=""
                        while page.locator('#classification-download').is_hidden():
                            current=page.locator('#classification-status').inner_text()
                            if current.startswith(('Preparation failed:','Local file must identify')):raise AssertionError(browser_name+': '+current)
                            if current!=phase:print(json.dumps(dict(browser=browser_name,use=use,phase=current)),flush=True);phase=current
                            if time.monotonic()-started>(7200 if args.full else 300):raise TimeoutError('Acceptance scenario timed out')
                            page.wait_for_timeout(10000 if args.full else 100)
                        status=page.locator('#classification-status').inner_text()
                        if status.startswith('Preparation failed:'):raise AssertionError(browser_name+': '+status)
                        with page.expect_download(timeout=60000) as event:page.click('#classification-download')
                        path=ROOT/'temp/classification'/f'{browser_name}-{"full-" if args.full else "paired-" if args.paired else "real-" if args.real else ""}{use}.zip';event.value.save_as(path)
                        folder=path.with_suffix('');folder.mkdir(exist_ok=True)
                        with zipfile.ZipFile(path) as archive:
                            if archive.testzip() is not None:raise AssertionError('Independent ZIP CRC failure')
                            names=archive.namelist()
                            if len(names)!=len(set(names)) or any('..' in Path(name).parts or name.startswith('/') for name in names):raise AssertionError('Unsafe ZIP')
                            archive.extractall(folder)
                        report=TreeDataset(folder).validate()
                        run_evidence=json.loads((folder/'browser-run.json').read_text())
                        assert report['observations']==plan['totals']['observations']
                        assert not errors,errors
                        reports.append(dict(browser=browser_name,version=browser.version,use=use,rank=rank,
                            zip_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),zip_size=path.stat().st_size,
                            plan_sha256=plan['plan_sha256'],runtime_sha256=plan['runtime_sha256'],code_sha256=plan['code_sha256'],
                            observed_memory=run_evidence['observed_memory'],process_memory=memory.finish(),
                            archive_verification=run_evidence['archive_verification'],
                            elapsed_seconds=round(time.monotonic()-started,2),**report))
                        print(json.dumps(reports[-1]),flush=True)
                        # Independent reader must reject altered stored arrays.
                        block=json.loads((folder/'dataset.json').read_text())['observations'][0]['blocks'][0]
                        array_path=folder/block['xyz_path'];original=array_path.read_bytes()
                        array_path.write_bytes(bytes([original[0]^1])+original[1:])
                        try:
                            TreeDataset(folder).validate()
                            raise AssertionError('Independent reader accepted corrupted output')
                        except ValueError as error:
                            assert 'CHECKSUM' in str(error)
                        finally:array_path.write_bytes(original)
                        if use=='training' and not args.full:
                            # BioDiv finishes first; corrupt FOR, the second source.
                            inputs=[]
                            for asset in plan['archives']:
                                data=(destination/asset['name']).read_bytes()
                                if asset['source_ref']==FOR:
                                    damaged=bytearray(data)
                                    with zipfile.ZipFile(destination/asset['name']) as archive:
                                        entry=archive.infolist()[0]
                                        offset=entry.header_offset+30+len(entry.filename.encode())+len(entry.extra)
                                    damaged[offset+2]^=1;data=bytes(damaged)
                                inputs.append(dict(name=asset['name'],mimeType='application/octet-stream',buffer=data))
                            page.set_input_files('#classification-files',inputs);page.click('#classification-run')
                            page.wait_for_function("document.querySelector('#classification-status').textContent.startsWith('Preparation failed:')",timeout=120000)
                            assert page.locator('#classification-download').is_hidden()
                            directories=page.evaluate("async()=>{const root=await navigator.storage.getDirectory();const jobs=await root.getDirectoryHandle('canopy-classification');const names=[];for await(const name of jobs.keys())names.push(name);return names;}")
                            assert directories==[],directories
                            reports[-1]['second_source_corruption']='rejected-without-zip-and-staging-cleared'
                            page.click('#classification-review')
                            page.wait_for_function("!document.querySelector('#classification-plan').hidden",timeout=120000)
                            page.evaluate("""async()=>{
                                document.querySelector('#classification-run').click();
                                await new Promise((resolve,reject)=>{let checking=false;const timeout=setTimeout(()=>reject(Error('No active staging to cancel')),10000);const id=setInterval(async()=>{
                                    if(checking)return;checking=true;
                                    const cancel=document.querySelector('#classification-cancel');
                                    try {
                                        const root=await navigator.storage.getDirectory();const jobs=await root.getDirectoryHandle('canopy-classification');
                                        const names=[];for await(const name of jobs.keys())names.push(name);
                                        if(!cancel.disabled&&names.length){cancel.click();clearInterval(id);clearTimeout(timeout);resolve();}
                                    } catch(error){if(error.name!=='NotFoundError'){clearInterval(id);clearTimeout(timeout);reject(error);}}
                                    finally{checking=false;}
                                },5);});
                            }""")
                            page.wait_for_function("document.querySelector('#classification-status').textContent.startsWith('Cancelled')")
                            assert page.locator('#classification-download').is_hidden()
                            assert 'Cancelled' in page.locator('#classification-status').inner_text()
                            directories=page.evaluate("async()=>{const root=await navigator.storage.getDirectory();const jobs=await root.getDirectoryHandle('canopy-classification');const names=[];for await(const name of jobs.keys())names.push(name);return names;}")
                            assert directories==[],directories
                            reports[-1]['cancellation']='rejected-without-zip-and-active-staging-cleared'
                        page.close()
                finally:browser.close()
    finally:server.shutdown();server.server_close()
    report_name='full-browser-acceptance'+('-'+args.use if args.use else '')+'.json' if args.full else 'paired-browser-acceptance.json' if args.paired else 'real-browser-acceptance.json' if args.real else 'browser-acceptance.json'
    write(ROOT/'evidence/classification'/report_name,dict(schema_version='1.0.0',
        status='original-archive-selection-validated' if args.full else 'bounded-native-samples-validated' if args.real or args.paired else 'bounded-fixture-validated',
        scope='Complete original BioDiv TLS/ULS archives traversed once each; original FOR ZIPs selectively read' if args.full else 'Exact original paired cloud bytes in small repackaged archives' if args.paired else 'Exact original cloud bytes in small repackaged archives' if args.real else 'Synthetic isolated fixture',
        implementation_sha256=implementation_sha256,
        fixture_sha256=fingerprint(fixture['observations']),runs=reports,
        limitations=['Acceptance runs do not constitute publication admission',
                     'Selected browser observations are bounded; the independent native audit covers every point cloud',
                     'Process memory is sampled, not an instrumented allocation limit']))


if __name__=='__main__':main()
