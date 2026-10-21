import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {selectPlots} from '../browser-prepare/selection.js';

// Exercise real orchestration with isolated runtime/I/O boundaries, not scientific adapters.
function worker({quota=1000000, stale=false}={}) {
  const messages=[], removed=[], staged=[], validated=[], globals=new Map();
  let boots=0;
  const request={use:'training',variables:{xyz:'required',instance_reference:'required',reflectance:'optional'}};
  const plans=['19351234','8287792'].map(record=>({schema_version:'1.0.0',task_plan:{...request,source_ref:'zenodo:'+record,pipeline_ref:'pipeline:fixture',allowed_partitions:['train']},plots:[{path:record+'.las',points:9,size_bytes:100,published_split:'train'}]}));
  const plan={schema_version:'2.0.0',request,source_plans:plans,totals:{estimated_browser_storage_bytes:1000}};
  const root={async getDirectoryHandle(){return this;},async removeEntry(id){removed.push(id);}};
  let currentManifest;
  const py={globals:{set:(name,value)=>globals.set(name,value)},FS:{mkdir(){},mkdirTree(){},writeFile(){}},runPython(code){
    if(code.includes('dataset_plan.check_dataset')) {if(stale)throw Error('stale source pin');return JSON.stringify(plan);}
    if(code.includes('combine_manifests'))return currentManifest;
    if(code.includes('dataset_plan.check_manifest'))return JSON.stringify({status:'matched'});
  }};
  const context=vm.createContext({URL,Map,TextEncoder,console,selectPlots,crypto:{randomUUID:()=> 'fixture-job'},
    self:{location:{href:'http://localhost/browser-prepare/worker.js'},fetch(){},postMessage:value=>messages.push(value)},
    navigator:{storage:{getDirectory:async()=>root,estimate:async()=>({quota,usage:0})},locks:{request:async(name,fn)=>fn()}},
    runtime:async records=>{boots++;return {lock:{},runtimeHash:'a'.repeat(64),py,sources:new Map(records.map(record=>[record,{
      source:{plots:plans.find(p=>p.task_plan.source_ref==='zenodo:'+record).plots},profile:{recordId:record,plotLabel:path=>path,
        validate(){validated.push(record);return {package:{chunks:1}};}}
    }]))};},
    getTask:(py,profile)=>plans.find(p=>p.task_plan.source_ref==='zenodo:'+profile.recordId).task_plan,
    stage:async(root,input,plot)=>{staged.push(input.record_id);if(staged.length===2)throw Error('provider payload corrupted');return {file:{},intake:{}};},
    prepare:async(py,root,file,profile,task,expected,files)=>{
      const manifest={source:{record_id:Number(profile.recordId)},scenes:[{path:expected}]};
      currentManifest=JSON.stringify(manifest);return {manifest,manifestText:currentManifest};
    },writeArtifact:async()=>({})
  });
  const code=fs.readFileSync(new URL('../browser-prepare/worker.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  vm.runInContext(code,context);
  vm.runInContext('loadContext=runtime;taskForRequest=getTask;stagePlot=stage;preparePlot=prepare;write=writeArtifact;',context);
  return {run:()=>vm.runInContext('run(input)',Object.assign(context,{input:{mode:'zenodo',task_request:request,execution_plan:plan}})),
    messages,removed,staged,validated,boots:()=>boots};
}

test('failure in the second source removes staging and cannot offer a valid ZIP',async()=>{
  const w=worker();await assert.rejects(w.run(),/zenodo:8287792: provider payload corrupted/);
  assert.equal(w.boots(),1);assert.deepEqual(w.staged,['19351234','8287792']);assert.deepEqual(w.validated,['19351234']);
  assert.deepEqual(w.removed,['source.las','fixture-job']);assert.ok(!w.messages.some(m=>m.type==='result'));
});
test('global storage preflight rejects the run before either payload is requested',async()=>{
  const w=worker({quota:10});await assert.rejects(w.run(),/Insufficient browser storage/);
  assert.equal(w.boots(),1);assert.deepEqual(w.staged,[]);assert.deepEqual(w.removed,['fixture-job']);
});
test('a stale source plan prevents all payload intake and invalidates execution',async()=>{
  const w=worker({stale:true});await assert.rejects(w.run(),error=>error.code==='DATASET_PLAN_STALE');
  assert.deepEqual(w.staged,[]);assert.ok(!w.messages.some(m=>m.type==='result'));
});
