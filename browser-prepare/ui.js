import {sameRequest} from './dataset-draft.js';
import {DraftPanel} from './draft-panel.js';
import {datasetPlots} from './selection.js';
import {RunSession} from './run-session.js?v=2';
import {profileForPipeline} from './profiles.js';

const $ = id => document.getElementById(id);
const selection = window.CanopyTaskSelection;
const catalog = window.CanopyHub.catalog;
const getRequest = () => window.CanopyHub.getTaskRequest();
const selectedSource = () => $('prepare-source').value;
const selectedValues = id => [...$(id).options].filter(o => o.selected).map(o => o.value);
const assessment = () => selection.assess(selectedSource(), getRequest());
const selectedProfile = () => profileForPipeline(assessment().pipeline_ref);
const status = text => { $('prepare-status').textContent = text; };
const storageKey = 'canopy-preparation-job';
const supported = Boolean(window.Worker && window.isSecureContext && navigator.storage?.getDirectory && navigator.locks);
const sourceMembership = new Map();
let draftPanel;
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
  const draft = draftPanel?.render(running);
  const hasDraft = draftPanel?.hasSubsets;
  if (hasDraft && mode !== 'zenodo') $('dataset-draft-status').textContent = 'Saved subsets currently use Zenodo downloads. Choose Zenodo input or clear the dataset selection to use a local file.';
  const locked = running || !initialized || !profile;
  $('prepare-source').disabled = running;
  $('prepare-mode').disabled = locked;
  $('prepare-file-label').hidden = !local;
  $('prepare-file-title').textContent = (mode === 'zip' ? profile?.archiveLabel : profile?.fileLabel) || 'Reviewed source file';
  $('prepare-file').accept = mode === 'zip' ? '.zip' : '.las';
  $('prepare-file').disabled = locked || !local;
  $('prepare-plot-label').hidden = mode === 'las';
  for (const id of ['prepare-collections', 'prepare-partitions']) $(id).disabled = locked || mode === 'las';
  $('prepare-selection-summary').textContent = selectionSummary(mode);
  $('prepare-plot').disabled = locked || !$('prepare-plot').options.length;
  const compatibleDraft = !hasDraft || sameRequest(getRequest(), draftPanel.draft.request);
  $('prepare-add').disabled = locked || mode !== 'zenodo' || assessment().status !== 'ready' ||
    !selectedValues('prepare-plot').length || !compatibleDraft || draftPanel?.blockedStorage;
  $('prepare-run').textContent = hasDraft ? 'Prepare my dataset' : 'Prepare current selection';
  $('prepare-run').disabled = !supported || running || draftPanel?.blockedStorage ||
    (hasDraft ? mode !== 'zenodo' || draft?.status !== 'ready' :
      assessment().status !== 'ready' || locked || (local && !$('prepare-file').files.length) ||
      (mode !== 'las' && !selectedValues('prepare-plot').length));
  $('prepare-cancel').disabled = !session.running;
  $('prepare-clear').disabled = running || !job;
}
function options(id, values) {
  $(id).replaceChildren();
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value; option.textContent = value; option.selected = true;
    $(id).append(option);
  }
}
function selectionSummary(mode) {
  if (mode === 'las') return 'Quick test: one complete local LAS. Dataset selection applies to ZIP and Zenodo inputs.';
  const paths = new Set(selectedValues('prepare-plot'));
  const chosen = plots.filter(p => paths.has(p.path));
  const points = chosen.reduce((n,p) => n + p.points, 0), bytes = chosen.reduce((n,p) => n + p.size_bytes, 0);
  return `${chosen.length} complete plots · ${points.toLocaleString()} points · ${(bytes / 1048576).toFixed(1)} MiB of source LAS. Prepared output and ZIP require additional browser storage. Published partitions and scene identities are preserved; geographic independence is not established.`;
}
function refreshPlots(resetFilters = true) {
  const allowed = assessment().allowed_partitions, profile = selectedProfile();
  if (resetFilters) {
    options('prepare-collections', [...new Set(plots.map(p => p.collection))].sort());
    options('prepare-partitions', [...new Set(plots.map(p => p.published_split))].filter(p => allowed.includes(p)).sort());
  }
  $('prepare-plot').replaceChildren();
  const chosen = datasetPlots(plots, allowed, selectedValues('prepare-collections'), selectedValues('prepare-partitions'));
  for (const plot of chosen) {
    const option = document.createElement('option');
    option.value = plot.path; option.selected = true;
    option.textContent = `${profile.plotLabel(plot.path)} · ${plot.published_split} · ${(plot.size_bytes / 1048576).toFixed(1)} MiB`;
    $('prepare-plot').append(option);
  }
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
    plots = sourceLock.plots.map(p => ({...p, collection: profile.collectionOf(p)})).sort((a, b) => a.size_bytes - b.size_bytes);
    sourceMembership.set(selectedSource(), plots);
    refreshPlots();
    status(result.status === 'ready' ? 'Ready. Review collections and partitions, then prepare the selected dataset.' : result.blockers.join('. '));
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
      status(`Validated for ${plan.use}: ${report.plots} plots, ${report.points.toLocaleString()} points in ${report.chunks} blocks. Optional omissions: ${Object.keys(plan.omitted).join(', ') || 'none'}. Download the ZIP to keep it.`);
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
draftPanel = new DraftPanel({document, storage: () => window.localStorage,
  normalize: selection.normalize, getRequest, setRequest: request => window.CanopyHub.setTaskRequest(request),
  context: () => ({assess: selection.assess, sourcePlots: record => sourceMembership.get(record), hasProfile: id => Boolean(profileForPipeline(id))}),
  sourceName: record => catalog.datasets.find(source => source.id === record)?.name || `Record ${record}`,
  onChange: () => { hideExport(); controls(); }, isRunning: () => busy || session.running,
});
$('prepare-add').onclick = () => {
  if (busy || session.running || $('prepare-add').disabled) return;
  const paths = new Set(selectedValues('prepare-plot'));
  const chosen = plots.filter(plot => paths.has(plot.path));
  draftPanel.add({record_id: selectedSource(), pipeline_ref: assessment().pipeline_ref, paths: [...paths],
    collections: [...new Set(chosen.map(plot => plot.collection))], partitions: [...new Set(chosen.map(plot => plot.published_split))]});
};
$('prepare-file').onchange = controls;
$('prepare-mode').onchange = controls;
$('prepare-collections').onchange = $('prepare-partitions').onchange = () => { refreshPlots(false); controls(); };
$('prepare-plot').onchange = controls;
$('prepare-source').onchange = sourceChanged;
$('prepare-run').onclick = async () => {
  if (busy || session.running) return;
  const saved = draftPanel.hasSubsets ? draftPanel.review() : null;
  if (draftPanel.blockedStorage || (saved && (saved.status !== 'ready' || $('prepare-mode').value !== 'zenodo'))) { status(saved?.error || 'Saved subsets use Zenodo intake. Restore requirements or clear the dataset selection.'); return; }
  const record = saved?.record_id || selectedSource();
  const request = saved?.request || getRequest();
  const result = selection.assess(record, request), profile = profileForPipeline(result.pipeline_ref);
  if (!profile || result.status !== 'ready') { status('This request has no admitted browser preparation.'); return; }
  busy = true; controls(); hideExport(); $('prepare-clear').disabled = true; $('prepare-result').textContent = '';
  try {
    await removeJob(job); remember(null);
    session.start(() => new Worker(new URL('./worker.js?v=source-session-v2', import.meta.url), {type: 'module'}), {
      record_id: record, mode: $('prepare-mode').value, selected_paths: saved?.paths || selectedValues('prepare-plot'),
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
$('prepare-mode').value = 'zenodo';
$('prepare-source').value = catalog.datasets.find(d => selection.assess(d.id, getRequest()).status === 'ready')?.id || catalog.datasets[0].id;
try { draftPanel.restoreRequest(); } catch (error) { draftPanel.loadError = 'Saved requirements could not be restored: ' + error.message; }
sourceChanged().then(() => supported ? recover() : status('Browser storage is unavailable. Use a current browser over HTTPS or localhost.'));
window.addEventListener('pagehide', () => session.stop());
