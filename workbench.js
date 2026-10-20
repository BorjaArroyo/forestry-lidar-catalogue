/* Pinned originals and admitted source preparation run on the service host. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localService = !window.CANOPY_PUBLIC && ['127.0.0.1','localhost'].includes(location.hostname);
  const selectedSource = () => document.getElementById('prepare-source')?.value;
  const localPreparationReady = id => snapshot?.preparation?.available && String(snapshot.preparation.record_id) === String(id) && window.CanopyTaskSelection.assess(id, window.CanopyHub.getTaskRequest()).status === 'ready';
  let token, record, snapshot, selectedJob, evidence, refreshing=false;
  function message(text) {$('#workbench-message').textContent=text;$('#workbench-message').hidden=false;}
  async function api(path, body) {
    if(!localService)throw new Error('Connect the local Canopy service to download into a chosen directory.');
    const response=await fetch(path,body ? {method:'POST',headers:{'Content-Type':'application/json','X-Canopy-Token':token},body:JSON.stringify(body)} : {});
    const result=await response.json();if(!response.ok)throw new Error(result.error || `HTTP ${response.status}`);return result;
  }
  function save(value,name) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function jobLabel(job) {
    const phases={starting:'Starting',downloading:'Downloading originals',preparing:'Preparing instances',validating:'Checking prepared data'};
    return job.status==='running'?(phases[job.phase]||job.status):job.status;
  }
  function renderJobs(jobs) {
    $('#job-list').innerHTML=jobs.length?jobs.map(j=>`<article class="job-row"><div><strong>${j.kind==='prepare-instances'?'Prepare instances':'Original source'} · ${esc(j.record_id)}</strong><small>${esc(j.root)}</small>${j.output?`<small>Prepared output: ${esc(j.output)}</small>`:''}<small>${esc(j.created_at)}</small>${j.error?`<p class="notice">${esc(j.error)}</p>`:''}</div><span class="badge ${j.status==='failed'?'red':'neutral'}">${esc(jobLabel(j))}</span><button class="button small" data-job="${esc(j.id)}">Inspect log & evidence</button></article>`).join(''):'<p class="notice">No data jobs in this service. Catalog counts describe a separate saved workspace.</p>';
  }
  async function loadLog(id) {
    selectedJob=id;const result=await api(`/api/log?id=${encodeURIComponent(id)}`);
    evidence={job:snapshot.jobs.find(j=>j.id===id),...result};
    $('#job-detail').hidden=false;$('#job-log').textContent=result.log||'No execution log yet.';
    const report=result.reports['task-package-report.json'];
    $('#job-result').hidden=!report;
    $('#job-result').textContent=report?.status==='validated'?`Checked ${report.plots} scenes and ${report.points.toLocaleString()} points against the preparation contract. ${report.unmatched_split_rows} published partition entries remain unmatched. This checks prepared data, not annotation completeness or geographic independence.`:report?'Historical preparation report; independent contract validation was not recorded.':'';
  }
  function controls(connected) {
    document.querySelectorAll('#inspect-form input, #inspect-form select, #inspect-form button, #record-preview input, #record-preview button, #prepare-form input, #prepare-form button').forEach(el=>{el.disabled=!connected;});
    $('#refresh-jobs').disabled=!connected;
    document.querySelectorAll('#prepare-form input, #prepare-form button').forEach(el=>{el.disabled=!connected||!selectedSource()||!localPreparationReady(selectedSource());});
    $('#preparation-status').textContent=selectedSource()&&localPreparationReady(selectedSource())?'The selected source has an admitted local preparation. It runs on this service host.':'The selected source has no available local preparation for this request.';
    document.dispatchEvent(new CustomEvent('canopy-service-state',{detail:{connected}}));
  }
  function catalogMode() {
    token=null;controls(false);
    $('#service-status').textContent='Whole-archive service offline';
    $('#job-list').textContent='Jobs and destination paths stay on the service host.';
    message('You can use admitted browser preparations above without a local service. Whole-archive acquisition and preparation into a directory use the optional local service described in the README. Other source adapters remain TBD.');
  }
  async function refresh() {
    if(refreshing)return;
    if(!localService){catalogMode();return;}
    refreshing=true;
    try {
      snapshot=await api('/api/state');token=snapshot.token;
      $('#service-status').textContent='Local data service connected';controls(true);renderJobs(snapshot.jobs);
      if(selectedJob)await loadLog(selectedJob);
    } catch(e){catalogMode();}
    finally{refreshing=false;}
  }
  $('#zenodo-record').innerHTML=window.CanopyHub.catalog.datasets.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.id)}</option>`).join('');
  $('#inspect-form').addEventListener('submit',async e=>{
    e.preventDefault();record=null;$('#record-preview').textContent='Inspecting pinned record…';
    try {
      record=await api('/api/inspect',{record:$('#zenodo-record').value});
      const bytes=record.files.reduce((n,f)=>n+f.size_bytes,0);
      $('#record-preview').innerHTML=`<h4>${esc(record.title)}</h4><p>${record.files.length} assets · ${(bytes/1e9).toFixed(2)} GB compressed · ${esc(record.license_declared?.id || 'License not declared')}</p><details><summary>Pinned assets and provider checksums</summary><ul>${record.files.map(f=>`<li>${esc(f.name)} · ${esc(f.provider_checksum)}</li>`).join('')}</ul></details><p class="evidence-tag">Downloads include all record assets. Extraction needs additional space. Only ZIP archives are expanded. Published checksums verify transfer integrity; they do not certify annotation correctness.</p><label>Destination directory on the service host<input id="download-root" required placeholder="/absolute/path/to/new-record-directory"></label>${localPreparationReady(record.record_id)?'<label><input id="prepare-after" type="checkbox"> Prepare instance data after download</label><label>Separate prepared-output directory<input id="prepare-output" placeholder="/absolute/path/to/new-instance-package"></label><p class="evidence-tag">The source-specific policy and published partitions apply. Review the source caveats before preparing data.</p>':''}<button class="button" id="download-start">Download / resume selected workflow</button>`;
      $('#record-preview').scrollIntoView({block:'start'});
    } catch(err){$('#record-preview').textContent=err.message;}
  });
  document.addEventListener('click',async e=>{
    const button=e.target.closest('button');if(!button)return;
    try {
      if(button.id==='download-start'&&record){
        if(!token)throw new Error('The local download service is not connected');
        button.disabled=true;
        try {
          const body={kind:'acquire',record_id:record.record_id,root:$('#download-root').value};
          if($('#prepare-after')?.checked){
            if(!$('#prepare-output').value.trim())throw new Error('Choose a separate prepared-output directory');
            body.prepare_output=$('#prepare-output').value;
            body.task_request=window.CanopyHub.getTaskRequest();
          }
          const result=await api('/api/jobs',body);
          selectedJob=result.id;message('Download started. Originals, checkpoints and verification logs are retained.');await refresh();
        } finally {button.disabled=!token;}
      }
      if(button.dataset.job)await loadLog(button.dataset.job);
    } catch(err){message(err.message);}
  });
  $('#prepare-form').addEventListener('submit',async e=>{
    e.preventDefault();
    try {
      const result=await api('/api/jobs',{kind:'prepare-instances',record_id:Number(selectedSource()),root:$('#prepare-input').value,output:$('#prepare-destination').value,task_request:window.CanopyHub.getTaskRequest()});
      selectedJob=result.id;message('Selected-source preparation started locally. Originals remain unchanged.');await refresh();
    } catch(err){message(err.message);}
  });
  $('#refresh-jobs').addEventListener('click',refresh);
  $('#job-export').addEventListener('click',()=>{if(evidence)save(evidence,`canopy-job-${selectedJob}.json`);});
  document.addEventListener('canopy-inspect-source',e=>{location.hash='workbench';$('#zenodo-record').value=e.detail.record_id;$('#inspect-form').requestSubmit();message('Review the original assets. Downloading does not prepare task-ready data.');});
  document.addEventListener('canopy-task-request',()=>controls(Boolean(token)));
  document.addEventListener('canopy-source-selected',()=>controls(Boolean(token)));
  refresh();
  if(localService)setInterval(()=>{if(!document.hidden)refresh();},5000);
})();
