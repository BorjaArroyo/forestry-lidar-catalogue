const $ = id => document.getElementById(id);
let worker, job, resultURL, watchdog;
let initialized = false;
let plots = [];
const getRequest = () => window.CanopyHub?.getTaskRequest() || window.CanopyTaskSelection.normalize();
function refreshPlots() {
  const selected = $('prepare-plot').value;
  const request = getRequest();
  const allowed = window.CanopyTaskSelection.task.requirements.uses[request.use].allowed_partitions;
  $('prepare-plot').replaceChildren();
  for (const plot of plots.filter(p => allowed.includes(p.published_split))) {
    const option = document.createElement('option');
    option.value = plot.path;
    option.textContent = `${plot.path.split('FORinstance_dataset/')[1]} · ${plot.published_split} · ${(plot.size_bytes / 1048576).toFixed(1)} MiB`;
    $('prepare-plot').append(option);
  }
  if ([...$('prepare-plot').options].some(o => o.value === selected)) $('prepare-plot').value = selected;
}
function requestChanged() {
  if (worker) { status('The active run keeps its submitted request. New requirements apply to the next run.'); return; }
  refreshPlots();
  const result = window.CanopyTaskSelection.assess('8287792', getRequest());
  $('prepare-download').hidden = true;
  status(result.status === 'ready' ? 'Request updated. Prepare again to produce a ZIP bound to these requirements.' : result.blockers.join('. '));
  controls(false);
}
document.addEventListener('canopy-task-request', requestChanged);
document.addEventListener('canopy-prepare-task', ({detail}) => {
  if (detail.record_id !== '8287792' || worker) return;
  $('prepare-mode').value = 'zenodo'; requestChanged();
});
const storageKey = 'canopy-preparation-job';
function remember(id) {
  job = id;
  if (id) sessionStorage.setItem(storageKey, id); else sessionStorage.removeItem(storageKey);
}
const supported = Boolean(window.Worker && window.isSecureContext && navigator.storage?.getDirectory && navigator.locks);
const status = text => { $('prepare-status').textContent = text; };

function controls(running) {
  document.dispatchEvent(new CustomEvent('canopy-preparation-state',{detail:{running:running && initialized}}));
  const mode = $('prepare-mode').value;
  const local = mode !== 'zenodo';
  const locked = running || !initialized;
  $('prepare-mode').disabled = locked;
  $('prepare-file-label').hidden = !local;
  $('prepare-file-title').textContent = mode === 'zip' ? 'Downloaded FOR-instance ZIP' : 'Complete FOR-instance LAS';
  $('prepare-file').accept = mode === 'zip' ? '.zip' : '.las';
  $('prepare-file').disabled = locked || !local;
  $('prepare-plot-label').hidden = mode === 'las';
  $('prepare-plot').disabled = locked || !$('prepare-plot').options.length;
  const ready = window.CanopyTaskSelection.assess('8287792', getRequest()).status === 'ready';
  $('prepare-run').disabled = !ready || !supported || locked || (local && !$('prepare-file').files.length) || (mode !== 'las' && !$('prepare-plot').value);
  $('prepare-cancel').disabled = !running || !initialized;
}

async function removeJob(id) {
  if (!id) return;
  const origin = await navigator.storage.getDirectory();
  const jobs = await origin.getDirectoryHandle('canopy-preparation');
  await navigator.locks.request('canopy-preparation:' + id, {ifAvailable: true}, async lock => {
    if (!lock) throw Error('This output is in use by another page');
    await jobs.removeEntry(id, {recursive: true});
  });
}

