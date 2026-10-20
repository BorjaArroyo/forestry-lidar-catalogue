import {RunSession} from './run-session.js?v=2';
import {profileForPipeline} from './profiles.js';

const $ = id => document.getElementById(id);
const selection = window.CanopyTaskSelection;
const catalog = window.CanopyHub.catalog;
const getRequest = () => window.CanopyHub.getTaskRequest();
const selectedSource = () => $('prepare-source').value;
const assessment = () => selection.assess(selectedSource(), getRequest());
const selectedProfile = () => profileForPipeline(assessment().pipeline_ref);
const status = text => { $('prepare-status').textContent = text; };
const storageKey = 'canopy-preparation-job';
const supported = Boolean(window.Worker && window.isSecureContext && navigator.storage?.getDirectory && navigator.locks);
let initialized = false, busy = false, plots = [], job = null, resultURL = null, sourceRevision = 0;

function remember(id) {
  job = id;
  if (id) sessionStorage.setItem(storageKey, id); else sessionStorage.removeItem(storageKey);
}
function hideExport() {
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = null;
  $('prepare-download').hidden = true;
}
function controls() {
  const running = busy || session.running;
  document.dispatchEvent(new CustomEvent('canopy-preparation-state', {detail: {running}}));
  const profile = selectedProfile();
  const mode = $('prepare-mode').value, local = mode !== 'zenodo';
  const locked = running || !initialized || !profile;
  $('prepare-source').disabled = running;
  $('prepare-mode').disabled = locked;
  $('prepare-file-label').hidden = !local;
  $('prepare-file-title').textContent = (mode === 'zip' ? profile?.archiveLabel : profile?.fileLabel) || 'Reviewed source file';
  $('prepare-file').accept = mode === 'zip' ? '.zip' : '.las';
  $('prepare-file').disabled = locked || !local;
  $('prepare-plot-label').hidden = mode === 'las';
  $('prepare-plot').disabled = locked || !$('prepare-plot').options.length;
  $('prepare-run').disabled = assessment().status !== 'ready' || !supported || locked ||
    (local && !$('prepare-file').files.length) || (mode !== 'las' && !$('prepare-plot').value);
  $('prepare-cancel').disabled = !session.running;
  $('prepare-clear').disabled = running || !job;
}
function refreshPlots() {
  const selected = $('prepare-plot').value;
  const allowed = assessment().allowed_partitions;
  const profile = selectedProfile();
  $('prepare-plot').replaceChildren();
  for (const plot of plots.filter(p => allowed.includes(p.published_split))) {
    const option = document.createElement('option');
    option.value = plot.path;
    option.textContent = `${profile.plotLabel(plot.path)} · ${plot.published_split} · ${(plot.size_bytes / 1048576).toFixed(1)} MiB`;
    $('prepare-plot').append(option);
  }
  if ([...$('prepare-plot').options].some(o => o.value === selected)) $('prepare-plot').value = selected;
}
async function sourceChanged() {
  const revision = ++sourceRevision;
  plots = []; initialized = false; refreshPlots(); controls(); hideExport();
  const result = assessment(), profile = selectedProfile();
  const source = catalog.datasets.find(d => d.id === selectedSource());
  const detail = source.discovery.preparation;
  $('prepare-source-status').textContent = `${source.name}: ${detail.status}. ${detail.detail || detail.reason || ''}`;
  document.dispatchEvent(new CustomEvent('canopy-source-selected', {detail: {record_id: selectedSource()}}));
  if (!profile) {
    status(result.blockers.join('. ') || 'The admitted pipeline has no browser implementation.');
    initialized = true; controls(); return;
  }
  status('Loading reviewed source membership…');
  try {
    const response = await fetch(new URL('../' + profile.sourceLock, import.meta.url));
    if (!response.ok) throw Error('Reviewed plot list unavailable');
    const sourceLock = await response.json();
    if (revision !== sourceRevision) return;
    plots = [...sourceLock.plots].sort((a, b) => a.size_bytes - b.size_bytes);
    refreshPlots();
    status(result.status === 'ready' ? 'Ready. Select an input and prepare data for this request.' : result.blockers.join('. '));
  } catch (error) { if (revision === sourceRevision) status(error.message); }
  finally { if (revision === sourceRevision) { initialized = true; controls(); } }
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
function showExport(file, evidence, name) {
  hideExport();
  resultURL = URL.createObjectURL(file);
  $('prepare-download').href = resultURL;
  $('prepare-download').download = name || 'prepared-task-package.zip';
  $('prepare-download').hidden = false;
  $('prepare-clear').disabled = false;
  $('prepare-result').textContent = JSON.stringify(evidence, null, 2);
}
const session = new RunSession({
  event(data) {
    if (data.type === 'job') remember(data.id);
    else if (data.type === 'phase') status(data.text);
    else if (data.type === 'result') {
      showExport(data.file, data.evidence, selectedProfile()?.downloadName);
      const {report, task_plan: plan} = data.evidence;
      status(`Validated for ${plan.use}: ${report.points.toLocaleString()} points in ${report.chunks} blocks. Optional omissions: ${Object.keys(plan.omitted).join(', ') || 'none'}. Download the ZIP to keep it.`);
    } else if (data.type === 'error') {
      status('Preparation failed: ' + data.error.trim().split('\n').at(-1));
      $('prepare-result').textContent = data.error;
      // The worker attempts cleanup; retain the identity if cleanup was interrupted.
      $('prepare-clear').disabled = !job;
    }
    controls();
  },
  failure(text) { status(text); $('prepare-clear').disabled = !job; controls(); },
});
$('prepare-file').onchange = controls;
$('prepare-mode').onchange = controls;
$('prepare-source').onchange = sourceChanged;
$('prepare-run').onclick = async () => {
  if (busy || session.running) return;
  const profile = selectedProfile(), request = getRequest(), record = selectedSource();
  if (!profile || assessment().status !== 'ready') { status('This request has no admitted browser preparation.'); return; }
  busy = true; controls(); hideExport(); $('prepare-clear').disabled = true; $('prepare-result').textContent = '';
  try {
    await removeJob(job); remember(null);
    session.start(() => new Worker(new URL('./worker.js?v=source-session-v2', import.meta.url), {type: 'module'}), {
      record_id: record, mode: $('prepare-mode').value, selected_path: $('prepare-plot').value,
      file: $('prepare-file').files[0], task_request: request,
    });
    status('Checking source membership and available browser storage…');
  } catch (error) { console.error(error); status(error.message); $('prepare-clear').disabled = !job; }
  finally { busy = false; controls(); }
};
$('prepare-cancel').onclick = async () => {
  session.stop(); busy = true; controls();
  try { await removeJob(job); remember(null); status('Cancelled; temporary output removed.'); }
  catch { status('Cancelled. Use Clear temporary output to release remaining browser storage.'); $('prepare-clear').disabled = false; }
  finally { busy = false; controls(); }
};
$('prepare-clear').onclick = async () => {
  busy = true; controls();
  try { await removeJob(job); remember(null); hideExport(); $('prepare-clear').disabled = true; status('Temporary output cleared.'); }
  catch (error) { status('Could not clear temporary output: ' + error.message); }
  finally { busy = false; controls(); }
};
async function recover() {
  busy = true; controls();
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
        showExport(file, complete.evidence);
        status(`Recovered the previous ZIP for ${complete.evidence.task_plan?.source_ref || 'historical preparation'} / ${complete.evidence.task_plan?.use || 'unspecified use'}. Its saved plan describes that run. Prepare again to apply the current request.`);
      } catch { status('Previous run was interrupted. Clear it or select the original input to restart.'); }
    });
  } catch (error) { if (error.name === 'NotFoundError') remember(null); else status(error.message); }
  finally { busy = false; controls(); }
}
document.addEventListener('canopy-task-request', () => {
  if (busy || session.running) return;
  refreshPlots(); hideExport();
  const result = assessment();
  status(result.status === 'ready' ? 'Request updated. Prepare again to bind the ZIP to these requirements.' : result.blockers.join('. '));
  controls();
});
document.addEventListener('canopy-prepare-task', ({detail}) => {
  if (busy || session.running || !catalog.datasets.some(d => d.id === String(detail.record_id))) return;
  $('prepare-source').value = String(detail.record_id); $('prepare-mode').value = 'zenodo'; sourceChanged();
});
for (const source of catalog.datasets) {
  const option = document.createElement('option');
  option.value = source.id; option.textContent = source.name; $('prepare-source').append(option);
}
$('prepare-source').value = catalog.datasets.find(d => selection.assess(d.id, getRequest()).status === 'ready')?.id || catalog.datasets[0].id;
sourceChanged().then(() => supported ? recover() : status('Browser storage is unavailable. Use a current browser over HTTPS or localhost.'));
window.addEventListener('pagehide', () => session.stop());
