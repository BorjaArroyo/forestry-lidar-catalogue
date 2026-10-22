/* Classification model shared by discovery and the isolated preparation worker. */
export const TASK='task:species';
export const PARTITIONS={training:['dev','train'],validation:['validate'],evaluation:['test'],inference:['dev','train','validate','test','unassigned']};
export const canonical=value=>JSON.stringify(value,(_key,item)=>item && typeof item==='object' && !Array.isArray(item)?
  Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
export const fingerprint=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');
export function sourceRef(value) {
  value=String(value);
  if (/^[1-9][0-9]*$/.test(value)) return 'zenodo:'+value;
  if (!/^(zenodo:[1-9][0-9]*|grodata:[1-9][0-9]*:[0-9]+\.[0-9]+)$/.test(value)) throw Error('INVALID_SOURCE_REF');
  return value;
}
export const sourceFolder=value=>sourceRef(value).replaceAll(':','-');

export function context(registry,vocabulary,trees) {
  if (registry.schema_version!=='1.0.0'||registry.task_ref!==TASK||vocabulary.schema_version!=='1.0.0') throw Error('UNSUPPORTED_CLASSIFICATION_REGISTRY');
  const taxa=new Map(vocabulary.taxa.map(t=>[t.id,t]));
  if (taxa.size!==vocabulary.taxa.length || new Set(vocabulary.taxa.map(t=>t.code)).size!==taxa.size) throw Error('DUPLICATE_TAXON');
  for (const taxon of taxa.values()) {
    if (taxon.rank==='species' ? taxa.get(taxon.parent_id)?.rank!=='genus' : taxon.rank!=='genus'||taxon.parent_id!==null)
      throw Error('INVALID_TAXON_ANCESTRY');
  }
  const mappings=new Map();
  for (const m of vocabulary.mappings) {
    const key=m.source_ref+'\0'+m.native_label;
    if (mappings.has(key)) throw Error('DUPLICATE_TAXON_MAPPING');
    for (const rank of vocabulary.ranks) if (m[rank]!==null && taxa.get(m[rank])?.rank!==rank) throw Error('INVALID_TAXON_MAPPING');
    if (m.species!==null && taxa.get(m.species).parent_id!==m.genus) throw Error('CONFLICTING_TAXON_ANCESTRY');
    mappings.set(key,m);
  }
  const sources=new Map(registry.sources.map(s=>[sourceRef(s.source_ref),s]));
  if (sources.size!==registry.sources.length) throw Error('DUPLICATE_SOURCE');
  const identities=new Map(), views=new Map(), observations=new Set(),paths=new Set();
  for (const tree of trees) {
    const key=tree.source_ref+'\0'+tree.tree_id;
    if (!sources.has(tree.source_ref)||identities.has(key)) throw Error('DUPLICATE_OR_UNKNOWN_TREE');
    const mapping=mappings.get(tree.source_ref+'\0'+tree.native_label);
    for (const rank of vocabulary.ranks) {
      const ref=mapping?.[rank]??null;
      if (tree.taxonomy[rank]!==ref || tree.reference_valid[rank]!==Boolean(ref)) throw Error('ALTERED_TREE_TAXONOMY');
    }
    if (!PARTITIONS.inference.includes(tree.published_split)) throw Error('UNKNOWN_PUBLISHED_PARTITION');
    identities.set(key,tree);
  }
  for (const source of sources.values()) {
    if (source.execution_enabled && (source.status!=='validated'||source.blockers.length||source.native_audit?.status!=='validated'||source.browser_acceptance?.status!=='validated')) throw Error('SOURCE_NOT_AUDITED');
    for (const o of source.observations) {
      const key=o.source_ref+'\0'+o.tree_id, tree=identities.get(key), id=o.source_ref+'\0'+o.observation_id;
      const path=o.source_ref+'\0'+o.archive+'\0'+o.path;
      if (!tree || o.source_ref!==source.source_ref || observations.has(id)||paths.has(path)||
          tree.published_split!==o.published_split||tree.collection!==o.collection||!source.modalities.includes(o.modality)) throw Error('INVALID_OBSERVATION_MEMBERSHIP');
      observations.add(id); paths.add(path);
      if (!views.has(key)) views.set(key,[]);
      views.get(key).push(o);
    }
  }
  return {registry,vocabulary,trees,sources,taxa,identities,views};
}

export function select(ctx,request,filters) {
  const {use,rank}=request;
  if (!Object.hasOwn(PARTITIONS,use)||!ctx.vocabulary.ranks.includes(rank)) throw Error('UNKNOWN_CLASSIFICATION_REQUEST');
  if (!Array.isArray(filters)||!filters.length||filters.length>50) throw Error('INVALID_CLASSIFICATION_SELECTION');
  const selected=new Map(), selectedTrees=new Map(), candidates=new Map(),exclusions=[];
  for (const subset of filters) {
    const source=ctx.sources.get(sourceRef(subset.source_ref));
    if (!source) throw Error('UNKNOWN_SOURCE');
    if (!subset.modalities.length||new Set(subset.modalities).size!==subset.modalities.length||subset.modalities.some(m=>!source.modalities.includes(m))) throw Error('UNKNOWN_MODALITY');
    const taxa=new Set(subset.taxa||[]);
    if ([...taxa].some(id=>!ctx.taxa.has(id))) throw Error('UNKNOWN_TAXON');
    for (const taxon of ctx.taxa.values()) if (taxa.has(taxon.parent_id)) taxa.add(taxon.id);
    for (const tree of ctx.trees) {
      if (tree.source_ref!==source.source_ref||!subset.collections.includes(tree.collection)||!subset.partitions.includes(tree.published_split)||
          (subset.tree_ids?.length&&!subset.tree_ids.includes(tree.tree_id))||(taxa.size&&!Object.values(tree.taxonomy).some(t=>taxa.has(t)))) continue;
      const key=tree.source_ref+'\0'+tree.tree_id;
      const modes=source.modality_policy==='paired-views'?subset.modalities:subset.modalities.filter(m=>tree.modalities.includes(m));
      if (!modes.length) continue;
      candidates.set(key,tree);
      const reason=!PARTITIONS[use].includes(tree.published_split)?'PARTITION_EXCLUDED':use!=='inference'&&!tree.reference_valid[rank]?'REFERENCE_UNAVAILABLE':null;
      const views=(ctx.views.get(key)||[]).filter(o=>modes.includes(o.modality));
      const missing=modes.some(m=>!views.some(o=>o.modality===m));
      if (reason||missing) exclusions.push({source_ref:tree.source_ref,tree_id:tree.tree_id,reason:reason||'COMMITTED_MODALITY_MISSING'});
      else {
        selectedTrees.set(key,tree);
        for (const o of views) selected.set(o.source_ref+'\0'+o.observation_id,o);
      }
    }
  }
  const compare=(a,b)=>a<b?-1:a>b?1:0;
  return {observations:[...selected.values()].sort((a,b)=>compare(a.source_ref,b.source_ref)||compare(a.observation_id,b.observation_id)),
    trees:[...selectedTrees.values()],candidates:[...candidates.values()],exclusions};
}

export async function resolve(ctx,request,filters,{runtime_sha256,code_sha256}) {
  const result=select(ctx,request,filters), {observations,exclusions}=result;
  if (!observations.length) throw Error('NO_AUDITED_OBSERVATIONS: source WIP or selection exclusions');
  const refs=[...new Set(observations.map(o=>o.source_ref))].sort();
  for (const ref of refs) if (!ctx.sources.get(ref).execution_enabled) throw Error('SOURCE_WIP: '+ref);
  const identities=new Set(observations.map(o=>o.source_ref+'\0'+o.tree_id));
  const trees=ctx.trees.filter(t=>identities.has(t.source_ref+'\0'+t.tree_id));
  const archives=[];
  for (const ref of refs) {
    const names=new Set(observations.filter(o=>o.source_ref===ref).map(o=>o.archive));
    for (const asset of ctx.sources.get(ref).assets) if (names.has(asset.name)) archives.push({source_ref:ref,...asset,
      traversal:asset.name.endsWith('.tar.zst')?'sequential-complete':'selective-zip'});
    if (archives.filter(a=>a.source_ref===ref).length!==names.size) throw Error('UNKNOWN_ARCHIVE');
  }
  const prepared=observations.reduce((n,o)=>n+o.points*(o.point_record_length+24)+o.size_bytes+1048576,0);
  const source_dependencies={},rights={},groups=new Map();
  for (const ref of refs) {
    const source=ctx.sources.get(ref); source_dependencies[ref]=await fingerprint(source);
    rights[ref]={license:source.license,url:source.url};
  }
  for (const tree of trees) if (tree.published_split!=='unassigned') {
    const key=tree.source_ref+'\0'+tree.collection;
    if (!groups.has(key)) groups.set(key,new Set()); groups.get(key).add(tree.published_split);
  }
  const shared_plots=[...groups].sort(([a],[b])=>a<b?-1:a>b?1:0).filter(([,parts])=>parts.size>1)
    .map(([key,parts])=>({source_ref:key.split('\0')[0],collection:key.split('\0')[1],partitions:[...parts].sort()}));
  const source_scope_cloud_duplicates=Object.fromEntries(refs.map(ref=>[ref,ctx.sources.get(ref).native_audit?.summary?.byte_identical_cloud_groups||[]]).filter(([,groups])=>groups.length));
  const plan={schema_version:'3.0.0',task_ref:TASK,request,filters:structuredClone(filters),observations:structuredClone(observations),trees:structuredClone(trees),
    vocabulary:structuredClone(ctx.vocabulary),vocabulary_sha256:await fingerprint(ctx.vocabulary),source_dependencies,runtime_sha256,code_sha256,archives,exclusions,
    totals:{trees:trees.length,observations:observations.length,points:observations.reduce((n,o)=>n+o.points,0),
      sequential_download_bytes:archives.filter(a=>a.traversal==='sequential-complete').reduce((n,a)=>n+a.size_bytes,0),
      estimated_browser_storage_bytes:2*prepared+Math.max(...observations.map(o=>o.size_bytes))+64*1024**2,
      estimated_worker_memory_bytes:2*Math.max(...observations.map(o=>o.size_bytes))+2*Math.max(...observations.map(o=>Math.min(o.points,250000)*(o.point_record_length+24)))+128*1024**2},
    output:{schema:'tree-classification-dataset:1.0.0',partitions:[...new Set(observations.map(o=>o.published_split))].sort(),identity_scope:'source-release/tree/sensor-observation',partition_policy:'preserve-published'},
    rights,spatial_audit:{shared_plots,independence:'not-demonstrated',source_scope_cloud_duplicates},limitations:[
      'Sensor views are separate; coordinates are not fused or assumed aligned',
      'Native traits are provenance, not automatic model inputs',
      'Duplicate cloud bytes do not transfer labels or merge provider identities; published partitions remain unchanged',
      'All sequential archive bytes must be verified before ZIP validation',
      'Selective ZIP intake verifies members; whole-provider ZIP checksum remains unchecked']};
  plan.plan_sha256=await fingerprint(plan);return plan;
}
export async function check(ctx,plan,pins) {
  if (plan.schema_version!=='3.0.0'||plan.task_ref!==TASK) throw Error('PLAN_REVIEW_REQUIRED: use the original task reader for legacy plans');
  const expected=await resolve(ctx,plan.request,plan.filters,pins);
  if (canonical(expected)!==canonical(plan)) throw Error('PLAN_REVIEW_REQUIRED: dependencies changed');
  return expected;
}
export const emptyDraft=()=>({schema_version:'2.0.0',task_ref:TASK,request:{use:'training',rank:'species'},subsets:[]});
export function readDraft(text) {
  if (typeof text!=='string'||text.length>4*1024**2) throw Error('DRAFT_SIZE_LIMIT');
  const draft=JSON.parse(text);
  if (Object.keys(draft).sort().join(',')!=='request,schema_version,subsets,task_ref'||draft.schema_version!=='2.0.0'||draft.task_ref!==TASK||
      !Object.hasOwn(PARTITIONS,draft.request?.use)||!['genus','species'].includes(draft.request?.rank)||!Array.isArray(draft.subsets)||draft.subsets.length>50) throw Error('DRAFT_REVIEW_REQUIRED');
  for (const subset of draft.subsets) {
    sourceRef(subset.source_ref);
    for (const key of ['collections','modalities','partitions','taxa','tree_ids']) if (!Array.isArray(subset[key])||subset[key].length>40000||
      subset[key].some(s=>typeof s!=='string'||!s||s.length>2048)||new Set(subset[key]).size!==subset[key].length) throw Error('INVALID_SAVED_SELECTION');
  }
  return draft;
}
