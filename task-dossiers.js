/* The UI renders versioned decisions; compatibility rules live in task_contracts.py. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={supported:'Supported in this scope',conditional:'Conditions remain',unsupported:'Not supported',unknown:'Evidence missing'};
  let dossier,connected=false,rayConfigured=false;
  function badge(status){return `<span class="badge ${status==='unsupported'?'red':status==='supported'?'neutral':'gold'}">${esc(labels[status])}</span>`;}
  function exportJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function selection(){const objective=$('#task-objective').value;return {objective,row:dossier.assessments.find(r=>r.dataset_id===$('#task-dataset').value&&r.role===(objective==='geographic'?'geographic':'diagnostic'))};}
  function render(){
    if(!dossier)return;
    const {objective,row}=selection(),experiment=dossier.experiments[row.dataset_id],claim=experiment.claims[objective],subset=dossier.prepared_subset;
    $('#task-requirements').innerHTML=`${badge(row.status)}<p>${esc(dossier.task.reference_schema)}</p><div class="scroll-table"><table><thead><tr><th>Requirement</th><th>Decision</th><th>Evidence / condition</th></tr></thead><tbody>${row.requirements.map(r=>`<tr><td>${esc(r.requirement)}</td><td>${badge(r.status)}</td><td>${esc(r.reason)}</td></tr>`).join('')}</tbody></table></div><p class="notice">${esc(row.information_loss)}</p><p class="evidence-tag">Whole-dataset task preparation is not admitted. A source download does not establish compatibility.</p>`;
    $('#task-native-mapping').innerHTML=row.mapping_source?`<p>Exact source-to-task rule for record ${esc(row.mapping_source)}. Native labels remain unchanged; output IDs are scene-local.</p><pre>${esc(dossier.mapping_code)}</pre><small>Code SHA256: <code>${esc(dossier.mapping_code_sha256)}</code></small>`:'<p>No executable mapping for this task has been admitted for this source.</p>';
    $('#task-proof').textContent=JSON.stringify(row.evidence,null,2);
    $('#task-originals').disabled=!connected;
    const available=objective==='diagnostic'&&row.dataset_id===subset.record_id;
    $('#task-subset').innerHTML=`<h4>Audited subset: frozen Wytham reference</h4><p>${esc(subset.scope)}</p><p>${subset.points.toLocaleString('en-US')} points · ${subset.reference_instances} reference tree IDs · <code>${esc(subset.layout)}</code></p><p>${esc(subset.preparation)}</p><ul>${subset.caveats.map(c=>`<li>${esc(c)}</li>`).join('')}</ul><p class="notice">${available?'This diagnostic subset can be copied and verified through the connected service.':'This subset is available only for record 16875688 with the diagnostic objective. It does not satisfy independent-zone evaluation.'}</p>`;
    $('#task-prepare').disabled=!(available&&connected&&rayConfigured);
    $('#task-destination').disabled=!(available&&connected&&rayConfigured);
    $('#task-service-note').textContent=connected?(rayConfigured?'The service reads the existing shared-volume export; no GPU job is launched.':'Configure the existing Ray/PVC reader profile before preparing this subset.'):'Preparing data requires the loopback Workbench at http://127.0.0.1:8765. The public site exposes the same evidence without execution access.';
    $('#task-claim').innerHTML=`${badge(claim.status)}<p>${esc(claim.reason)}</p><dl><dt>Model</dt><dd>${esc(experiment.name)}</dd><dt>Training and evaluation site</dt><dd>${esc(experiment.evidence.training_sites.join(', '))} (known training exposure; list incomplete) / ${esc(experiment.evidence.evaluation_sites.join(', ')||'evaluation sites unresolved')}</dd><dt>Execution evidence</dt><dd>${experiment.validated_execution_for_selection?`${experiment.verified_run.tiles} tiles · ${experiment.verified_run.points.toLocaleString('en-US')} points · ${experiment.verified_run.instances} predicted instances. ${esc(experiment.execution_scope)}`:'No validated plot-instance execution for this selection.'}</dd></dl><p class="evidence-tag">Known checkpoint and reference-run limitations:</p><ul>${experiment.limitations.map(c=>`<li>${esc(c)}</li>`).join('')}</ul><p class="notice">A reproducible execution is distinct from a reproduced paper score and from independent geographic accuracy.</p>`;
    $('#task-experiment-proof').textContent=JSON.stringify({exposure:experiment.evidence,checkpoint_sha256:experiment.checkpoint_sha256,run:experiment.verified_run,snapshot:dossier.snapshot},null,2);
    $('#task-run-recipe').disabled=objective!=='diagnostic'||!experiment.validated_execution_for_selection;
  }
  document.addEventListener('canopy-service-state',e=>{connected=e.detail.connected;rayConfigured=!!e.detail.rayConfigured;render();});
  $('#task-dataset').addEventListener('change',render);$('#task-objective').addEventListener('change',render);
  $('#task-originals').addEventListener('click',()=>{const {row}=selection();document.dispatchEvent(new CustomEvent('canopy-inspect-source',{detail:{record_id:row.dataset_id}}));});
  $('#task-run-recipe').addEventListener('click',()=>{document.dispatchEvent(new CustomEvent('canopy-open-recipe',{detail:{recipe_id:'treelearn-wytham-ray'}}));});
  $('#task-export-answer').addEventListener('click',()=>{const {objective,row}=selection();exportJSON({task:dossier.task,assessment:row,model_claim:dossier.experiments[row.dataset_id].claims[objective],snapshot:dossier.snapshot,mapping_code_sha256:dossier.mapping_code_sha256},`canopy-${row.dataset_id}-${objective}-decision.json`);});
  $('#task-prepare-form').addEventListener('submit',e=>{e.preventDefault();const {objective,row}=selection();if(objective!=='diagnostic'||row.dataset_id!==dossier.prepared_subset.record_id)return;document.dispatchEvent(new CustomEvent('canopy-prepare-task',{detail:{subset_id:dossier.prepared_subset.id,objective,root:$('#task-destination').value}}));});
  (async()=>{try{const local=!window.CANOPY_PUBLIC&&['localhost','127.0.0.1'].includes(location.hostname);let response=await fetch(local?'/api/task-dossiers':'task-dossiers.json');if(!response.ok&&local)response=await fetch('task-dossiers.json');if(!response.ok)throw new Error('Task evidence is unavailable');dossier=await response.json();const rows=dossier.assessments.filter(r=>r.role==='diagnostic');$('#task-dataset').innerHTML=rows.map(r=>`<option value="${esc(r.dataset_id)}">${esc(r.dataset_name)}</option>`).join('');$('#task-dataset').value='16875688';render();}catch(e){$('#task-requirements').textContent=e.message;}})();
})();
