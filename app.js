/* A dependency-free, offline viewer. This application never modifies LiDAR files. */
(() => {
  'use strict';
  const data = window.LIDAR_CATALOG;
  if (!data) { document.querySelector('main').textContent = 'Catalog unavailable. Rebuild catalog.js using the documented command.'; return; }
  const tasks = data.tasks.filter(t => t.visible ?? (t.id === 'instances'));
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = n => Number(n).toLocaleString('en-US');
  const compact = n => n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : number(n);
  const names = Object.fromEntries(data.datasets.map(d => [d.id, d.short]));
  const byId = Object.fromEntries(data.datasets.map(d => [d.id, d]));
  const kinds = {
    direct: {name:'Direct alignment', color:'#3f8972', dash:''},
    transform: {name:'Proposed / scoped projection', color:'#587b9b', dash:''},
    partial: {name:'Coarse label projection', color:'#c19b4b', dash:'7 4'},
    blocked: {name:'Unsupported / blocked', color:'#ba7e70', dash:'3 5'},
    unknown: {name:'Needs evidence', color:'#a4ac9c', dash:'4 5'},
    shared: {name:'Recorded dependency', color:'#917ba4', dash:'8 4'},
  };
  const state = {view:'datasets', task:'instances', search:'', platform:'all', unit:'all', reference:'all', preparation:'all', selected:'16742708', edge:null, compare:new Set(), hiddenKinds:new Set(), zoom:1, pan:{x:0,y:0}};
  const positions = {
    '8287792':[195,115], '16742708':[610,355], '15193973':[195,665],
    '17172162':[190,485], '19351234':[580,105], '15913427':[185,300],
    '19127709':[890,650], '16875688':[1000,120], '16910335':[1020,465], '7307956':[1040,295],
  };
  const supported = d => ['documented','partial','derived_only'].includes(taskState(d));
  let serviceConnected=false;
  const discovery = d => d.discovery || {
    unit:'unknown',unit_label:'Unit not reviewed',
    instance_reference:{status:'unknown',label:'Reference not reviewed'},
    coverage:'Annotation coverage is not established.',limitation:d.correction,
    preparation:{status:'tbd',label:'Task pipeline TBD',detail:'No audited task preparation is registered.'}
  };
  const recordSize = d => Number.isFinite(d.download_bytes) ?
    (d.download_bytes >= 1e9 ? `${(d.download_bytes/1e9).toFixed(1)} GB` : `${(d.download_bytes/1e6).toFixed(1)} MB`) : 'Size not reviewed';
  const readinessHtml = d => {
    const s=discovery(d);
    return `<dl class="source-readiness"><div><dt>Instance reference</dt><dd><span class="source-status reference-${esc(s.instance_reference.status)}">${esc(s.instance_reference.label)}</span></dd></div><div><dt>Task preparation</dt><dd><span class="source-status preparation-${esc(s.preparation.status)}">${esc(s.preparation.label)}</span></dd></div></dl>`;
  };
  const sourceServiceNote = () => (serviceConnected?'The connected service can inspect the record before you start its download.':'Original download jobs require the connected local service. The provider record remains directly accessible.')+' Acquisition fetches all record assets; selecting a task-specific subset is TBD.';
  const matches = d => {
    const text = [d.name,d.title,d.labels,d.scanner,d.domain,d.geography,d.license,...d.source_fields].join(' ').toLowerCase();
    return (!state.search || text.includes(state.search.toLowerCase())) &&
      (state.platform === 'all' || d.modalities.includes(state.platform)) &&
      (state.unit === 'all' || discovery(d).unit === state.unit) &&
      (state.reference === 'all' || discovery(d).instance_reference.status === state.reference) &&
      (state.preparation === 'all' || discovery(d).preparation.status === state.preparation);
  };
  const visibleDatasets = () => data.datasets.filter(matches);
  const visibleMappings = () => {
    const ids = new Set(visibleDatasets().map(d => d.id));
    return data.mappings.filter(m => m.tasks.includes(state.task) && !state.hiddenKinds.has(m.kind) && ids.has(m.source) && ids.has(m.target));
  };
  const taskState = (d, task = state.task) => d.source_task_support?.[task]?.status || 'unreviewed';
  const stateLabel = value => ({documented:'Source documented',partial:'Subset / conditions',not_documented:'Not established',unsupported:'No task reference',derived_only:'Derived models only',unreviewed:'Not reviewed'})[value];
  const taskClass = value => ({documented:'yes',partial:'conditional',derived_only:'conditional',unsupported:'no',not_documented:'no',unreviewed:'no'})[value];
  function sourceReview(d) {
    const r=d.review;if(!r)return '<p>Source review is pending.</p>';
    return `<h4>Observation unit</h4><p>${esc(r.observation_unit)}</p><h4>Reported by the source</h4>${r.source_facts.map(f=>`<p>${esc(f.text)} ${link(f.label,f.url)}</p>`).join('')}<h4>Published protocol</h4><p>${esc(r.published_protocol)}</p><h4>Local study context</h4><p>${esc(d.study_context)}</p><h4>Saved local observations</h4><ul>${r.local_observations.map(f=>`<li>${esc(f)}</li>`).join('')}</ul><p class="evidence-tag">${r.observations_current?'Observation metadata matches the reviewed snapshot.':'Metadata changed; these historical observations need rechecking.'}</p><h4>Unresolved before scientific use</h4><ul>${r.open_questions.map(f=>`<li>${esc(f)}</li>`).join('')}</ul><p class="evidence-tag">Reviewed ${esc(r.reviewed_at)} · ${esc(r.scope)}</p>`;
  }
  function contractHtml(m) {
    const c=m.contract;if(!c)return '<p>No precise specification is registered.</p>';
    return `<h4>Contract status</h4><p>${esc(c.status.replaceAll('_',' '))}</p><h4>Input → output</h4><p>${esc(c.input)} → ${esc(c.output)}</p><h4>Ordered specification / pseudocode</h4><pre>${esc(c.steps.join('\n'))}</pre><h4>Preconditions and unresolved decisions</h4><ul>${c.preconditions.map(p=>`<li>${esc(p)}</li>`).join('')}</ul><p>${esc(c.preserved)}</p><p class="evidence-tag">${esc(c.target_scope)}</p>`;
  }
  function safeUrl(url) { try { const parsed = new URL(url); return /^https?:$/.test(parsed.protocol) ? parsed.href : '#'; } catch { return '#'; } }
  function badge(text, type = 'neutral') { return `<span class="badge ${esc(type)}">${esc(text)}</span>`; }
  function link(label, url) { return `<a class="source-link" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`; }
  function evidenceHtml(m) { return m.evidence.map(e => e.url ? link(e.label, e.url) : `<div class="evidence-tag">${esc(e.label)}<code class="raw-path">${esc(e.local)}</code></div>`).join(''); }
  function toast(text) { $('#toast').textContent=text; $('#toast').hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(() => $('#toast').hidden=true, 3200); }

  function renderTaskNav() {
    $('#task-nav').innerHTML = tasks.map(t => `<button class="task-option ${t.id===state.task?'active':''}" data-task="${esc(t.id)}" aria-pressed="${t.id===state.task}">${esc(t.name)}</button>`).join('');
    const task=tasks.find(t => t.id===state.task);
    $('#task-title').textContent=task.title; $('#task-description').textContent=task.description;
  }
  function renderStats() {
    const items = [[data.summary.datasets,'Source datasets','Version-pinned records','▦'],[number(data.summary.clouds),'Normalized cloud files','Plots and individual-tree exports','⌁'],[compact(data.summary.points),'Stored points','Before semantic or spatial deduplication','⋮'],[data.summary.identical_scene_extras,'Duplicate normalized exports','Metadata audit · curation pending','⇄']];
    $('#stats').innerHTML=items.map(([value,label,note,icon]) => `<div class="stat"><div><strong>${esc(value)}</strong><div class="stat-label">${esc(label)}</div><small>${esc(note)}</small></div><span class="stat-icon" aria-hidden="true">${icon}</span></div>`).join('');
    $('#dataset-count').textContent=data.datasets.length; $('#finding-count').textContent=data.findings.length;
    $('#snapshot-date').textContent=`Snapshot · ${new Date(data.generated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})} · Catalog snapshot`;
  }
  function renderLegend() {
    $('#legend').innerHTML = Object.entries(kinds).map(([id,k]) => `<button data-kind="${id}" class="${state.hiddenKinds.has(id)?'off':''}" aria-pressed="${!state.hiddenKinds.has(id)}"><i class="legend-dot" style="background:${k.color}"></i>${k.name}</button>`).join('');
  }
  function pointOnBox(start, end) {
    const dx=end[0]-start[0], dy=end[1]-start[1];
    const t=Math.min(105/(Math.abs(dx)||1),46/(Math.abs(dy)||1));
    return [start[0]+dx*t,start[1]+dy*t];
  }
  function pathFor(m, index) {
    const start=pointOnBox(positions[m.source],positions[m.target]);
    const end=pointOnBox(positions[m.target],positions[m.source]);
    const dx=end[0]-start[0],dy=end[1]-start[1],len=Math.hypot(dx,dy)||1;
    const bend=m.kind==='shared'?-38:((index%2) ? 24 : -24);
    const control=[(start[0]+end[0])/2-dy/len*bend,(start[1]+end[1])/2+dx/len*bend];
    return `M ${start.join(' ')} Q ${control.join(' ')} ${end.join(' ')}`;
  }
  function renderGraph() {
    const nodes=visibleDatasets(), edges=visibleMappings();
    if(state.edge&&!edges.some(m=>m.id===state.edge))state.edge=null;
    if(nodes.length&&!nodes.some(d=>d.id===state.selected))state.selected=nodes[0].id;
    const defs=Object.entries(kinds).map(([id,k]) => `<marker id="arrow-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${k.color}"/></marker>`).join('');
    const edgeHtml=edges.map((m,i) => `<g class="edge-group" data-edge="${esc(m.id)}" tabindex="0" role="button" aria-label="${esc(`${names[m.source]} to ${names[m.target]}: ${m.name}`)}"><path class="edge-hit" d="${pathFor(m,i)}"/><path class="edge ${m.id===state.edge?'selected':''}" d="${pathFor(m,i)}" stroke="${kinds[m.kind].color}" stroke-dasharray="${kinds[m.kind].dash}" ${m.kind==='shared'?'':`marker-end="url(#arrow-${m.kind})"`}/><title>${esc(m.name)} — ${esc(kinds[m.kind].name)}</title></g>`).join('');
    const nodeHtml=nodes.map(d => {
      const [x,y]=positions[d.id],selected=d.id===state.selected&&!state.edge;
      return `<g class="graph-node ${d.short.length>14?'long-name':''} ${selected?'selected':''} ${supported(d)?'':'dim'}" data-node="${d.id}" tabindex="0" role="button" aria-label="${esc(`${d.name}: ${stateLabel(taskState(d))} for this task`)}" transform="translate(${x-105} ${y-46})"><rect width="210" height="92" rx="12"/><text class="node-mark" x="14" y="30">${d.spectral?'◉':'⌁'}</text><text class="node-name" x="39" y="29">${esc(d.short)}</text><text class="node-sub" x="15" y="49">${esc(d.modalities.join(' · '))}</text><text class="node-status" x="15" y="68">${esc(stateLabel(taskState(d)).toUpperCase())}</text><title>${esc(d.name)} · ${esc(d.readiness==='Reference schema'?'Native annotation schema':d.readiness)}</title></g>`;
    }).join('');
    $('#relationship-graph').innerHTML=`<defs>${defs}</defs><g id="graph-content" transform="translate(${state.pan.x} ${state.pan.y}) scale(${state.zoom})">${edgeHtml}${nodeHtml}</g>${nodes.length?'':'<text x="620" y="370" text-anchor="middle" fill="#7b8c70" font-size="20">No datasets match these filters.</text>'}`;
    $('#graph-count').textContent=`${nodes.length} datasets · ${edges.length} links`;
    renderLegend();
    if(nodes.length)renderInspector();
    else $('#inspector').innerHTML='<div class="inspector-top">NO MATCHING DATASET</div><h3>Try another filter.</h3><p>Clear the search or change the platform and role filters to explore the collection.</p>';
  }
  function tasksHtml(d) { return tasks.map(t => `<div class="task-mini" title="${esc(d.source_task_support?.[t.id]?.reason||'Not reviewed')}"><span>${esc(t.name)}</span><span class="task-state ${taskClass(taskState(d,t.id))}">${stateLabel(taskState(d,t.id))}</span></div><p class="evidence-tag">${esc(d.source_task_support?.[t.id]?.reason||'Not reviewed')}</p>`).join(''); }
  function inspectorDataset(d) {
    const s=discovery(d);
    return `<div class="inspector-top"><span>SOURCE PROFILE</span><span class="record-number">${esc(d.id)}</span></div><h3>${esc(d.name)}</h3><p>${esc(d.modalities.join(' · '))} · ${esc(s.unit_label)}</p>${readinessHtml(d)}<h4>Reference coverage</h4><p>${esc(s.coverage)}</p><p class="notice">${esc(s.limitation)}</p><div class="inspector-actions"><button class="button" data-detail="${d.id}">View source & preparation ↗</button><button class="button" data-compare="${d.id}">${state.compare.has(d.id)?'✓ Remove from comparison':'+ Add to comparison'}</button></div>${link('Open provider record',d.url)}`;
  }
  function inspectorMapping(m) {
    return `<div class="inspector-top"><span>RELATIONSHIP</span><span class="record-number">${esc(m.id)}</span></div>${badge(kinds[m.kind].name,m.kind==='blocked'?'red':m.kind==='partial'?'gold':'neutral')}<p class="mapping-flow">${esc(names[m.source])} ${m.kind==='shared'?'↔':'→'} ${esc(names[m.target])}</p><h3 class="mapping-detail-name">${esc(m.name)}</h3><p>${esc(m.rule)}</p>${contractHtml(m)}<h4>Limits & information loss</h4><p class="notice">${esc(m.loss)}</p><h4>Evidence status</h4><p>${esc(m.evidence_status)}</p>${evidenceHtml(m)}<h4>Execution state</h4><p>${esc(m.implementation)}</p><div class="inspector-actions"><button class="button" data-detail="${m.source}">Inspect ${esc(names[m.source])}</button><button class="button" data-detail="${m.target}">Inspect ${esc(names[m.target])}</button></div>`;
  }
  function renderInspector() {
    if(state.edge){const m=data.mappings.find(m=>m.id===state.edge);if(m){$('#inspector').innerHTML=inspectorMapping(m);return;}}
    const d=byId[state.selected];$('#inspector').innerHTML=inspectorDataset(d);
  }
  function renderDatasets() {
    const rows=visibleDatasets();$('#catalog-count').textContent=`${rows.length} of ${data.datasets.length} source records`;
    $('#dataset-grid').innerHTML=rows.map(d=>{
      const s=discovery(d);
      return `<article class="dataset-card source-card" data-source="${d.id}"><div class="card-top">${badge(d.modalities.join(' · '))}<span class="source-unit">${esc(s.unit_label)}</span></div><h3>${esc(d.name)}</h3><p class="source-location">${esc(d.geography)}</p>${readinessHtml(d)}<p class="source-coverage">${esc(s.coverage)}</p><div class="source-caveat"><strong>Before choosing</strong><p>${esc(s.limitation)}</p></div><p class="source-record-size">${recordSize(d)} · ${d.assets} ${d.assets===1?'asset':'assets'} in the pinned record<br><small>Whole record; a task-specific download subset is TBD.</small></p><div class="card-bottom"><label class="card-compare"><input type="checkbox" data-compare-check="${d.id}" ${state.compare.has(d.id)?'checked':''}>Compare</label><button data-detail="${d.id}">View source & preparation ↗</button></div></article>`;
    }).join('')||'<div class="empty">No source matches all these conditions. Try clearing a filter. This catalog does not cover every public source.</div>';
  }
  function renderMappings() {
    const rows=visibleMappings();
    $('#mapping-list').innerHTML=rows.map(m=>`<article class="mapping-card"><div>${badge(kinds[m.kind].name,m.kind==='blocked'?'red':m.kind==='partial'?'gold':'neutral')}<h3>${esc(m.name)}</h3><div class="mapping-flow">${esc(names[m.source])} ${m.kind==='shared'?'↔':'→'} ${esc(names[m.target])}</div><span class="evidence-tag">${esc(m.evidence_status)}</span></div><div><p>${esc(m.rule)}</p><p class="warning-text">${esc(m.loss)}</p><details><summary>Precise contract and preconditions</summary>${contractHtml(m)}</details></div><button data-inspect-edge="${m.id}">Inspect evidence ↗</button></article>`).join('')||'<div class="empty">No registered relationships for this task and these filters. Absence of a link does not establish incompatibility.</div>';
  }
  function renderAudit() {
    $('#scope').innerHTML=`<div><h3>What was audited</h3><p>${esc(data.audit_scope.metadata)}</p><p>${esc(data.audit_scope.payload_samples)}</p></div><div><h3>What remains open</h3><p>${esc(data.audit_scope.limits)}</p></div>`;
    const ids=new Set(visibleDatasets().map(d=>d.id));
    $('#findings').innerHTML=data.findings.filter(f=>f.datasets.some(d=>ids.has(d))).map(f=>`<article class="finding"><div class="finding-meta">${badge(f.severity==='high'?'Priority review':'Review',f.severity==='high'?'red':'gold')}<span>${esc(f.state)}</span></div><h3>${esc(f.title)}</h3><p>${esc(f.description)}</p><div class="badges">${f.datasets.slice(0,4).map(d=>badge(names[d]||d)).join('')}${f.datasets.length>4?badge(`+${f.datasets.length-4} more`):''}</div>${f.id==='duplicates'?'<button class="button small" data-show-duplicates="true">Inspect duplicate groups ↗</button>':''}</article>`).join('')||'<div class="empty">No findings match these filters.</div>';
    $('#evidence-docs').innerHTML=data.evidence.map(e=>e.url?`<div class="evidence-doc">${link(e.name,new URL(e.url,location.href).href)}</div>`:`<div class="evidence-doc">${esc(e.name)}<code>${esc(e.path)}</code>${window.CANOPY_PUBLIC?'<small>Local audit reference · full working document is not published</small>':`<button class="button small" data-copy-path="${esc(e.path)}">Copy repository path</button>`}</div>`).join('');
  }
  function renderCompareButton() { $('#compare-count').textContent=state.compare.size;$('#compare-open').disabled=state.compare.size<2; }
  function render() {
    $('#task-question-panel').hidden=state.task!=='instances';
    renderTaskNav();renderGraph();renderDatasets();renderMappings();renderAudit();renderCompareButton();
    $('#stats').hidden=state.view!=='audit';
    const exploring=['datasets','graph','mappings'].includes(state.view);
    $('.toolbar').hidden=!exploring;
    $('.task-banner').hidden=state.view!=='graph';
    $('#compare-open').hidden=!exploring;
    $('.secondary-navigation').open=['graph','mappings','audit','benchmarks','environments'].includes(state.view);
    const copy={
      datasets:['Find a source for tree segmentation.','Compare the sampling unit, reported tree labels and preparation gaps. Whole-source download and transformation for this task are work in progress.'],
      graph:['Source relationships.','Inspect recorded dependencies and legacy projections. An arrow does not establish a validated conversion or model transfer.'],
      mappings:['Transformation evidence.','Inspect existing code and missing adapters. A label projection is not a complete task pipeline.'],
      audit:['Evidence and workspace history.','These acquisition counts and findings describe a saved local study, not the contents of every user’s workspace.'],
      workbench:['Review downloads and preparation.','Retrieve original record assets through the connected service. Task-specific subset selection and whole-source preparation remain work in progress.'],
      benchmarks:['Benchmark prototypes · WIP','One frozen diagnostic recipe runs. General adapters, full article audits and independent validation remain pending.'],
      environments:['Execution environments · WIP','Pinned images for named recipes; environment metadata is distinct from scientific validation.']
    }[state.view];
    $('.page-heading h1').textContent=copy[0];$('.page-heading p').textContent=copy[1];
    const labels={graph:'Relationships',datasets:'Sources',mappings:'Transformation evidence',audit:'Evidence & workspace history',workbench:'Data preparation · WIP',benchmarks:'Benchmarks · WIP',environments:'Image registry · WIP'};
    $$('.nav-item').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false');});
    $$('.view').forEach(el=>el.hidden=el.id!==`view-${state.view}`);$('#breadcrumb-view').textContent=labels[state.view];
  }
  function selectView(view) { state.view=view;location.hash=view;render();window.scrollTo(0,0); }
  function detail(id) {
    const d=byId[id];if(!d)return;
    const s=discovery(d),relationships=data.mappings.filter(m=>m.tasks.includes(state.task)&&(m.source===id||m.target===id));
    $('#detail-dialog-title').textContent=d.name;
    $('#dialog-detail').innerHTML=`<div class="source-detail"><div class="badges">${badge(d.modalities.join(' · '))}${badge(s.unit_label)}${badge(`Pinned record ${d.id}`)}</div><p class="source-location">${esc(d.geography)}</p>${readinessHtml(d)}<h3>What can I use?</h3><p>${esc(s.coverage)}</p><p class="notice">${esc(s.limitation)}</p><div class="source-actions">${link('Open provider record',d.url)}<button class="button" data-source-download="${d.id}" ${serviceConnected?'':'disabled'}>Review original downloads</button><button class="button" data-compare="${d.id}">${state.compare.has(id)?'✓ Remove from comparison':'+ Add to comparison'}</button></div><p class="source-service-note">${esc(sourceServiceNote())}</p><details class="source-section" open><summary>Preparation for this task · ${s.preparation.status==='blocked'?'review required':'TBD'}</summary><p>${esc(s.preparation.detail)}</p><p>Whole pinned record: ${recordSize(d)} in ${d.assets} assets. This includes supporting files where present; extracted data needs additional space.</p>${s.preparation.limited_reference_copy?`<div class="limited-reference"><h4>Existing limited operation: frozen Wytham reference copy</h4><p>One already prevoxelized reference export can be copied and hash-verified. This does not transform the raw acquisition or establish independent validation.</p><button class="button" data-task-review="${d.id}">Inspect the verified reference-copy scope</button></div>`:''}</details><details class="source-section"><summary>Source evidence and unresolved questions</summary>${sourceReview(d)}</details><details class="source-section"><summary>Native fields, coordinates and declared terms</summary><h4>Source annotations</h4><p>${esc(d.labels)}</p><h4>Coordinates</h4><p>${esc(d.coordinate_policy)}</p><p>${(d.coordinate_references||[]).map(c=>`${esc(c.value)}: ${c.files} files`).join(' · ')||'Conversion deferred; no normalized coordinate audit.'}</p><h4>Native field names</h4><p>Names from saved schemas; types, ranges and units are not uniformly audited.</p><div class="field-pills">${d.source_fields.map(f=>`<code>${esc(f)}</code>`).join('')||'Conversion deferred; inspect source definitions.'}</div><h4>Record-declared terms</h4><p>${esc(d.license.toUpperCase())}. Intended-use and component terms still require review.</p><h4>Historical local representation</h4><p>${number(d.cloud_count)} normalized files · ${number(d.chunks)} chunks · ${compact(d.points)} stored points. File counts mix plots and derived trees where applicable; they do not count independent sites.</p><h4>Provider metadata SHA256</h4><code class="raw-path">${esc(d.source_metadata_sha256)}</code></details><details class="source-section"><summary>Relationships relevant to this task</summary>${relationships.map(m=>`<div class="source-relationship"><strong>${esc(m.name)}</strong><p>${esc(m.loss)}</p><button class="button small" data-inspect-edge="${esc(m.id)}">Inspect relationship evidence</button></div>`).join('')||'<p>No relationship is registered for this task. Absence of a link does not establish incompatibility.</p>'}</details></div>`;
    const dialog=$('#detail-dialog');if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
  }
  function toggleCompare(id) {
    if(state.compare.has(id))state.compare.delete(id);
    else {if(state.compare.size===3){toast('Compare up to three datasets at a time.');return;}state.compare.add(id);}
    render(); if($('#detail-dialog').open)detail(id);
  }
  function showCompare() {
    const rows=[...state.compare].map(id=>byId[id]);
    const fields=[['Platform',d=>d.modalities.join(' · ')],['Data unit',d=>discovery(d).unit_label],['Instance reference',d=>discovery(d).instance_reference.label],['Reference coverage',d=>discovery(d).coverage],['Task preparation',d=>discovery(d).preparation.label],['Main limitation',d=>discovery(d).limitation],['Whole record assets',d=>`${recordSize(d)} · ${d.assets} assets; task subset TBD`],['Location',d=>d.geography],['Record-declared terms',d=>d.license.toUpperCase()],['Source',d=>d.url]];
    $('#compare-content').innerHTML=`<div class="scroll-table"><table><thead><tr><th>Attribute</th>${rows.map(d=>`<th>${esc(d.name)}</th>`).join('')}</tr></thead><tbody>${fields.map(([name,fn])=>`<tr><td>${esc(name)}</td>${rows.map(d=>`<td>${name==='Source'?link('Published record',fn(d)):esc(fn(d))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="graph-help">Reported reference does not certify annotation coverage, geographic independence or an executable preparation pipeline.</p>`;
    $('#compare-dialog').showModal();
  }
  function download(value,filename) {
    const blob=new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Snapshot exported.');
  }
  function zoom(delta) {state.zoom=Math.max(.65,Math.min(1.8,state.zoom+delta));state.pan={x:620*(1-state.zoom),y:395*(1-state.zoom)};renderGraph();}
  document.addEventListener('click',event=>{
    const target=event.target.closest('button, [data-node], [data-edge]');if(!target)return;
    if(target.dataset.sourceDownload && serviceConnected){$('#detail-dialog').close();document.dispatchEvent(new CustomEvent('canopy-inspect-source',{detail:{record_id:target.dataset.sourceDownload}}));}
    if(target.dataset.taskReview){$('#detail-dialog').close();selectView('graph');$('#diagnostic-reference').open=true;$('#task-dataset').value=target.dataset.taskReview;$('#task-objective').value='diagnostic';$('#task-dataset').dispatchEvent(new Event('change'));$('#diagnostic-reference').scrollIntoView({block:'start'});}
    if(target.dataset.view)selectView(target.dataset.view);
    if(target.dataset.task && tasks.some(t => t.id === target.dataset.task)){state.task=target.dataset.task;state.selected=({instances:'16742708',})[state.task];state.edge=null;state.hiddenKinds.clear();render();}
    if(target.dataset.node){state.selected=target.dataset.node;state.edge=null;renderGraph();}
    if(target.dataset.edge){state.edge=target.dataset.edge;renderGraph();}
    if(target.dataset.kind){const k=target.dataset.kind;state.hiddenKinds.has(k)?state.hiddenKinds.delete(k):state.hiddenKinds.add(k);renderGraph();renderMappings();}
    if(target.dataset.detail)detail(target.dataset.detail);
    if(target.dataset.compare)toggleCompare(target.dataset.compare);
    if(target.dataset.inspectEdge){if($('#detail-dialog').open)$('#detail-dialog').close();state.edge=target.dataset.inspectEdge;selectView('graph');$('#inspector').scrollIntoView({block:'nearest'});}
    if(target.dataset.showDuplicates){
      $('#detail-dialog-title').textContent='Recorded duplicate groups';
      $('#dialog-detail').innerHTML='<p class="graph-help">Complete chunk-hash sequences match. These are recorded duplicate exports, not deletion instructions; annotation variants and spatial overlap require separate review.</p><div class="scroll-table"><table><thead><tr><th>Group</th><th>Datasets</th><th>Source paths</th></tr></thead><tbody>'+data.duplicates.map((g,i)=>`<tr><td>${i+1}<br>${number(g.points)} points</td><td>${g.records.map(r=>esc(names[r])).join('<br>')}</td><td>${g.paths.map(p=>`<code class="raw-path">${esc(p)}</code>`).join('')}</td></tr>`).join('')+'</tbody></table></div>';
      $('#detail-dialog').showModal();
    }
    if(target.dataset.copyPath){const path=target.dataset.copyPath;if(navigator.clipboard?.writeText)navigator.clipboard.writeText(path).then(()=>toast('Repository path copied.')).catch(()=>toast(path));else toast(path);}
    if(target.classList.contains('close-dialog'))target.closest('dialog').close();
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)&&!$('dialog[open]')){e.preventDefault();$('#search').focus();}
    if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-node],[data-edge]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
  });
  $('#search').addEventListener('input',e=>{state.search=e.target.value;render();});
  $('#platform').addEventListener('change',e=>{state.platform=e.target.value;render();});
  ['unit','reference','preparation'].forEach(key=>$('#'+key).addEventListener('change',e=>{state[key]=e.target.value;render();}));
  document.addEventListener('change',e=>{if(e.target.dataset.compareCheck)toggleCompare(e.target.dataset.compareCheck);});
  $('#reset').addEventListener('click',()=>{state.search='';state.platform='all';state.unit='all';state.reference='all';state.preparation='all';state.hiddenKinds.clear();$('#search').value='';['platform','unit','reference','preparation'].forEach(key=>$('#'+key).value='all');render();});
  $('#compare-open').addEventListener('click',showCompare);
  $('#export').addEventListener('click',()=>download(data,'canopy-catalog.json'));
  $('#evidence-export').addEventListener('click',()=>download({generated_at:data.generated_at,scope:data.audit_scope,findings:data.findings},'canopy-review-findings.json'));
  $('#zoom-in').addEventListener('click',()=>zoom(.15));$('#zoom-out').addEventListener('click',()=>zoom(-.15));$('#zoom-fit').addEventListener('click',()=>{state.zoom=1;state.pan={x:0,y:0};renderGraph();});
  let dragging=null;
  $('#relationship-graph').addEventListener('pointerdown',e=>{if(e.target.closest('[data-node],[data-edge]'))return;dragging={x:e.clientX,y:e.clientY,origin:{...state.pan}};$('#relationship-graph').setPointerCapture(e.pointerId);});
  $('#relationship-graph').addEventListener('pointermove',e=>{if(!dragging)return;const scale=1240/$('#relationship-graph').getBoundingClientRect().width;state.pan={x:dragging.origin.x+(e.clientX-dragging.x)*scale,y:dragging.origin.y+(e.clientY-dragging.y)*scale};$('#graph-content').setAttribute('transform',`translate(${state.pan.x} ${state.pan.y}) scale(${state.zoom})`);});
  $('#relationship-graph').addEventListener('pointerup',()=>dragging=null);$('#relationship-graph').addEventListener('pointercancel',()=>dragging=null);
  window.addEventListener('hashchange',()=>{const v=location.hash.slice(1);if(['graph','datasets','mappings','audit','workbench','benchmarks','environments'].includes(v)){state.view=v;render();}});
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  if(['graph','datasets','mappings','audit','workbench','benchmarks','environments'].includes(location.hash.slice(1)))state.view=location.hash.slice(1);
  document.addEventListener('canopy-service-state',e=>{serviceConnected=e.detail.connected;$$('[data-source-download]').forEach(b=>b.disabled=!serviceConnected);$$('.source-service-note').forEach(p=>p.textContent=sourceServiceNote());});
  renderStats();render();
  // Exposed read-only state is useful for integrations and smoke checks.
  window.CanopyHub={catalog:data,activeTasks:tasks,getState:()=>({...state,compare:[...state.compare],hiddenKinds:[...state.hiddenKinds]})};
})();