$('prepare-file').onchange = () => controls(false);
$('prepare-mode').onchange = () => controls(false);
$('prepare-run').onclick = async () => {
  const request = getRequest();
  if (window.CanopyTaskSelection.assess('8287792', request).status !== 'ready') { status('This request has no admitted FOR-instance preparation.'); return; }
  controls(true);
  $('prepare-download').hidden = true;
  $('prepare-clear').disabled = true;
  $('prepare-result').textContent = '';
  if (resultURL) URL.revokeObjectURL(resultURL);
  try {
    // Discard this panel's previous export only when starting its replacement.
    worker?.terminate();
    await removeJob(job); remember(null);
    worker = new Worker(new URL('./worker.js?v=task-request-v1', import.meta.url), {type: 'module'});
    worker.onmessage = ({data}) => {
      clearTimeout(watchdog);
      if (!['result', 'error'].includes(data.type)) watchdog = setTimeout(() => {
        status('Stopped after 180 seconds without progress. Temporary output can be cleared.');
        worker?.terminate(); worker = null; $('prepare-clear').disabled = false; controls(false);
      }, 180000);
      if (data.type === 'job') remember(data.id);
      else if (data.type === 'phase') status(data.text);
      else if (data.type === 'result') {
        resultURL = URL.createObjectURL(data.file);
        $('prepare-download').href = resultURL;
        $('prepare-download').download = 'for-instance-selected-plot.zip';
        $('prepare-download').hidden = false;
        $('prepare-clear').disabled = false;
        const r = data.evidence.report;
        status(`Validated for ${data.evidence.task_plan.use}: ${r.points.toLocaleString()} points in ${r.chunks} blocks. Optional omissions: ${Object.keys(data.evidence.task_plan.omitted).join(', ') || 'none'}. Download the ZIP to keep it.`);
        $('prepare-result').textContent = JSON.stringify(data.evidence, null, 2);
        worker.terminate(); worker = null; controls(false);
      } else {
        status('Preparation failed: ' + (data.error.match(/(?:[A-Za-z]*Error|[A-Za-z]*Exception):[^\n]*/g)?.join(' ') || data.error.trim().split('\n').at(-1)));
        $('prepare-result').textContent = data.error;
        worker.terminate(); worker = null; remember(null); controls(false);
      }
    };
    worker.onerror = async event => {
      worker?.terminate(); worker = null;
      status('Worker failed: ' + event.message);
      try { await removeJob(job); remember(null); } catch { $('prepare-clear').disabled = false; }
      controls(false);
    };
    status('Checking source membership and available browser storage…');
    worker.postMessage({mode: $('prepare-mode').value, selected_path: $('prepare-plot').value, file: $('prepare-file').files[0], task_request: request});
  } catch (error) { status(error.message); controls(false); }
};
$('prepare-cancel').onclick = async () => {
  clearTimeout(watchdog); worker?.terminate(); worker = null;
  try { await removeJob(job); remember(null); status('Cancelled; temporary output removed.'); }
  catch { status('Cancelled. Use Clear temporary output to release remaining browser storage.'); $('prepare-clear').disabled = false; }
  controls(false);
};
$('prepare-clear').onclick = async () => {
  try {
    await removeJob(job); remember(null);
    if (resultURL) URL.revokeObjectURL(resultURL); resultURL = null;
    $('prepare-download').hidden = true; $('prepare-clear').disabled = true;
    status('Temporary output cleared.');
  } catch (error) { status('Could not clear temporary output: ' + error.message); }
};
async function recover() {
  controls(true);
  try {
    job = sessionStorage.getItem(storageKey);
    if (!job) return;
    if (!/^[0-9a-f-]{36}$/.test(job)) throw Error('Invalid saved run identity');
    await navigator.locks.request('canopy-preparation:' + job, {ifAvailable: true}, async lock => {
      if (!lock) throw Error('Saved output is still in use by another page');
      const origin = await navigator.storage.getDirectory();
      const jobs = await origin.getDirectoryHandle('canopy-preparation');
      const root = await jobs.getDirectoryHandle(job);
      $('prepare-clear').disabled = false;
      try {
        const complete = JSON.parse(await (await (await root.getFileHandle('complete.json')).getFile()).text());
        const file = await (await root.getFileHandle('prepared.zip')).getFile();
        if (file.size !== complete.size_bytes) throw Error('Saved ZIP size changed');
        resultURL = URL.createObjectURL(file);
        $('prepare-download').href = resultURL;
        $('prepare-download').download = 'for-instance-selected-plot.zip';
        $('prepare-download').hidden = false;
        $('prepare-result').textContent = JSON.stringify(complete.evidence, null, 2);
        status(`Recovered the previous ZIP for ${complete.evidence.task_plan?.use || 'historical preparation'}. Its saved plan describes that run. Prepare again to apply the current request.`);
      } catch { status('Previous run was interrupted. Clear it or select the original LAS to restart this plot.'); }
    });
  } catch (error) {
    if (error.name === 'NotFoundError') remember(null);
    else status(error.message);
  } finally { controls(false); }
}
async function loadPlots() {
  try {
    const response = await fetch(new URL('../scripts/for_instance/source-lock.json', import.meta.url));
    if (!response.ok) throw Error('Reviewed plot list unavailable');
    const source = await response.json();
    plots = [...source.plots].sort((a, b) => a.size_bytes - b.size_bytes);
    refreshPlots();
  } catch (error) { status(error.message); }
}
controls(true);
if (supported) loadPlots().then(recover).finally(() => { initialized = true; controls(false); }); else controls(false);
if (!supported) status('Browser storage is unavailable. Use a current browser over HTTPS or localhost.');
window.addEventListener('pagehide', () => worker?.terminate());
