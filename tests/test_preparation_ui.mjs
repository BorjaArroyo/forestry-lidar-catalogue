import {validJob, lockName} from '../browser-prepare/run-store.js';
import {emptyDraft, readDraft, sameRequest} from '../browser-prepare/dataset-draft.js';
import {DraftPanel} from '../browser-prepare/draft-panel.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {RunSession} from '../browser-prepare/run-session.js';
import {datasetPlots} from '../browser-prepare/selection.js';
import {profileForPipeline} from '../browser-prepare/profiles.js';

async function panel({savedStorage, savedRuns = [], missingRun = false} = {}) {
  const elements = new Map(), listeners = new Map(), workers = [], timers = new Map(), storage = new Map();
  let serial = 0, inspections = 0;
  const removed = [];
  const localValues = savedStorage || new Map();
  const localStorage = {getItem:key=>localValues.get(key),setItem:(key,value)=>localValues.set(key,value),removeItem:key=>localValues.delete(key)};
  const node = id => ({id, dataset:{}, value:id==='prepare-mode'?'las':'',files:[],options:[],
    replaceChildren(){this.options=[];this.value='';},append(...options){for(const option of options){this.options.push(option);if(!this.value)this.value=option.value;}}});
  const element = id => {
    if (!elements.has(id)) elements.set(id, node(id));
    return elements.get(id);
  };
  class Worker {
    constructor() {workers.push(this);}
    postMessage(request) {this.request = request;}
    terminate() {this.terminated = true;}
  }
  const directory = {async getDirectoryHandle() {return this;}, async removeEntry(id) {removed.push(id);}};
  const context = vm.createContext({URL, Blob, validJob, lockName, openRun:async()=>{if(missingRun)throw Object.assign(Error('Missing run'),{name:'NotFoundError'});return {jobs:directory};}, inspectRuns:async()=>{inspections++; return savedRuns;}, profileForPipeline, datasetPlots, DraftPanel, emptyDraft, readDraft, sameRequest,
    RunSession: class extends RunSession {
      constructor(options) {super({...options, schedule: callback => {timers.set(++serial, callback); return serial;}, unschedule: id => timers.delete(id)});}
    }, Worker, CustomEvent: class {constructor(type, options) {this.type = type; this.detail = options.detail;}},
    window: {Worker, localStorage, isSecureContext: true, addEventListener() {}},
    document: {getElementById: element, createElement: () => node(),
      addEventListener(type, fn) {listeners.set(type, fn);}, dispatchEvent() {}},
    navigator: {storage: {getDirectory: async () => directory}, locks: {request: async (name, options, fn) => fn({})}},
    sessionStorage: {getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key)},
    fetch: async url => ({ok: true, json: async () => JSON.parse(fs.readFileSync(new URL(String(url).includes('/fgi_emit/') ? '../scripts/fgi_emit/source-lock.json' : '../scripts/for_instance/source-lock.json', import.meta.url), 'utf8'))}),
  });
  vm.runInContext(fs.readFileSync(new URL('../catalog.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../task-selection.js',import.meta.url),'utf8'),context);
  let request = context.window.CanopyTaskSelection.normalize();
  context.window.CanopyHub = {catalog: context.window.LIDAR_CATALOG, getTaskRequest: () => request,setTaskRequest:value=>{request=context.window.CanopyTaskSelection.normalize(value.use,value.variables);listeners.get('canopy-task-request')?.();}};
  const code = fs.readFileSync(new URL('../browser-prepare/ui.js',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify('http://localhost/browser-prepare/ui.js'));
  vm.runInContext(code,context);
  const settle = async () => {for (let i=0;i<40;i++) await Promise.resolve();};
  await settle();
  const review = async () => {
    element('prepare-review').onclick();
    const worker = workers.at(-1), intent = worker.request;
    assert.equal(intent.operation, 'review');
    const records=[...new Set(intent.subsets.map(s=>s.record_id))].sort();
    const sourcePlans=records.map(record=>{
      const subsets=intent.subsets.filter(s=>s.record_id===record).map(s=>s.paths);
      const paths=[...new Set(subsets.flat())];
      const membership=JSON.parse(fs.readFileSync(new URL(record==='19351234'?'../scripts/fgi_emit/source-lock.json':'../scripts/for_instance/source-lock.json',import.meta.url),'utf8')).plots;
      const result=context.window.CanopyTaskSelection.assess(record,intent.task_request);
      return {schema_version:'1.0.0',task_plan:{...intent.task_request,source_ref:'zenodo:'+record,pipeline_ref:result.pipeline_ref,included:result.included,omitted:result.omitted},
        subsets,plots:paths.map(path=>membership.find(p=>p.path===path)),
        totals:{plots:paths.length,points:100,overlapping_selections:0,source_las_bytes:1000,estimated_browser_storage_bytes:10000},
        output:{partitions:[...new Set(paths.map(path=>membership.find(p=>p.path===path).published_split))]},limitations:[],plan_sha256:'a'.repeat(64)};
    });
    worker.onmessage({data:{type:'result',operation:'review',plan:{schema_version:'2.0.0',request:intent.task_request,source_plans:sourcePlans,
      totals:{plots:sourcePlans.reduce((n,p)=>n+p.plots.length,0),points:100,overlapping_selections:0,source_las_bytes:1000,estimated_browser_storage_bytes:10000},
      output:{partitions:sourcePlans.flatMap(p=>p.output.partitions)},limitations:['No geographic independence claim'],plan_sha256:'a'.repeat(64)}}});
    await settle();
    return worker;
  };
  return {inspections:()=>inspections, review, removed, element, workers, timers, listeners, settle, savedStorage:localValues, setRequest(value) {request = context.window.CanopyTaskSelection.normalize(value.use, value.variables);}};
}

