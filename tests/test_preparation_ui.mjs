import {sameRequest} from '../browser-prepare/dataset-draft.js';
import {DraftPanel} from '../browser-prepare/draft-panel.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {RunSession} from '../browser-prepare/run-session.js';
import {datasetPlots} from '../browser-prepare/selection.js';
import {profileForPipeline} from '../browser-prepare/profiles.js';

async function panel({savedStorage} = {}) {
  const elements = new Map(), listeners = new Map(), workers = [], timers = new Map(), storage = new Map();
  let serial = 0;
  const localValues = savedStorage || new Map();
  const localStorage = {getItem:key=>localValues.get(key),setItem:(key,value)=>localValues.set(key,value),removeItem:key=>localValues.delete(key)};
  const node = id => ({id, value:id==='prepare-mode'?'las':'',files:[],options:[],
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
  const directory = {async getDirectoryHandle() {return this;}, async removeEntry() {}};
  const context = vm.createContext({URL, profileForPipeline, datasetPlots, DraftPanel, sameRequest,
    RunSession: class extends RunSession {
      constructor(options) {super({...options, schedule: callback => {timers.set(++serial, callback); return serial;}, unschedule: id => timers.delete(id)});}
    }, Worker, CustomEvent: class {constructor(type, options) {this.type = type; this.detail = options.detail;}},
    window: {Worker, localStorage, isSecureContext: true, addEventListener() {}},
    document: {getElementById: element, createElement: () => node(),
      addEventListener(type, fn) {listeners.set(type, fn);}, dispatchEvent() {}},
    navigator: {storage: {getDirectory: async () => directory}, locks: {request: async (name, options, fn) => fn({})}},
    sessionStorage: {getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key)},
    fetch: async url => ({ok: true, json: async () => JSON.parse(fs.readFileSync(new URL('../scripts/for_instance/source-lock.json', import.meta.url), 'utf8'))}),
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
  return {element, workers, timers, listeners, settle, savedStorage:localValues, setRequest(value) {request = context.window.CanopyTaskSelection.normalize(value.use, value.variables);}};
}

test('all catalog sources remain selectable; unadmitted FGI cannot execute', async () => {
  const p = await panel();
  assert.equal(p.element('prepare-source').options.length, 10);
  p.element('prepare-source').value = '19351234'; await p.element('prepare-source').onchange();
  assert.match(p.element('prepare-source-status').textContent, /FGI-EMIT: tbd/);
  assert.match(p.element('prepare-status').textContent, /No admitted/);
  assert.equal(p.element('prepare-run').disabled, true); assert.equal(p.workers.length, 0);
});
test('requirements and selected source are sent to the worker; old failures cannot stop a retry', async () => {
  const p = await panel(); p.element('prepare-file').files = [{name: 'fixture.las'}];
  p.element('prepare-mode').value = 'las';
  await p.element('prepare-run').onclick();
  assert.equal(p.workers[0].request.record_id, '8287792');
  assert.equal(p.workers[0].request.task_request.use, 'training');
  const stale = [...p.timers.values()][0]; p.workers[0].onerror({message: 'fixture'});
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
  await p.element('prepare-run').onclick();
  assert.equal(p.workers[0].request.selected_paths.length, 1);
  assert.match(p.workers[0].request.selected_paths[0], /RMIT\/train.las/);
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
  await p.element('prepare-run').onclick();
  const paths=p.workers[0].request.selected_paths;
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
  assert.equal(p.element('prepare-run').disabled,false);
  p.element('dataset-draft-clear').onclick();
  assert.equal(p.element('dataset-draft-list').options.length,0);
});
test('malformed saved data is visible and requires clearing before preparation', async () => {
  const savedStorage=new Map([['canopy-dataset-draft-v1','{"schema_version":"unknown"}']]);
  const p=await panel({savedStorage});
  assert.match(p.element('dataset-draft-status').textContent,/could not be read/);
  assert.equal(p.element('prepare-run').disabled,true);
  p.element('dataset-draft-clear').onclick();
  assert.equal(p.element('prepare-run').disabled,false);
});
