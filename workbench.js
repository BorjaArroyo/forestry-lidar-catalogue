/* Local operations are explicit jobs; the knowledge catalog stays a saved snapshot. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const link = (label,url) => /^https:\/\//.test(url || '') ? `<a class="source-link" target="_blank" rel="noopener noreferrer" href="${esc(url)}">${esc(label)} ↗</a>` : '';
  const localService = !window.CANOPY_PUBLIC && ['127.0.0.1','localhost'].includes(location.hostname);
  let token, record, snapshot, selectedJob, evidence, refreshing=false;
  function message(text) { $('#workbench-message').textContent=text;$('#workbench-message').hidden=false; }
  async function api(path, body) {
    if(!localService)throw new Error('This action requires the local Canopy service.');
    const response=await fetch(path,body ? {method:'POST',headers:{'Content-Type':'application/json','X-Canopy-Token':token},body:JSON.stringify(body)} : {});
    const result=await response.json();if(!response.ok)throw new Error(result.error || `HTTP ${response.status}`);return result;
  }
  function save(value,name) {const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function renderRegistry(reg) {
    const tasks=window.CanopyHub.activeTasks;
    const selected=$('#benchmark-task').value;
    $('#benchmark-task').innerHTML=tasks.map(t=>`<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('');
    if(tasks.some(t=>t.id===selected))$('#benchmark-task').value=selected;
    const task=$('#benchmark-task').value;
    const recipes=reg.recipes.filter(r=>r.tasks.includes(task));
    $('#benchmark-list').innerHTML=recipes.map(r=>`<article class="work-card"><span class="eyebrow">${esc(tasks.filter(t=>r.tasks.includes(t.id)).map(t=>t.title).join(' / '))}</span><h3>${esc(r.name)}</h3><span class="badge gold">${r.enabled?'Execution verified for one frozen subset':'Execution not validated'}</span><p>${esc(r.stage)}</p><div class="work-links">${link('Repository',r.repository)}${link('Paper',r.paper)}${link('Execution guide',r.guide)}</div><h4>Metrics & protocol</h4><p>${esc(r.metrics.join('; '))}</p>${r.protocol?`<p class="evidence-tag">${Object.entries(r.protocol).map(([k,v])=>`${esc(k.replaceAll('_',' '))}: ${esc(v)}`).join('<br>')}</p>`:''}<p>Dataset records: ${esc(r.datasets.join(', '))}</p><h4>What has actually been reviewed</h4><p>${esc(r.dataset_scope||'Scope not recorded')}</p>${r.review_scope?`<ul>${Object.values(r.review_scope).map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`:''}<h4>Documented caveats and local findings</h4>${r.caveats.map(c=>`<p class="notice"><strong>${esc(c.kind)}</strong><br>${esc(c.text)} ${link('Evidence',c.url)}</p>`).join('')}<p class="evidence-tag">${esc(r.audit_status)} · Reviewed ${esc(reg.reviewed_at)}</p><h4>Execution blockers</h4><ul>${r.blockers.map(b=>`<li>${esc(b)}</li>`).join('')}</ul></article>`).join('')||'<p class="notice">No benchmark recipe has been registered for this task yet.</p>';
    $('#environment-list').innerHTML=reg.images.map(i=>`<article class="work-card"><span class="eyebrow">${esc(i.platform)}</span><h3>${esc(i.name)}</h3><span class="badge ${i.validated?'neutral':'gold'}">${i.validated?'Executed for the named recipe':'Execution not validated'}</span><dl><dt>Immutable image</dt><dd><code>${esc(i.reference||'Not registered')}</code></dd><dt>Source commit</dt><dd><code>${esc(i.commit||'Not pinned')}</code></dd><dt>GPU adapter</dt><dd>${i.gpu?'Required':'Not declared for this recipe; validate dependencies'}</dd></dl>${link('Upstream environment source',i.build_source)}</article>`).join('');
    const previous=$('#benchmark-recipe').value;
    $('#benchmark-recipe').innerHTML=recipes.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    if(recipes.some(r=>r.id===previous))$('#benchmark-recipe').value=previous;
    configureRecipe();
  }
  function configureRecipe() {
    const remote=$('#benchmark-recipe').value==='treelearn-wytham-ray';
    const input=$('#benchmark-root');
    if(remote)input.value=snapshot?.ray?.input_dir||'';
    else if(input.readOnly)input.value='';
    input.readOnly=remote;input.required=!remote;
    $('#benchmark-run').textContent=remote?'Run on Ray':'Run prepared benchmark';
    $('#benchmark-execution').textContent=remote
      ? `Remote KubeRay · ${snapshot?.ray?.configured ? snapshot.ray.context+' / '+snapshot.ray.namespace : 'server profile required'}. Frozen Wytham only: 3,378,949 points. One GPU, 8 CPU, 32 GiB; two-hour deadline. Each run creates a fresh PVC output directory. Kubernetes pulls the pinned public image if absent. Scores are in-source diagnostics, not an independent benchmark.`
      : 'Local Docker CPU execution. Prepared inputs use /inputs; results use /outputs. Images are not built or pulled automatically.';
  }
  function renderJobs(jobs) {
    $('#job-list').innerHTML=jobs.length?jobs.map(j=>`<article class="job-row"><div><strong>${esc(j.backend==='ray'?(j.imported?'TreeLearn · Ray · imported validation':'TreeLearn · Ray'):j.kind)}</strong><small>${esc(j.root)}</small>${j.output_dir?`<small>Outputs: ${esc(j.output_dir)}</small>`:''}<small>${esc(j.created_at)}</small>${j.error||j.connection_error?`<p class="notice">${esc(j.error||j.connection_error)}</p>`:''}</div><span class="badge ${j.status==='failed'?'red':'neutral'}">${esc(j.status)}</span><button class="button small" data-job="${esc(j.id)}">Inspect log & evidence</button>${j.backend==='ray'&&['queued','running','cancelling'].includes(j.status)?`<button class="button small" data-cancel="${esc(j.id)}">${j.status==='cancelling'?'Retry cancellation':'Cancel Ray job'}</button>`:''}</article>`).join(''):'<p class="notice">No workbench jobs yet. The completed 96-asset acquisition remains in the catalog snapshot.</p>';
  }
  async function loadLog(id) {
    selectedJob=id;const result=await api(`/api/log?id=${encodeURIComponent(id)}`);
    evidence={job:snapshot.jobs.find(j=>j.id===id),...result};
    $('#job-detail').hidden=false;$('#job-log').textContent=result.log||'No persisted execution log yet. See job status above.';
    $('#job-artifacts').innerHTML=(result.files||[]).map(f=>`<a class="source-link" href="/api/artifact?id=${encodeURIComponent(id)}&name=${encodeURIComponent(f.name)}">Download ${esc(f.name)} (${(f.size_bytes/1e6).toFixed(2)} MB)</a>`).join('<br>');
  }
  function serviceControls(connected) {
    ['#inspect-form','#preprocess-form','#benchmark-form'].forEach(selector=>{
      document.querySelectorAll(`${selector} input, ${selector} select, ${selector} button`).forEach(el=>{el.disabled=!connected;});
    });
    document.dispatchEvent(new CustomEvent('canopy-service-state',{detail:{connected,rayConfigured:!!snapshot?.ray?.configured}}));
    $('#benchmark-run').disabled=true;
    $('#refresh-jobs').disabled=!connected;
  }
  async function catalogMode() {
    token=null;serviceControls(false);
    $('#service-status').textContent=localService?'Browser ready · service offline':'Browser ready · server workflows offline';
    $('#job-list').innerHTML='<p class="notice">Jobs run in your local workbench. Local directories, job history and logs are not published here.</p>';
    message('PLY inspection runs directly in this browser. The acquisition and server preprocessing workflows below require a connected execution service.');
    $('#benchmark-readiness').textContent='Execution requires the local service and a validated recipe.';
    try {
      const response=await fetch('benchmarks.json');
      if(!response.ok)throw new Error('Benchmark metadata is unavailable');
      snapshot={registry:await response.json(),jobs:[]};renderRegistry(snapshot.registry);
    } catch(e) {$('#benchmark-list').textContent=e.message;$('#environment-list').textContent=e.message;}
  }
  async function refresh() {
    if(refreshing)return;
    if(!localService)return catalogMode();
    refreshing=true;
    try {snapshot=await api('/api/state');token=snapshot.token;$('#service-status').textContent='Local service connected';if($('#inspect-form button').disabled)serviceControls(true);document.dispatchEvent(new CustomEvent('canopy-service-state',{detail:{connected:true,rayConfigured:!!snapshot.ray?.configured}}));renderJobs(snapshot.jobs);renderRegistry(snapshot.registry);if(selectedJob){try{await loadLog(selectedJob);}catch(e){message(e.message);}}}
    catch(e){await catalogMode();}
    finally{refreshing=false;}
  }
  async function launch(body) {if(!token)throw new Error('The local workbench service is not connected');const result=await api('/api/jobs',body);selectedJob=result.id;message('Job started. Originals and execution evidence are retained.');await refresh();}
  $('#inspect-form').addEventListener('submit',async e=>{e.preventDefault();record=null;$('#record-preview').textContent='Inspecting record…';try{record=await api('/api/inspect',{record:$('#zenodo-record').value});const bytes=record.files.reduce((n,f)=>n+f.size_bytes,0);$('#record-preview').innerHTML=`<h4>${esc(record.title)}</h4><p>${record.files.length} ${record.files.length===1?'asset':'assets'} · ${(bytes/1e9).toFixed(2)} GB compressed · ${esc(record.license_declared?.id || 'License not declared')}</p><p class="evidence-tag">Extraction needs additional space beyond the compressed size. Only ZIP archives are expanded; other assets are retained as downloaded.</p><label>Destination directory<input id="download-root" required placeholder="/absolute/path/to/new-record-directory"></label><button class="button" id="download-start">Download / resume verified originals</button>`;$('#record-preview').scrollIntoView({block:'start'});}catch(err){$('#record-preview').textContent=err.message;}});
  document.addEventListener('click',async e=>{const button=e.target.closest('button');if(!button)return;try{if(button.id==='download-start'&&record)await launch({kind:'acquire',record_id:record.record_id,root:$('#download-root').value});if(button.dataset.job)await loadLog(button.dataset.job);if(button.dataset.cancel){await api('/api/cancel',{id:button.dataset.cancel});message('Ray cancellation requested. PVC inputs and outputs are retained.');await refresh();}}catch(err){message(err.message);}});
  $('#preprocess-form').addEventListener('submit',async e=>{e.preventDefault();try{await launch({kind:$('#workflow').value,root:$('#process-root').value});}catch(err){message(err.message);}});
  $('#benchmark-check').addEventListener('click',async()=>{try{const r=await api('/api/preflight',{recipe_id:$('#benchmark-recipe').value,root:$('#benchmark-root').value});$('#benchmark-run').disabled=!r.ready;$('#benchmark-readiness').textContent=r.ready?(r.detail||'Ready to run.') :r.blockers.join(' · ');}catch(e){$('#benchmark-readiness').textContent=e.message;}});
  $('#benchmark-form').addEventListener('submit',async e=>{e.preventDefault();try{await launch({kind:'benchmark',recipe_id:$('#benchmark-recipe').value,root:$('#benchmark-root').value});$('#benchmark-readiness').textContent='Benchmark job started.';}catch(err){$('#benchmark-readiness').textContent=err.message;}});
  $('#benchmark-recipe').addEventListener('change',()=>{configureRecipe();$('#benchmark-readiness').textContent='Check readiness for the selected recipe.';$('#benchmark-run').disabled=true;});
  $('#benchmark-form').addEventListener('input',()=>{$('#benchmark-run').disabled=true;});
  $('#benchmark-task').addEventListener('change',()=>{if(snapshot)renderRegistry(snapshot.registry);});
  $('#refresh-jobs').addEventListener('click',refresh);$('#job-export').addEventListener('click',()=>{if(evidence)save(evidence,`canopy-job-${selectedJob}.json`);});
  document.addEventListener('canopy-inspect-source',e=>{location.hash='workbench';$('#zenodo-record').value=e.detail.record_id;$('#inspect-form').requestSubmit();message('Inspect original source assets. This does not prepare or admit a task-ready dataset.');});
  document.addEventListener('canopy-open-recipe',e=>{location.hash='benchmarks';$('#benchmark-recipe').value=e.detail.recipe_id;configureRecipe();$('#benchmark-run').disabled=true;$('#benchmark-readiness').textContent='Diagnostic scope only. Check readiness before execution.';});
  document.addEventListener('canopy-prepare-task',async e=>{try{await launch({kind:'prepare-task',...e.detail});location.hash='workbench';}catch(err){message(err.message);location.hash='workbench';}});
  refresh();if(localService)setInterval(()=>{if(token&&!document.hidden)refresh();},5000);
})();