test('all catalog sources remain selectable; an unadmitted source cannot execute', async () => {
  const p = await panel();
  assert.equal(p.element('prepare-source').options.length, 10);
  p.element('prepare-source').value = '16742708'; await p.element('prepare-source').onchange();
  assert.match(p.element('prepare-source-status').textContent, /FOR-instance/);
  assert.match(p.element('prepare-status').textContent, /No admitted/);
  assert.equal(p.element('prepare-run').disabled, true); assert.equal(p.workers.length, 0);
});
test('requirements and selected source are sent to the worker; old failures cannot stop a retry', async () => {
  const p = await panel(); p.element('prepare-file').files = [{name: 'fixture.las'}];
  p.element('prepare-mode').value = 'las'; p.element('prepare-mode').onchange();
  await p.element('prepare-run').onclick();
  assert.equal(p.workers[0].request.record_id, '8287792');
  assert.equal(p.workers[0].request.task_request.use, 'training');
  const stale = [...p.timers.values()][0]; p.workers[0].onerror({message: 'fixture'}); await p.settle();
  await p.element('prepare-run').onclick(); stale();
  assert.equal(p.workers[1].terminated, undefined); assert.equal(p.timers.size, 1);
  await p.element('prepare-cancel').onclick(); assert.equal(p.timers.size, 0);
});
test('partition choices track use; required missing measurements disable preparation', async () => {
  const p = await panel();
  assert.ok(p.element('prepare-plot').options.every(o => !o.textContent.includes(' · test · ')));
  p.setRequest({use: 'inference'}); p.listeners.get('canopy-task-request')();
  assert.ok(p.element('prepare-plot').options.some(o => o.textContent.includes(' · test · ')));
  p.element('prepare-file').files = [{name: 'fixture.las'}];
  p.setRequest({use: 'inference', variables: {reflectance: 'required'}}); p.listeners.get('canopy-task-request')();
  assert.equal(p.element('prepare-run').disabled, true); assert.match(p.element('prepare-status').textContent, /reflectance/);
});

test('collections and partitions select a dataset; plots remain an advanced subset', async () => {
  const p = await panel();
  for (const option of p.element('prepare-collections').options) option.selected = option.value === 'RMIT';
  p.element('prepare-collections').onchange();
  assert.equal(p.element('prepare-plot').options.length, 1);
  assert.match(p.element('prepare-selection-summary').textContent, /1 complete plots/);
  assert.equal(p.element('prepare-run').disabled,true);
  await p.review(); await p.element('prepare-run').onclick();
  assert.equal(p.workers[1].request.execution_plan.source_plans.flatMap(p=>p.plots).length, 1);
  assert.match(p.workers[1].request.execution_plan.source_plans.flatMap(p=>p.plots)[0].path, /RMIT\/train.las/);
  await p.element('prepare-cancel').onclick();
});

