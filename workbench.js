/* Explicit original-source downloads; task preparation is not available yet. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localService = !window.CANOPY_PUBLIC && ['127.0.0.1','localhost'].includes(location.hostname);
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
  function renderJobs(jobs) {
    $('#job-list').innerHTML=jobs.length?jobs.map(j=>`<article class="job-row"><div><strong>Original source · ${esc(j.record_id)}</strong><small>${esc(j.root)}</small><small>${esc(j.created_at)}</small>${j.error?`<p class="notice">${esc(j.error)}</p>`:''}</div><span class="badge ${j.status==='failed'?'red':'neutral'}">${esc(j.status)}</span><button class="button small" data-job="${esc(j.id)}">Inspect log & evidence</button></article>`).join(''):'<p class="notice">No original-download jobs in this service. Catalog counts describe a separate saved workspace.</p>';
  }
  async function loadLog(id) {
    selectedJob=id;const result=await api(`/api/log?id=${encodeURIComponent(id)}`);
    evidence={job:snapshot.jobs.find(j=>j.id===id),...result};
    $('#job-detail').hidden=false;$('#job-log').textContent=result.log||'No execution log yet.';
  }
  function controls(connected) {
    document.querySelectorAll('#inspect-form input, #inspect-form select, #inspect-form button, #record-preview input, #record-preview button').forEach(el=>{el.disabled=!connected;});
    $('#refresh-jobs').disabled=!connected;
    document.dispatchEvent(new CustomEvent('canopy-service-state',{detail:{connected}}));
  }
  function catalogMode() {
    token=null;controls(false);
    $('#service-status').textContent='Original downloads · service offline';
    $('#job-list').textContent='Jobs and destination paths stay on the service host.';
    message('The public site provides source discovery and provider links. To download verified originals into a chosen directory, run the local service described in the repository README. Task preparation remains TBD.');
  }
  async function refresh() {
    if(refreshing)return;
    if(!localService){catalogMode();return;}
    refreshing=true;
    try {
      snapshot=await api('/api/state');token=snapshot.token;
      $('#service-status').textContent='Local download service connected';controls(true);renderJobs(snapshot.jobs);
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
      $('#record-preview').innerHTML=`<h4>${esc(record.title)}</h4><p>${record.files.length} assets · ${(bytes/1e9).toFixed(2)} GB compressed · ${esc(record.license_declared?.id || 'License not declared')}</p><details><summary>Pinned assets and provider checksums</summary><ul>${record.files.map(f=>`<li>${esc(f.name)} · ${esc(f.provider_checksum)}</li>`).join('')}</ul></details><p class="evidence-tag">Downloads include all record assets. Extraction needs additional space. Only ZIP archives are expanded. Published checksums verify transfer integrity; they do not certify annotation correctness.</p><label>Destination directory on the service host<input id="download-root" required placeholder="/absolute/path/to/new-record-directory"></label><button class="button" id="download-start">Download / resume verified originals</button>`;
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
          const result=await api('/api/jobs',{kind:'acquire',record_id:record.record_id,root:$('#download-root').value});
          selectedJob=result.id;message('Download started. Originals, checkpoints and verification logs are retained.');await refresh();
        } finally {button.disabled=!token;}
      }
      if(button.dataset.job)await loadLog(button.dataset.job);
    } catch(err){message(err.message);}
  });
  $('#refresh-jobs').addEventListener('click',refresh);
  $('#job-export').addEventListener('click',()=>{if(evidence)save(evidence,`canopy-job-${selectedJob}.json`);});
  document.addEventListener('canopy-inspect-source',e=>{location.hash='workbench';$('#zenodo-record').value=e.detail.record_id;$('#inspect-form').requestSubmit();message('Review the original assets. Downloading does not prepare task-ready data.');});
  refresh();
  if(localService)setInterval(()=>{if(!document.hidden)refresh();},5000);
})();
