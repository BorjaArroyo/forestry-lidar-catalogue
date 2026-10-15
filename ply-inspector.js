/* Browser-only file inspection. Selected payloads never leave this device. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:6});
  const panel=$('#ply-panel');let worker=null,report=null,directory=null,selected=null,started=0,saving=false;
  function status(text,state){$('#ply-status').textContent=text;panel.dataset.state=state;}
  function controls() {
    $('#ply-start').disabled=!selected||!!worker||saving||typeof Worker!=='function';
    $('#ply-cancel').disabled=!worker;$('#ply-file').disabled=!!worker||saving;
    $('#ply-download').disabled=!report||!!worker||saving;
    $('#ply-save').disabled=!report||!directory||!!worker||saving;
    $('#ply-folder').disabled=typeof window.showDirectoryPicker!=='function'||saving;
  }
  function clearReport(){report=null;$('#ply-save-status').textContent='';$('#ply-results').hidden=true;$('#ply-results').replaceChildren();controls();}
  function stop(){if(worker){worker.terminate();worker=null;}controls();}
  function fail(message){stop();clearReport();status(`Inspection failed: ${message}`,'failed');$('#ply-progress').hidden=true;}
  function render(r) {
    const fields=r.ply.elements.find(e=>e.name==='vertex').properties;
    $('#ply-results').innerHTML=`<div class="inspection-metrics"><div><strong>${num(r.points.scanned)}</strong><span>vertices scanned</span></div><div><strong>${num(r.points.nonfinite_xyz)}</strong><span>non-finite XYZ</span></div><div><strong>${num(r.performance.elapsed_ms)} ms</strong><span>worker elapsed time</span></div><div><strong>${num(Number((r.performance.largest_input_buffer_bytes/1024).toFixed(2)))} KiB</strong><span>largest input buffer · not total RAM</span></div></div><h4>Coordinate bounds</h4>${r.bounds?`<div class="scroll-table"><table><thead><tr><th>Axis</th><th>Minimum</th><th>Maximum</th><th>Extent</th></tr></thead><tbody>${['X','Y','Z'].map((axis,i)=>`<tr><td>${axis}</td><td>${num(r.bounds.min[i])}</td><td>${num(r.bounds.max[i])}</td><td>${num(r.bounds.extent[i])}</td></tr>`).join('')}</tbody></table></div>`:'<p>No finite vertices are available for coordinate bounds.</p>'}<p class="evidence-tag">Units and CRS are not inferred. Bounds use finite XYZ vertices only.</p><h4>Vertex attributes</h4><div class="field-pills">${fields.map(p=>`<code>${esc(p.name)} · ${esc(p.kind==='list'?`list ${p.count_type} ${p.type}`:p.type)}</code>`).join('')}</div><p class="evidence-tag">${esc(r.ply.format)} · ${r.ply.elements.length} element types · every declared record scanned</p>${r.validation.warnings.map(w=>`<p class="notice">${esc(w)}</p>`).join('')}<details><summary>Inspect the complete JSON report</summary><pre id="ply-report-json"></pre></details>`;
    $('#ply-report-json').textContent=JSON.stringify(r,null,2);$('#ply-results').hidden=false;
  }
  function filename(){return `canopy-ply-inspection-${crypto.randomUUID()}.json`;}
  function reportText(){return JSON.stringify(report,null,2)+'\n';}
  $('#ply-file').addEventListener('change',()=>{
    selected=$('#ply-file').files[0]||null;clearReport();$('#ply-progress').hidden=true;
    $('#ply-file-info').textContent=selected?`${selected.name} · ${num(Number((selected.size/1024**2).toFixed(2)))} MiB`:'No file selected';
    status(selected?'Ready to inspect. The original file is read-only.':'Choose a PLY file to begin.','ready');controls();
  });
  $('#ply-form').addEventListener('submit',event=>{
    event.preventDefault();if(!selected||worker)return;
    clearReport();
    if(selected.size>512*1024**2){fail('This prototype accepts files up to 512 MiB.');return;}
    try {
      worker=new Worker(new URL('ply-inspector-worker.js',document.baseURI));started=performance.now();
      status('Inspecting the file on this device…','running');$('#ply-progress').hidden=false;$('#ply-progress').value=0;controls();
      const active=worker;
      worker.onmessage=event=>{
        if(worker!==active)return;
        const message=event.data;
        if(message.type==='progress') {
          const p=message.progress;$('#ply-progress').value=p.total_bytes?Math.min(100,100*p.bytes_processed/p.total_bytes):0;
          status(`Scanning ${p.phase} · ${num(p.points_scanned)} vertices · ${num(p.bytes_processed/1024**2)} / ${num(p.total_bytes/1024**2)} MiB`,'running');
        } else if(message.type==='complete') {
          report=message.report;report.performance.total_elapsed_ms=Math.round((performance.now()-started)*10)/10;
          stop();render(report);$('#ply-progress').value=100;
          status(`Inspection complete · ${num(report.points.scanned)} vertices. Report ready to save.`,'completed');controls();
        } else if(message.type==='error')fail(message.message);
      };
      worker.onerror=event=>{event.preventDefault();if(worker!==active)return;fail(event.message||'The browser worker could not start. Use HTTPS or the local service.');};
      worker.postMessage({file:selected});
    } catch(error){fail(error.message);}
  });
  $('#ply-cancel').addEventListener('click',()=>{stop();clearReport();$('#ply-progress').hidden=true;status('Inspection cancelled. No report was saved and no source file was changed.','cancelled');});
  $('#ply-folder').addEventListener('click',async()=>{
    try {directory=await window.showDirectoryPicker({mode:'readwrite',id:'canopy-ply-reports'});$('#ply-folder-info').textContent=`Report destination: ${directory.name}`;controls();}
    catch(error){if(error.name!=='AbortError')$('#ply-folder-info').textContent=`Folder access unavailable: ${error.message}. Use Download JSON instead.`;}
  });
  $('#ply-save').addEventListener('click',async()=>{
    if(!report||!directory||saving)return;saving=true;controls();
    try {
      const name=await window.CanopyPlyStorage.saveReport(directory,report,filename());
      $('#ply-save-status').textContent=`Report saved to ${directory.name}/${name}`;
    } catch(error){$('#ply-save-status').textContent=`Report could not be saved: ${error.message}. Download JSON is also available.`;}
    finally {saving=false;controls();}
  });
  $('#ply-download').addEventListener('click',()=>{
    if(!report)return;const blob=new Blob([reportText()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename();document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('#ply-save-status').textContent='JSON report handed to the browser download manager.';
  });
  if(typeof window.showDirectoryPicker!=='function')$('#ply-folder-info').textContent='This browser does not support choosing an output folder. Use Download JSON after inspection.';
  if(typeof Worker!=='function')status('This browser does not support the worker required for inspection.','unsupported');
  controls();
})();