test('subsets persist on reload and execute the saved union rather than the current selector', async () => {
  let p = await panel();
  for(const o of p.element('prepare-collections').options) o.selected=o.value==='RMIT';
  p.element('prepare-collections').onchange();p.element('prepare-add').onclick();
  for(const o of p.element('prepare-collections').options) o.selected=o.value==='CULS';
  p.element('prepare-collections').onchange();p.element('prepare-add').onclick();
  assert.equal(p.element('dataset-draft-list').options.length,2);
  p = await panel({savedStorage:p.savedStorage});
  assert.equal(p.element('dataset-draft-list').options.length,2);
  assert.equal(p.element('prepare-run').textContent,'Prepare my dataset');
  await p.review(); await p.element('prepare-run').onclick();
  const paths=p.workers[1].request.execution_plan.source_plans.flatMap(p=>p.plots).map(plot=>plot.path);
  assert.ok(paths.some(path=>path.includes('/RMIT/')));assert.ok(paths.some(path=>path.includes('/CULS/')));
  assert.ok(paths.every(path=>path.includes('/RMIT/')||path.includes('/CULS/')));
  assert.equal(p.element('dataset-draft-clear').disabled,true);
  await p.element('prepare-cancel').onclick();
});
test('changed requirements block the saved dataset until explicitly restored', async () => {
  const p=await panel();p.element('prepare-add').onclick();
  p.setRequest({use:'inference'});p.listeners.get('canopy-task-request')();
  assert.equal(p.element('prepare-run').disabled,true);
  assert.equal(p.element('dataset-draft-restore').hidden,false);
  p.element('dataset-draft-restore').onclick();
  assert.equal(p.element('prepare-review').disabled,false);
  assert.equal(p.element('prepare-run').disabled,true);
  p.element('dataset-draft-clear').onclick();
  assert.equal(p.element('dataset-draft-list').options.length,0);
});
test('malformed saved data is visible and requires clearing before preparation', async () => {
  const savedStorage=new Map([['canopy-dataset-draft-v1','{"schema_version":"unknown"}']]);
  const p=await panel({savedStorage});
  assert.match(p.element('dataset-draft-status').textContent,/could not be read/);
  assert.equal(p.element('prepare-run').disabled,true);
  p.element('dataset-draft-clear').onclick();
  assert.equal(p.element('prepare-review').disabled,false);
});

test('editing saved selection invalidates the plan; changing only the selector does not', async () => {
  const p=await panel();
  for(const o of p.element('prepare-collections').options)o.selected=o.value==='RMIT';
  p.element('prepare-collections').onchange();p.element('prepare-add').onclick();
  const review=await p.review();
  assert.equal(review.terminated,true);assert.equal(p.element('prepare-run').disabled,false);
  assert.equal(p.element('dataset-plan').hidden,false);
  for(const o of p.element('prepare-collections').options)o.selected=o.value==='CULS';
  p.element('prepare-collections').onchange();
  assert.equal(p.element('prepare-run').disabled,false);
  p.element('prepare-add').onclick();
  assert.equal(p.element('prepare-run').disabled,true);assert.equal(p.element('dataset-plan').hidden,true);
  await p.review();p.setRequest({use:'inference'});p.listeners.get('canopy-task-request')();
  assert.equal(p.element('prepare-run').disabled,true);assert.equal(p.element('dataset-plan').hidden,true);
});
test('failed or cancelled reviews cannot leave an executable plan', async () => {
  const p=await panel();p.element('prepare-review').onclick();
  assert.equal(p.element('prepare-run').disabled,true);assert.equal(p.element('prepare-add').disabled,true);
  p.workers[0].onmessage({data:{type:'error',error:'Stale source pin'}}); await p.settle();
  assert.equal(p.element('prepare-run').disabled,true);assert.equal(p.element('prepare-review').disabled,false);
  p.element('prepare-review').onclick();const stale=p.workers.at(-1);
  await p.element('prepare-cancel').onclick();
  stale.onmessage({data:{type:'result',operation:'review',plan:{}}});
  assert.equal(p.element('prepare-run').disabled,true);
});

