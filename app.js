/* A dependency-free, offline viewer. This application never modifies LiDAR files. */
(() => {
  'use strict';
  const data = window.LIDAR_CATALOG;
  if (!data) { document.querySelector('main').textContent = 'Catalog unavailable. Rebuild catalog.js using the documented command.'; return; }
  const tasks = data.tasks.filter(t => t.id === 'instances');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = n => Number(n).toLocaleString('en-US');
  const compact = n => n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : number(n);
  const byId = Object.fromEntries(data.datasets.map(d => [d.id, d]));
  const state = {view:'datasets', search:'', platform:'all', unit:'all', reference:'all', preparation:'all', compare:new Set()};
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
  const sourceServiceNote = () => (serviceConnected?'The connected service can inspect the record before you start its download.':'Connect the local service to download originals into a chosen directory. The provider record remains directly accessible.')+' Acquisition fetches all record assets; selecting a task-specific subset is TBD.';
  const matches = d => {
    const text = [d.name,d.title,d.labels,d.scanner,d.domain,d.geography,d.license,...d.source_fields].join(' ').toLowerCase();
    return (!state.search || text.includes(state.search.toLowerCase())) &&
      (state.platform === 'all' || d.modalities.includes(state.platform)) &&
      (state.unit === 'all' || discovery(d).unit === state.unit) &&
      (state.reference === 'all' || discovery(d).instance_reference.status === state.reference) &&
      (state.preparation === 'all' || discovery(d).preparation.status === state.preparation);
  };
  const visibleDatasets = () => data.datasets.filter(matches);
  function sourceReview(d) {
    const r=d.review;if(!r)return '<p>Source review is pending.</p>';
    return `<h4>Observation unit</h4><p>${esc(r.observation_unit)}</p><h4>Reported by the source</h4>${r.source_facts.map(f=>`<p>${esc(f.text)} ${link(f.label,f.url)}</p>`).join('')}<h4>Published protocol</h4><p>${esc(r.published_protocol)}</p><h4>Local study context</h4><p>${esc(d.study_context)}</p><h4>Saved local observations</h4><ul>${r.local_observations.map(f=>`<li>${esc(f)}</li>`).join('')}</ul><p class="evidence-tag">${r.observations_current?'Observation metadata matches the reviewed snapshot.':'Metadata changed; these historical observations need rechecking.'}</p><h4>Unresolved before scientific use</h4><ul>${r.open_questions.map(f=>`<li>${esc(f)}</li>`).join('')}</ul><p class="evidence-tag">Reviewed ${esc(r.reviewed_at)} · ${esc(r.scope)}</p>`;
  }
  function nativeMeasurements(d) {
    return (d.native_measurement_contracts || []).map(contract => {
      const channels=Object.fromEntries(contract.channels.map(c=>[c.id,c]));
      const rows=contract.fields.filter(f=>f.role==='measurement').map(field=>{
        const m=field.measurement, channel=channels[m.channel_ref];
        const absent=m.missingness.status==='documented_sentinel'?m.missingness.values.join(', '):'Not documented';
        const association=m.association.method==='nearest_neighbor'?`NN ≤ ${m.association.max_distance_m} m (header reported)`:'Not documented';
        return `<tr><td><code>${esc(field.name)}</code></td><td>${esc(field.dtypes.join(' / '))}</td><td>${esc(channel.scanner_id)} · ${esc(channel.wavelength_nm)} nm</td><td>${esc(absent)}</td><td>${esc(m.unit.symbol??'Unknown')}</td><td>${esc(association)}</td></tr>`;
      }).join('');
      const display=contract.fields.filter(f=>f.role==='display').map(f=>f.name).join(', ');
      return `<h4>Multispectral measurements</h4><p>${esc(contract.observation_unit)}</p><p>${contract.channels.map(c=>`${esc(c.scanner_id)}: ${esc(c.sensor_model)} (${esc(c.wavelength_nm)} nm)`).join(' · ')}</p><div class="scroll-table"><table><caption>Native channel fields; absence is interpreted per field.</caption><thead><tr><th>Field</th><th>Stored type</th><th>Scanner · wavelength</th><th>Missing sentinel</th><th>Unit</th><th>Association</th></tr></thead><tbody>${rows}</tbody></table></div><p>Calibration: ${contract.channels.map(c=>`${esc(c.scanner_id)} ${esc(c.calibration.status.replaceAll('_',' '))}`).join(' · ')}. Association accuracy has not been validated.</p>${display?`<p class="notice">${esc(display)} are display fields. Source descriptions disagree about intensity versus reflectance; quantity, scaling and absence rules remain unresolved.</p>`:''}<p>Sample availability is not whole-source coverage. Instance-reference masks are separate from measurement-validity masks. This metadata does not admit a preparation pipeline.</p>`;
    }).join('');
  }
  function safeUrl(url) { try { const parsed = new URL(url); return /^https?:$/.test(parsed.protocol) ? parsed.href : '#'; } catch { return '#'; } }
  function badge(text, type = 'neutral') { return `<span class="badge ${esc(type)}">${esc(text)}</span>`; }
  function link(label, url) { return `<a class="source-link" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`; }
  function toast(text) { $('#toast').textContent=text; $('#toast').hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(() => $('#toast').hidden=true, 3200); }

  function renderDatasets() {
    const rows=visibleDatasets();$('#catalog-count').textContent=`${rows.length} of ${data.datasets.length} source records`;
    $('#dataset-grid').innerHTML=rows.map(d=>{
      const s=discovery(d);
      return `<article class="dataset-card source-card" data-source="${d.id}"><div class="card-top">${badge(d.modalities.join(' · '))}<span class="source-unit">${esc(s.unit_label)}</span></div><h3>${esc(d.name)}</h3><p class="source-location">${esc(d.geography)}</p>${readinessHtml(d)}<p class="source-coverage">${esc(s.coverage)}</p><div class="source-caveat"><strong>Before choosing</strong><p>${esc(s.limitation)}</p></div><p class="source-record-size">${recordSize(d)} · ${d.assets} ${d.assets===1?'asset':'assets'} in the pinned record<br><small>Whole record; a task-specific download subset is TBD.</small></p><div class="card-bottom"><label class="card-compare"><input type="checkbox" data-compare-check="${d.id}" ${state.compare.has(d.id)?'checked':''}>Compare</label><button data-detail="${d.id}">View source & preparation ↗</button></div></article>`;
    }).join('')||'<div class="empty">No source matches all these conditions. Try clearing a filter. This catalog does not cover every public source.</div>';
  }
  function detail(id) {
    const d=byId[id];if(!d)return;
    const s=discovery(d);
    $('#detail-dialog-title').textContent=d.name;
    $('#dialog-detail').innerHTML=`<div class="source-detail"><div class="badges">${badge(d.modalities.join(' · '))}${badge(s.unit_label)}${badge(`Pinned record ${d.id}`)}</div><p class="source-location">${esc(d.geography)}</p>${readinessHtml(d)}<h3>What can I use?</h3><p>${esc(s.coverage)}</p><p class="notice">${esc(s.limitation)}</p><div class="source-actions">${link('Open provider record',d.url)}<button class="button" data-source-download="${d.id}" ${serviceConnected?'':'disabled'}>Review original downloads</button><button class="button" data-compare="${d.id}">${state.compare.has(id)?'✓ Remove from comparison':'+ Add to comparison'}</button></div><p class="source-service-note">${esc(sourceServiceNote())}</p><details class="source-section" open><summary>Preparation for this task · ${s.preparation.status==='ready'?'validated archive scope':s.preparation.status==='blocked'?'review required':'TBD'}</summary><p>${esc(s.preparation.detail)}</p><p>Whole pinned record: ${recordSize(d)} in ${d.assets} assets. This includes supporting files where present; extracted data needs additional space.</p></details><details class="source-section"><summary>Source evidence and unresolved questions</summary>${sourceReview(d)}</details><details class="source-section"><summary>Native fields, coordinates and declared terms</summary><h4>Source annotations</h4><p>${esc(d.labels)}</p><h4>Coordinates</h4><p>${esc(d.coordinate_policy)}</p><p>${(d.coordinate_references||[]).map(c=>`${esc(c.value)}: ${c.files} files`).join(' · ')||'Conversion deferred; no normalized coordinate audit.'}</p><h4>Native field names</h4><p>Names from saved schemas; types, ranges and units are not uniformly audited.</p><div class="field-pills">${d.source_fields.map(f=>`<code>${esc(f)}</code>`).join('')||'Conversion deferred; inspect source definitions.'}</div>${nativeMeasurements(d)}<h4>Record-declared terms</h4><p>${esc(d.license.toUpperCase())}. Intended-use and component terms still require review.</p><h4>Historical local representation</h4><p>${number(d.cloud_count)} normalized files · ${number(d.chunks)} chunks · ${compact(d.points)} stored points. File counts mix plots and derived trees where applicable; they do not count independent sites.</p><h4>Provider metadata SHA256</h4><code class="raw-path">${esc(d.source_metadata_sha256)}</code></details></div>`;
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

  function render() {
    renderDatasets();
    $('#compare-count').textContent=state.compare.size;
    $('#compare-open').disabled=state.compare.size<2;
    $('#compare-open').hidden=state.view!=='datasets';
    $('.toolbar').hidden=state.view!=='datasets';
    const downloading=state.view==='workbench';
    $('#breadcrumb-view').textContent=downloading?'Download & prepare':'Sources';
    $('.page-heading h1').textContent=downloading?'Download and prepare instance data.':'Find a source for tree segmentation.';
    $('.page-heading p').textContent=downloading?'Retrieve pinned originals or prepare the reviewed FOR-instance archive in a chosen directory.':'Compare reference coverage and limitations. FOR-instance archive preparation is validated; other adapters remain work in progress.';
    $$('.nav-item').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false');});
    $$('.view').forEach(el=>el.hidden=el.id!==`view-${state.view}`);
  }
  function selectView(view) {state.view=view;location.hash=view;render();window.scrollTo(0,0);}
  document.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.dataset.sourceDownload&&serviceConnected){$('#detail-dialog').close();document.dispatchEvent(new CustomEvent('canopy-inspect-source',{detail:{record_id:target.dataset.sourceDownload}}));}
    if(target.dataset.view)selectView(target.dataset.view);
    if(target.dataset.detail)detail(target.dataset.detail);
    if(target.dataset.compare)toggleCompare(target.dataset.compare);
    if(target.classList.contains('close-dialog'))target.closest('dialog').close();
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)&&!$('dialog[open]')){e.preventDefault();selectView('datasets');$('#search').focus();}
  });
  $('#search').addEventListener('input',e=>{state.search=e.target.value;render();});
  ['platform','unit','reference','preparation'].forEach(key=>$('#'+key).addEventListener('change',e=>{state[key]=e.target.value;render();}));
  document.addEventListener('change',e=>{if(e.target.dataset.compareCheck)toggleCompare(e.target.dataset.compareCheck);});
  $('#reset').addEventListener('click',()=>{state.search='';$('#search').value='';['platform','unit','reference','preparation'].forEach(key=>{state[key]='all';$('#'+key).value='all';});render();});
  $('#compare-open').addEventListener('click',showCompare);
  $('#export').addEventListener('click',()=>download(data,'canopy-catalog.json'));
  window.addEventListener('hashchange',()=>{state.view=location.hash==='#workbench'?'workbench':'datasets';render();});
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  document.addEventListener('canopy-service-state',e=>{serviceConnected=e.detail.connected;$$('[data-source-download]').forEach(b=>b.disabled=!serviceConnected);$$('.source-service-note').forEach(p=>p.textContent=sourceServiceNote());});
  state.view=location.hash==='#workbench'?'workbench':'datasets';
  $('#dataset-count').textContent=data.datasets.length;
  $('#snapshot-date').textContent=`Snapshot · ${new Date(data.generated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;
  render();
  window.CanopyHub={catalog:data,activeTasks:tasks,getState:()=>({...state,compare:[...state.compare]})};
})();
