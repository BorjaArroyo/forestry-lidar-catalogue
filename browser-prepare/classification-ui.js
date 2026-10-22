import {PARTITIONS,TASK,emptyDraft,readDraft,select,check,canonical} from './classification-model.js';
import {loadContext} from './classification-runtime.js';
import {RunSession} from './run-session.js';
const $=id=>document.getElementById(id);
const chosen=id=>[...$(id).selectedOptions].map(o=>o.value);
const storageKey='canopy-dataset-draft-species-v2';
let ctx,pins,draft=emptyDraft(),plan=null,resultURL=null,planURL=null,job=null,loadError=null,initializing=false;
const status=text=>{$('classification-status').textContent=text;};
function save() {
  try { localStorage.setItem(storageKey,JSON.stringify(draft)); }
  catch { status('Browser storage unavailable; keep this page open to retain the selection.'); }
}
function clearPlan() {
  plan=null;$('classification-plan').hidden=true;$('classification-run').disabled=true;
  if (planURL) URL.revokeObjectURL(planURL);planURL=null;
}
function hideExport() {
  $('classification-download').hidden=true;
  if (resultURL) URL.revokeObjectURL(resultURL);resultURL=null;
}
function fill(id,values,selected=values) {
  $(id).replaceChildren();
  for (const value of values) {
    const option=document.createElement('option');option.value=value;option.textContent=value;option.selected=selected.includes(value);$(id).append(option);
  }
}
function request() { return {use:$('classification-use').value,rank:$('classification-rank').value}; }
function subset() {
  return {source_ref:$('classification-source').value,collections:chosen('classification-collections'),
    modalities:chosen('classification-modalities'),partitions:chosen('classification-partitions'),
    taxa:chosen('classification-taxa'),tree_ids:chosen('classification-trees')};
}
function intent() { return draft.subsets.length?draft.subsets:[subset()]; }
function sourceChanged() {
  if (!ctx) return;
  const source=ctx.sources.get($('classification-source').value);
  const trees=ctx.trees.filter(t=>t.source_ref===source.source_ref);
  fill('classification-collections',[...new Set(trees.map(t=>t.collection))].sort());
  fill('classification-modalities',source.modalities);
  fill('classification-partitions',[...new Set(trees.map(t=>t.published_split))].sort());
  fill('classification-taxa',ctx.vocabulary.taxa.filter(t=>ctx.vocabulary.mappings.some(m=>m.source_ref===source.source_ref&&m[t.rank]===t.id)).map(t=>t.id),[]);
  fill('classification-trees',trees.map(t=>t.tree_id),[]);
  const audit=source.native_audit?.summary,duplicates=audit?.byte_identical_cloud_groups?.length||0;
  const quality=duplicates?` ${duplicates} byte-identical cloud groups under different provider IDs; ${audit.duplicate_cloud_groups_crossing_partitions} cross published partitions. IDs and original labels are preserved.`:'';
  $('classification-source-detail').textContent=`${source.source_ref} · ${source.status.toUpperCase()} · ${source.license}. ${source.blockers.join('. ')}. ${source.coordinate_policy}${quality}`;
  update();
}
function update() {
  clearPlan();
  if (!ctx) return;
  try {
    const current=request(),filters=intent(),summary=select(ctx,current,filters);
    const counts=Object.fromEntries(ctx.vocabulary.ranks.map(rank=>[rank,summary.candidates.filter(t=>t.reference_valid[rank]).length]));
    const eligible=summary.candidates.filter(t=>PARTITIONS[current.use].includes(t.published_split)&&(current.use==='inference'||t.reference_valid[current.rank]));
    const sourceNames=new Set(filters.map(s=>s.source_ref));
    const sequential=[...sourceNames].flatMap(ref=>{
      const modes=new Set(filters.filter(s=>s.source_ref===ref).flatMap(s=>s.modalities));
      return ctx.sources.get(ref).assets.filter(a=>a.name.endsWith('.tar.zst')&&modes.has(a.name.split('.')[0]));
    }).reduce((n,a)=>n+a.size_bytes,0);
    $('classification-summary').textContent=`${summary.candidates.length} physical tree identities in the source metadata; ${eligible.length} meet the use/rank requirements. `+
      `${summary.observations.length} audited observations / ${summary.observations.reduce((n,o)=>n+o.points,0).toLocaleString()} verified points in the native inventory. `+
      `Reference: genus ${counts.genus}, species ${counts.species}. ${summary.exclusions.length} exclusions (including unaudited or missing views). `+
      `BioDiv sequential traversal: ${(sequential/1e9).toFixed(2)} GB. Selecting fewer trees does not reduce this traversal. `+
      `FOR test has no public labels; validation is available only for the published BioDiv validate partition.`;
    $('classification-exclusions').textContent=JSON.stringify(summary.exclusions.slice(0,100),null,2)+(summary.exclusions.length>100?'\nFirst 100 exclusions shown.':'');
    $('classification-review').disabled=Boolean(loadError)||session.running||!summary.observations.length||[...sourceNames].some(ref=>!ctx.sources.get(ref).execution_enabled);
    const blocked=[...sourceNames].map(ref=>ctx.sources.get(ref)).filter(s=>!s.execution_enabled);
    if (blocked.length) status('WIP: selection can be saved. '+[...new Set(blocked.flatMap(s=>s.blockers))].join('. '));
  } catch (error) { status(error.message);$('classification-review').disabled=true; }
  renderDraft();
}
function renderDraft() {
  $('classification-draft-list').replaceChildren();
  for (const [index,s] of draft.subsets.entries()) {
    const row=document.createElement('li'),text=document.createElement('span'),button=document.createElement('button');
    text.textContent=`${s.source_ref}: ${s.collections.join(', ')} / ${s.modalities.join(', ')} / ${s.partitions.join(', ')}`;
    button.textContent='Remove';button.className='button small';button.disabled=session.running;
    button.onclick=()=>{draft.subsets.splice(index,1);save();update();};row.append(text,button);$('classification-draft-list').append(row);
  }
  $('classification-add').disabled=Boolean(loadError)||session.running;
}
function showPlan(value) {
  clearPlan();plan=value;
  $('classification-plan-text').textContent=JSON.stringify(plan,null,2);$('classification-plan').hidden=false;
  planURL=URL.createObjectURL(new Blob([JSON.stringify(plan,null,2)+'\n'],{type:'application/json'}));
  $('classification-plan-download').href=planURL;$('classification-run').disabled=false;
}
async function removeJob() {
  if (!job) return;
  const origin=await navigator.storage.getDirectory(),jobs=await origin.getDirectoryHandle('canopy-classification');
  try { await jobs.removeEntry(job,{recursive:true}); }
  catch (error) { if (error.name!=='NotFoundError') throw error; }
  job=null;
}
function controls(running) {
  document.dispatchEvent(new CustomEvent('canopy-preparation-state',{detail:{running}}));
  for (const element of $('classification-panel').querySelectorAll('select,input,button')) element.disabled=running;
  $('classification-cancel').disabled=!running;
  if (!running) { const saved=plan;update();if (saved) showPlan(saved); }
}
const session=new RunSession({event(data) {
  if (data.type==='phase') status(data.text);
  if (data.type==='job') job=data.id;
  if (data.type==='error') { hideExport();clearPlan();controls(false);status('Preparation failed: '+data.error); }
  if (data.type==='result') {
    controls(false);
    if (['review','import'].includes(data.operation)) { showPlan(data.plan);status('Exact plan verified; review its costs and source conditions before preparation.'); }
    else {
      resultURL=URL.createObjectURL(data.file);$('classification-download').href=resultURL;$('classification-download').hidden=false;
      status(`Validated selection: ${data.evidence.totals.trees} physical trees, ${data.evidence.totals.observations} sensor observations. Download the ZIP to keep it.`);
    }
  }
},failure(text) { hideExport();clearPlan();controls(false);status(text); }});
function start(data) {
  session.start(()=>new Worker(new URL('./classification-worker.js',import.meta.url),{type:'module'}),data);controls(true);
}
$('classification-source').onchange=sourceChanged;
for (const id of ['classification-collections','classification-modalities','classification-partitions','classification-taxa','classification-trees']) $(id).onchange=update;
for (const id of ['classification-use','classification-rank']) $(id).onchange=()=>{draft.request=request();save();update();};
$('classification-add').onclick=()=>{
  try {
    const selected=subset();readDraft(JSON.stringify({...draft,subsets:[selected]}));
    if (!selected.collections.length||!selected.modalities.length||!selected.partitions.length) throw Error('Choose collections, modalities and partitions');
    if (draft.subsets.some(s=>canonical(s)===canonical(selected))) throw Error('Subset already saved');
    if (draft.subsets.length>=50) throw Error('Choose at most 50 subsets');
    draft.subsets.push(selected);draft.request=request();save();update();
  } catch(error) { status(error.message); }
};
$('classification-clear').onclick=()=>{draft=emptyDraft();loadError=null;save();update();};
$('classification-review').onclick=()=>start({operation:'review',task_ref:TASK,request:request(),subsets:intent()});
$('classification-import').onchange=async()=>{
  const file=$('classification-import').files[0];if (!file) return;
  try {
    if (file.size>32*1024**2) throw Error('PLAN_SIZE_LIMIT');
    const value=JSON.parse(await file.text());await check(ctx,value,pins);
    draft=readDraft(JSON.stringify({schema_version:'2.0.0',task_ref:TASK,request:value.request,subsets:value.filters}));
    $('classification-use').value=draft.request.use;$('classification-rank').value=draft.request.rank;save();update();showPlan(value);
  } catch (error) { status('Plan import failed; previous selection retained: '+error.message); }
};
$('classification-run').onclick=async()=>{
  try {
    await check(ctx,plan,pins);hideExport();await removeJob();
    const selected=[...$('classification-files').files];
    const inputs=selected.map(file=>{
      const matches=plan.archives.filter(a=>a.name===file.name);
      if (matches.length!==1) throw Error('Local file must identify one planned source/archive: '+file.name);
      return {source_ref:matches[0].source_ref,archive:file.name,file};
    });
    start({task_ref:TASK,plan,inputs});
  } catch (error) { status(error.message); }
};
$('classification-cancel').onclick=async()=>{
  session.stop();hideExport();clearPlan();await removeJob().catch(()=>{});controls(false);status('Cancelled; no validated ZIP was offered.');
};
$('classification-release').onclick=async()=>{hideExport();await removeJob().catch(error=>status(error.message));};
function taskChanged() {
  const species=$('preparation-task').value===TASK;
  $('classification-panel').hidden=!species;$('instance-task-request').hidden=species;
  document.querySelector('.source-filters').hidden=species;
  if (species) { $('view-datasets').hidden=true;$('view-workbench').hidden=true; }
  else {
    $('view-datasets').hidden=location.hash==='#workbench';$('view-workbench').hidden=location.hash!=='#workbench';
  }
  document.querySelector('.page-heading h1').textContent=species?'Discover tree taxonomic classification data.':location.hash==='#workbench'?'Build a dataset for your model.':'Find a source for tree segmentation.';
  document.querySelector('.page-heading .eyebrow').textContent=species?'TREE TAXONOMIC CLASSIFICATION':'INDIVIDUAL-TREE SEGMENTATION';
  document.querySelector('.page-heading p').textContent=species?'FOR-species20K and BioDiv-3DTrees: native sensor views, explicit reference by rank and separate source conditions.':'Discover sources and inspect preparation evidence.';
  $('compare-open').hidden=species;
  $('dataset-count').textContent=species?'2':String(window.CanopyHub.catalog.datasets.length);
  if (species&&!ctx&&!initializing) initialize();
}
$('preparation-task').onchange=taskChanged;
window.addEventListener('hashchange',()=>queueMicrotask(taskChanged));
document.addEventListener('canopy-preparation-state',e=>{$('preparation-task').disabled=e.detail.running;});
try {
  const saved=localStorage.getItem(storageKey);if (saved) draft=readDraft(saved);
} catch (error) { loadError=error.message;status('Saved classification selection requires review: '+loadError); }
function initialize() {
  initializing=true;
  loadContext().then(value=>{
  ctx=value.ctx;pins=value.pins;
  for (const source of ctx.sources.values()) {
    const option=document.createElement('option');option.value=source.source_ref;option.textContent=source.name+' · '+source.status.toUpperCase();$('classification-source').append(option);
    const article=document.createElement('article');article.className='dataset-card';
    const title=document.createElement('h3'),detail=document.createElement('p'),link=document.createElement('a');
    title.textContent=source.name;detail.textContent=`${source.source_ref} · ${source.modalities.join('/')} · ${source.license}. ${source.blockers.join('. ')}.`;
    link.href=source.url;link.textContent='Original pinned source';link.target='_blank';link.rel='noopener';article.append(title,detail,link);$('classification-sources').append(article);
  }
  $('classification-use').value=draft.request.use;$('classification-rank').value=draft.request.rank;sourceChanged();
  }).catch(error=>status('Classification unavailable: '+error.message));
}
window.addEventListener('pagehide',()=>session.stop());
taskChanged();