test('a stale runtime or source rejection requires a fresh plan before retry', async () => {
  const p=await panel();await p.review();await p.element('prepare-run').onclick();
  p.workers.at(-1).onmessage({data:{type:'error',code:'DATASET_PLAN_STALE',error:'Dataset plan changed; review again'}}); await p.settle();
  assert.equal(p.element('prepare-run').disabled,true);assert.equal(p.element('dataset-plan').hidden,true);
  assert.equal(p.element('prepare-review').disabled,false);
});

test('cancelling a metadata review preserves an existing completed dataset ZIP', async () => {
  const p=await panel();p.element('prepare-mode').value='las';p.element('prepare-file').files=[{}];p.element('prepare-mode').onchange();
  await p.element('prepare-run').onclick();const worker=p.workers.at(-1);
  worker.onmessage({data:{type:'job',id:'previous-output'}});
  worker.onmessage({data:{type:'result',file:new Blob(['fixture']),evidence:{report:{plots:1,points:3,chunks:1},request:{use:'training'},sources:[{task_plan:{source_ref:'zenodo:8287792',omitted:{}}}]}}}); await p.settle();
  p.element('prepare-mode').value='zenodo';p.element('prepare-mode').onchange();
  p.element('prepare-review').onclick();await p.element('prepare-cancel').onclick();
  assert.equal(p.removed.length,0);assert.equal(p.element('prepare-download').hidden,false);
  assert.match(p.element('prepare-status').textContent,/previous prepared output retained/);
});

test('plan import validates before replacing saved subsets and sends the verified plan to execution', async () => {
  const p=await panel();p.element('prepare-add').onclick();
  const source=JSON.parse(fs.readFileSync(new URL('../scripts/for_instance/source-lock.json',import.meta.url),'utf8'));
  const plot=source.plots.find(plot=>plot.path.includes('/RMIT/')&&plot.published_split==='dev');
  const request={use:'training',variables:{xyz:'required',instance_reference:'required',reflectance:'optional'}};
  const plan={schema_version:'1.0.0',task_plan:{...request,source_ref:'zenodo:8287792',pipeline_ref:'pipeline:for-instance-plot-instances:1.0.0',included:{xyz:['xyz'],instance_reference:['instance','instance_valid']},omitted:{reflectance:'unavailable'}},
    subsets:[[plot.path]],plots:[plot],totals:{plots:1,points:plot.points,overlapping_selections:0,source_las_bytes:plot.size_bytes,estimated_browser_storage_bytes:100000},output:{partitions:['dev']},limitations:[],plan_sha256:'a'.repeat(64)};
  const text=JSON.stringify(plan);p.element('dataset-plan-file').files=[{size:text.length,text:async()=>text}];
  await p.element('dataset-plan-file').onchange();
  assert.equal(p.workers[0].request.operation,'import');assert.equal(p.element('dataset-draft-list').options.length,1);
  p.workers[0].onmessage({data:{type:'result',operation:'import',plan,source_plots:source.plots}});
  assert.match(p.element('dataset-draft-list').options[0].options[0].textContent,/RMIT/);
  assert.equal(p.element('prepare-run').disabled,false);
  await p.element('prepare-run').onclick();assert.deepEqual(p.workers[1].request.execution_plan,plan);
});
test('invalid or oversized imports preserve the existing dataset selection', async () => {
  const p=await panel();p.element('prepare-add').onclick();const before=new Map(p.savedStorage);
  p.element('dataset-plan-file').files=[{size:1048577,text:async()=>''}];await p.element('dataset-plan-file').onchange();
  assert.equal(p.workers.length,0);assert.deepEqual(p.savedStorage,before);
  const text=JSON.stringify({schema_version:'1.0.0',task_plan:{source_ref:'zenodo:8287792'}});
  p.element('dataset-plan-file').files=[{size:text.length,text:async()=>text}];await p.element('dataset-plan-file').onchange();
  p.workers[0].onmessage({data:{type:'error',error:'Stale or tampered plan'}});
  assert.deepEqual(p.savedStorage,before);assert.equal(p.element('dataset-draft-list').options.length,1);
});

test('admitted FGI source supports required spectral channels and official training membership', async () => {
  const p=await panel();p.element('prepare-source').value='19351234';await p.element('prepare-source').onchange();
  p.setRequest({use:'training',variables:{reflectance:'required'}});p.listeners.get('canopy-task-request')();
  assert.equal(p.element('prepare-review').disabled,false);
  assert.equal(p.element('prepare-plot').options.length,13);
  assert.ok(p.element('prepare-plot').options.every(o=>o.textContent.includes(' · train · ')));
});


test('both saved sources survive reload and execute independently of the current selector', async () => {
  let p=await panel();
  for(const option of p.element('prepare-collections').options)option.selected=option.value==='RMIT';
  p.element('prepare-collections').onchange();p.element('prepare-add').onclick();
  p.element('prepare-source').value='19351234';await p.element('prepare-source').onchange();
  for(const option of p.element('prepare-plot').options)option.selected=option.value.endsWith('plot_1022.las');
  p.element('prepare-plot').onchange();p.element('prepare-add').onclick();
  p=await panel({savedStorage:p.savedStorage});
  assert.match(p.element('dataset-draft-summary').textContent,/2 sources/);
  p.element('prepare-source').value='16742708';await p.element('prepare-source').onchange();
  await p.review();assert.equal(p.element('prepare-run').disabled,false);
  await p.element('prepare-run').onclick();
  const run=p.workers.at(-1).request;
  assert.deepEqual([...run.execution_plan.source_plans.map(p=>p.task_plan.source_ref)].sort(),['zenodo:19351234','zenodo:8287792']);
  assert.equal(run.subsets.length,2);
});

test('required reflectance blocks a mixed saved selection without deleting it', async () => {
  const p=await panel();p.element('prepare-add').onclick();
  p.element('prepare-source').value='19351234';await p.element('prepare-source').onchange();p.element('prepare-add').onclick();
  const before=new Map(p.savedStorage);
  p.setRequest({use:'training',variables:{reflectance:'required'}});p.listeners.get('canopy-task-request')();
  assert.equal(p.element('prepare-review').disabled,true);assert.equal(p.element('prepare-run').disabled,true);
  assert.deepEqual(p.savedStorage,before);assert.equal(p.element('dataset-draft-list').options.length,2);
});


test('combined plan import restores every source atomically and executes the imported plan', async () => {
  const p=await panel();p.element('prepare-add').onclick();
  const request={use:'training',variables:{xyz:'required',instance_reference:'required',reflectance:'optional'}};
  const memberships={},sourcePlans=[];
  for(const [record,folder] of [['8287792','for_instance'],['19351234','fgi_emit']]) {
    const source=JSON.parse(fs.readFileSync(new URL(`../scripts/${folder}/source-lock.json`,import.meta.url),'utf8'));
    memberships[record]=source.plots;
    const plot=source.plots.find(row=>record==='8287792'?row.path.endsWith('RMIT/train.las'):row.path.endsWith('plot_1022.las'));
    sourcePlans.push({schema_version:'1.0.0',task_plan:{...request,source_ref:'zenodo:'+record,
      pipeline_ref:record==='8287792'?'pipeline:for-instance-plot-instances:1.0.0':'pipeline:fgi-emit-plot-instances:1.0.0',
      included:{xyz:['xyz']},omitted:record==='8287792'?{reflectance:'unavailable'}:{}},subsets:[[plot.path]],plots:[plot],
      totals:{plots:1,points:plot.points},output:{partitions:[plot.published_split]}});
  }
  const plan={schema_version:'2.0.0',request,source_plans:sourcePlans,totals:{plots:2,points:3150462,overlapping_selections:0,source_las_bytes:187148258,estimated_browser_storage_bytes:1000000000},
    output:{partitions:['dev','train']},limitations:[],plan_sha256:'a'.repeat(64)};
  const text=JSON.stringify(plan);p.element('dataset-plan-file').files=[{size:text.length,text:async()=>text}];
  await p.element('dataset-plan-file').onchange();
  p.workers[0].onmessage({data:{type:'result',operation:'import',plan,source_plots:memberships}});
  assert.equal(p.element('dataset-draft-list').options.length,2);
  assert.match(p.element('dataset-plan-requirements').textContent,/FGI-EMIT/);
  assert.match(p.element('dataset-plan-requirements').textContent,/FOR-instance/);
  assert.equal(p.element('prepare-run').disabled,false);
  await p.element('prepare-run').onclick();assert.deepEqual(p.workers[1].request.execution_plan,plan);
});


test('saved Zenodo runs are discovered without session storage and resume their own identity', async()=>{
  const id = '12345678-1234-1234-1234-123456789abc';
  const p = await panel({savedRuns:[{id, status:'interrupted', resumable:true, completed:1, bytes:400,
    saved:{task_request:{use:'inference'}, execution_plan:{schema_version:'2.0.0',totals:{plots:2},source_plans:[{task_plan:{source_ref:'zenodo:19351234'}}]}}}]});
  const row = p.element('saved-runs').options[0];
  assert.match(row.options[0].textContent, /inference.*1 saved plots/);
  const resume = row.options.find(element=>element.textContent==='Resume');
  const scans = p.inspections();
  resume.onclick();
  assert.equal(p.inspections(), scans, 'Discovery must not compete for the worker lock during startup');
  assert.equal(p.workers.at(-1).request.operation, 'resume');
  assert.equal(p.workers.at(-1).request.job, id);
  await p.element('prepare-cancel').onclick();
  assert.equal(p.workers.at(-1).terminated, true);
  assert.equal(p.removed.length, 0);
});
test('starting another preparation keeps previous output; only explicit deletion removes it', async()=>{
  const p = await panel();
  p.element('prepare-mode').value = 'las'; p.element('prepare-file').files = [{name:'fixture.las'}]; p.element('prepare-mode').onchange();
  await p.element('prepare-run').onclick();
  const id = '12345678-1234-1234-1234-123456789abc';
  p.workers.at(-1).onmessage({data:{type:'job', id}});
  await p.element('prepare-cancel').onclick();
  assert.equal(p.removed.length, 0);
  await p.element('prepare-clear').onclick();
  assert.deepEqual(p.removed, [id]);
});
test('busy saved runs cannot be resumed or deleted', async()=>{
  const p = await panel({savedRuns:[{id:'12345678-1234-1234-1234-123456789abc',status:'busy'}]});
  const row = p.element('saved-runs').options[0];
  assert.equal(row.options.find(element=>element.textContent==='Resume'), undefined);
  assert.equal(row.options.find(element=>element.textContent==='Delete').disabled, true);
});


test('a saved-list refresh prevents resuming until its read lock is released', async()=>{
  const p = await panel({savedRuns:[{id:'12345678-1234-1234-1234-123456789abc',status:'interrupted',resumable:true}]});
  const resume = p.element('saved-runs').options[0].options.find(element=>element.textContent==='Resume');
  const refresh = p.element('saved-runs-refresh').onclick();
  resume.onclick();
  assert.equal(p.workers.length, 0);
  await refresh;
  p.element('saved-runs').options[0].options.find(element=>element.textContent==='Resume').onclick();
  assert.equal(p.workers.at(-1).request.operation, 'resume');
});


test('deleting an already-removed saved run clears its stale current identity', async()=>{
  const id = '12345678-1234-1234-1234-123456789abc';
  const p = await panel({missingRun:true,savedRuns:[{id,status:'complete',file:new Blob(['result']),evidence:{request:{use:'training'}}}]});
  p.element('saved-runs').options[0].options.find(e=>e.textContent==='Download result').onclick();
  await p.element('prepare-clear').onclick();
  assert.equal(p.element('prepare-clear').disabled, true);
  assert.match(p.element('prepare-status').textContent, /deleted/);
});
