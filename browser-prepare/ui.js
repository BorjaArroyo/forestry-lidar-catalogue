import { updateControls } from './controls.js';
import { decodeImportedPlan, renderPlan, planSources } from './plan-panel.js';
import { inspectRuns as defaultInspectRuns, openRun as defaultOpenRun } from './run-store.js';
import { createSavedRunsPanel } from './saved-runs-panel.js';
import { DraftPanel } from './draft-panel.js';
import { renderPlotOptions } from './source-selection.js';
import { RunSession as DefaultRunSession } from './run-session.js?v=2';
import { profileForPipeline } from './profiles.js';
import { createTaskSelection } from '../web/catalog/task-selection.js';

export function mountPreparation({
  catalog = globalThis.window?.LIDAR_CATALOG,
  document = globalThis.document,
  window = globalThis.window,
  navigator = globalThis.navigator,
  sessionStorage = globalThis.sessionStorage,
  fetch = globalThis.fetch,
  Worker = globalThis.Worker,
  CustomEvent = globalThis.CustomEvent,
  RunSession = DefaultRunSession,
  inspectRuns = defaultInspectRuns,
  openRun = defaultOpenRun,
  selection = createTaskSelection(catalog),
  initialRequest = null,
} = {}) {
  const $ = (id) => document.getElementById(id);
  let currentRequest = selection.normalize(initialRequest?.use, initialRequest?.variables);
  const getRequest = () => currentRequest;
  const setRequest = (request) => {
    currentRequest = selection.normalize(request.use, request.variables);
    document.dispatchEvent(
      new CustomEvent('canopy-set-task-request', {
        detail: { ...currentRequest, task_ref: 'task:instances' },
      }),
    );
  };
  const selectedSource = () => $('prepare-source').value;
  const selectedValues = (id) => [...$(id).options].filter((o) => o.selected).map((o) => o.value);
  const assessment = () => selection.assess(selectedSource(), getRequest());
  const selectedProfile = () => profileForPipeline(assessment().pipeline_ref);
  const status = (text) => {
    $('prepare-status').textContent = text;
  };
  const spawnWorker = () =>
    new Worker(new URL('./worker.js?v=resume-v1', import.meta.url), { type: 'module' });
  const locked = () => busy || session.running || savedRuns.isInspecting();
  const storageKey = 'canopy-preparation-job';
  const supported = Boolean(
    window.Worker && window.isSecureContext && navigator.storage?.getDirectory && navigator.locks,
  );
  const sourceMembership = new Map();
  let draftPanel,
    reviewedPlan = null,
    reviewedKey = null,
    pendingReviewKey = null,
    planURL = null;
  let initialized = false,
    busy = false,
    reviewing = false,
    plots = [],
    job = null,
    resultURL = null,
    sourceRevision = 0;

  function remember(id) {
    job = id;
    try {
      if (id) sessionStorage.setItem(storageKey, id);
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* OPFS discovery does not depend on session storage. */
    }
  }
  function hideExport() {
    if (resultURL) URL.revokeObjectURL(resultURL);
    resultURL = null;
    $('prepare-download').hidden = true;
  }
  async function fetchMembership(profile) {
    const response = await fetch(new URL('../' + profile.sourceLock, import.meta.url));
    if (!response.ok) throw Error('Reviewed source membership unavailable');
    const lock = await response.json();
    return lock.plots.map((p) => ({ ...p, collection: profile.collectionOf(p) }));
  }
  function planIntent() {
    if ($('prepare-mode').value !== 'zenodo' || draftPanel?.blockedStorage) return null;
    if (draftPanel?.hasSubsets) {
      const saved = draftPanel.review();
      if (saved.status !== 'ready') return null;
      return {
        mode: 'zenodo',
        task_request: saved.request,
        subsets: draftPanel.draft.subsets.map((s) => ({
          record_id: s.record_id,
          paths: [...s.paths].sort(),
        })),
      };
    }
    const result = assessment(),
      paths = selectedValues('prepare-plot').sort();
    if (result.status !== 'ready' || !profileForPipeline(result.pipeline_ref) || !paths.length)
      return null;
    return {
      mode: 'zenodo',
      task_request: getRequest(),
      subsets: [{ record_id: selectedSource(), paths }],
    };
  }
  function clearPlan() {
    reviewedPlan = null;
    reviewedKey = null;
    if (planURL) URL.revokeObjectURL(planURL);
    planURL = null;
    $('dataset-plan').hidden = true;
  }
  function applyImportedPlan(data) {
    const { plan, request, sources, draft, memberships } = decodeImportedPlan(data, selection);
    controls();
    busy = true;
    try {
      setRequest(request);
      for (const [record, membership] of memberships) sourceMembership.set(record, membership);
      const record = draft.subsets[0].record_id;
      $('prepare-source').value = record;
      $('prepare-mode').value = 'zenodo';
      plots = sourceMembership.get(record);
      initialized = true;
      draftPanel.replace(draft);
      refreshPlots();
      hideExport();
      $('prepare-source-status').textContent =
        `${sources.length} imported sources and pipelines verified.`;
      pendingReviewKey = JSON.stringify(planIntent());
      showPlan(plan);
      status(
        'Saved plan verified and imported. Review its summary, then prepare the exact selection.',
      );
    } finally {
      busy = false;
    }
  }
  function showPlan(plan) {
    clearPlan();
    reviewedPlan = plan;
    reviewedKey = pendingReviewKey;
    renderPlan(document, catalog, plan);
    planURL = URL.createObjectURL(
      new Blob([JSON.stringify(plan, null, 2) + '\n'], { type: 'application/json' }),
    );
    $('dataset-plan-download').href = planURL;
    $('dataset-plan').hidden = false;
    document.dispatchEvent(
      new CustomEvent('canopy-plan-reviewed', { detail: { task_ref: 'task:instances' } }),
    );
  }
  function controls() {
    updateControls({
      document,
      CustomEvent,
      busy,
      session,
      inspecting: savedRuns.isInspecting(),
      selectedProfile,
      draftPanel,
      initialized,
      selectedValues,
      getRequest,
      assessment,
      supported,
      selectionSummary,
      planIntent,
      reviewedPlan,
      reviewedKey,
      clearPlan,
      job,
    });
  }
  function selectionSummary(mode) {
    if (mode === 'las')
      return 'Quick test: one complete local LAS. Dataset selection applies to ZIP and Zenodo inputs.';
    const paths = new Set(selectedValues('prepare-plot'));
    const chosen = plots.filter((p) => paths.has(p.path));
    const points = chosen.reduce((n, p) => n + p.points, 0),
      bytes = chosen.reduce((n, p) => n + p.size_bytes, 0);
    return `${chosen.length} complete plots · ${points.toLocaleString()} points · ${(bytes / 1048576).toFixed(1)} MiB of source LAS. Prepared output and ZIP require additional browser storage. Published partitions and scene identities are preserved; geographic independence is not established.`;
  }
  function refreshPlots(resetFilters = true) {
    renderPlotOptions({
      document,
      plots,
      allowed: assessment().allowed_partitions,
      profile: selectedProfile(),
      resetFilters,
    });
  }
  async function sourceChanged() {
    const revision = ++sourceRevision;
    plots = [];
    initialized = false;
    refreshPlots();
    controls();
    hideExport();
    const result = assessment(),
      profile = selectedProfile();
    const source = catalog.datasets.find((d) => d.id === selectedSource());
    const detail = source.discovery.preparation;
    $('prepare-source-status').textContent =
      `${source.name}: ${detail.status}. ${detail.detail || detail.reason || ''}`;
    document.dispatchEvent(
      new CustomEvent('canopy-source-selected', { detail: { record_id: selectedSource() } }),
    );
    if (!profile) {
      status(result.blockers.join('. ') || 'The admitted pipeline has no browser implementation.');
      initialized = true;
      controls();
      return;
    }
    status('Loading reviewed source membership…');
    try {
      const membership = await fetchMembership(profile);
      if (revision !== sourceRevision) return;
      plots = membership.sort((a, b) => a.size_bytes - b.size_bytes);
      sourceMembership.set(selectedSource(), plots);
      refreshPlots();
      status(
        result.status === 'ready'
          ? 'Ready. Review collections and partitions, then prepare the selected dataset.'
          : result.blockers.join('. '),
      );
    } catch (error) {
      if (revision === sourceRevision) status(error.message);
    } finally {
      if (revision === sourceRevision) {
        initialized = true;
        controls();
      }
    }
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
      else if (data.type === 'result' && data.operation === 'import') {
        reviewing = false;
        try {
          applyImportedPlan(data);
        } catch (error) {
          status('Plan import failed: ' + error.message);
        }
      } else if (data.type === 'result' && data.operation === 'review') {
        reviewing = false;
        showPlan(data.plan);
        status(
          'Plan checked. Review the summary, then prepare this exact dataset. No source LAS has been downloaded.',
        );
      } else if (data.type === 'result') {
        showExport(data.file, data.evidence, 'tree-instance-dataset.zip');
        const { report, request } = data.evidence;
        const omissions = data.evidence.sources
          .map(
            (source) =>
              `${source.task_plan.source_ref}: ${Object.keys(source.task_plan.omitted).join(', ') || 'none'}`,
          )
          .join('; ');
        void savedRuns.refreshSaved();
        status(
          `Validated for ${request.use}: ${report.plots} plots, ${report.points.toLocaleString()} points in ${report.chunks} blocks. Optional omissions: ${omissions}. Download the ZIP to keep it.`,
        );
      } else if (data.type === 'error') {
        reviewing = false;
        if (data.code === 'DATASET_PLAN_STALE') clearPlan();
        status('Preparation failed: ' + data.error.trim().split('\n').at(-1));
        $('prepare-result').textContent = data.error;
        // Zenodo checkpoints survive failures; local preparations retain their cleanup behavior.
        void savedRuns.refreshSaved();
        $('prepare-clear').disabled = !job;
      }
      controls();
    },
    failure(text) {
      reviewing = false;
      status(text);
      void savedRuns.refreshSaved();
      $('prepare-clear').disabled = !job;
      controls();
    },
  });
  const savedRuns = createSavedRunsPanel({
    document,
    navigator,
    sessionStorage,
    supported,
    storageKey,
    session,
    inspectRuns,
    openRun,
    spawnWorker,
    isLocked: locked,
    isRunning: () => busy || session.running,
    currentJob: () => job,
    remember,
    showExport,
    hideExport,
    status,
    controls,
    beginInteraction: () => {
      busy = true;
      controls();
    },
    endInteraction: () => {
      busy = false;
      controls();
    },
  });
  draftPanel = new DraftPanel({
    document,
    storage: () => window.localStorage,
    normalize: selection.normalize,
    getRequest,
    setRequest,
    context: () => ({
      assess: selection.assess,
      sourcePlots: (record) => sourceMembership.get(record),
      hasProfile: (id) => Boolean(profileForPipeline(id)),
    }),
    sourceName: (record) =>
      catalog.datasets.find((source) => source.id === record)?.name || `Record ${record}`,
    onChange: () => {
      hideExport();
      controls();
    },
    isRunning: () => busy || session.running,
  });
  $('prepare-add').onclick = () => {
    if (locked() || $('prepare-add').disabled) return;
    const paths = new Set(selectedValues('prepare-plot'));
    const chosen = plots.filter((plot) => paths.has(plot.path));
    draftPanel.add({
      record_id: selectedSource(),
      pipeline_ref: assessment().pipeline_ref,
      paths: [...paths],
      collections: [...new Set(chosen.map((plot) => plot.collection))],
      partitions: [...new Set(chosen.map((plot) => plot.published_split))],
    });
  };
  $('prepare-file').onchange = controls;
  $('prepare-mode').onchange = controls;
  $('prepare-collections').onchange = $('prepare-partitions').onchange = () => {
    refreshPlots(false);
    controls();
  };
  $('prepare-plot').onchange = controls;
  $('prepare-smallest').onclick = () => {
    if (locked()) return;
    const options = [...$('prepare-plot').options];
    const sizes = new Map(plots.map((plot) => [plot.path, plot.size_bytes]));
    const smallest = options.reduce(
      (best, option) => (!best || sizes.get(option.value) < sizes.get(best.value) ? option : best),
      null,
    );
    for (const option of options) option.selected = option === smallest;
    controls();
  };
  $('prepare-select-all').onclick = () => {
    if (locked()) return;
    for (const option of $('prepare-plot').options) option.selected = true;
    controls();
  };
  $('prepare-source').onchange = sourceChanged;
  $('dataset-plan-file').onchange = async () => {
    if (locked()) return;
    const file = $('dataset-plan-file').files[0];
    if (!file) return;
    busy = true;
    controls();
    try {
      if (file.size > 1048576) throw Error('Plan files must be JSON up to 1 MiB');
      const text = await file.text(),
        candidate = JSON.parse(text);
      const sources = planSources(candidate).map((p) => p?.task_plan?.source_ref);
      if (
        !sources.length ||
        sources.some((source) => typeof source !== 'string' || !/^zenodo:[1-9][0-9]*$/.test(source))
      )
        throw Error('Choose a dataset-plan.json with reviewed Zenodo sources');
      reviewing = true;
      session.start(spawnWorker, {
        operation: 'import',
        mode: 'zenodo',
        records: sources.map((source) => source.slice(7)),
        plan_text: text,
      });
      status('Checking the imported plan against current source, pipeline and runtime pins…');
    } catch (error) {
      reviewing = false;
      status('Plan import failed: ' + error.message);
    } finally {
      busy = false;
      $('dataset-plan-file').value = '';
      controls();
    }
  };
  $('prepare-review').onclick = () => {
    if (locked() || $('prepare-review').disabled) return;
    const intent = planIntent();
    if (!intent) return;
    clearPlan();
    pendingReviewKey = JSON.stringify(intent);
    reviewing = true;
    try {
      session.start(spawnWorker, { operation: 'review', ...intent });
      status('Resolving the plan against pinned source metadata and audited task requirements…');
    } catch (error) {
      reviewing = false;
      status(error.message);
    }
    controls();
  };
  $('prepare-run').onclick = async () => {
    if (locked() || $('prepare-run').disabled) return;
    const saved = draftPanel.hasSubsets ? draftPanel.review() : null;
    if (
      draftPanel.blockedStorage ||
      (saved && (saved.status !== 'ready' || $('prepare-mode').value !== 'zenodo'))
    ) {
      status(
        saved?.error ||
          'Saved subsets use Zenodo intake. Restore requirements or clear the dataset selection.',
      );
      return;
    }
    const record = selectedSource();
    const request = saved?.request || getRequest();
    const result = selection.assess(record, request),
      profile = profileForPipeline(result.pipeline_ref);
    if (!saved && (!profile || result.status !== 'ready')) {
      status('This request has no admitted browser preparation.');
      return;
    }
    const intent = planIntent();
    if (
      $('prepare-mode').value === 'zenodo' &&
      (!reviewedPlan || JSON.stringify(intent) !== reviewedKey)
    ) {
      clearPlan();
      controls();
      status('Review the dataset plan before downloading.');
      return;
    }
    busy = true;
    controls();
    hideExport();
    $('prepare-clear').disabled = true;
    $('prepare-result').textContent = '';
    try {
      remember(null);
      session.start(spawnWorker, {
        ...(intent || { record_id: record, mode: $('prepare-mode').value }),
        selected_paths: saved?.paths || selectedValues('prepare-plot'),
        file: $('prepare-file').files[0],
        task_request: request,
        execution_plan: reviewedPlan,
      });
      document.dispatchEvent(
        new CustomEvent('canopy-execution-started', { detail: { task_ref: 'task:instances' } }),
      );
      status('Rechecking the frozen plan and available browser storage…');
      void savedRuns.refreshSaved();
    } catch (error) {
      console.error(error);
      status(error.message);
      $('prepare-clear').disabled = !job;
    } finally {
      busy = false;
      controls();
    }
  };
  $('prepare-cancel').onclick = async () => {
    const reviewOnly = reviewing;
    session.stop();
    reviewing = false;
    if (reviewOnly) {
      status('Review cancelled; previous prepared output retained.');
      controls();
      return;
    }
    status(
      'Stopped. Validated Zenodo plots are retained; use Resume in Saved preparations. Local inputs must restart.',
    );
    await savedRuns.refreshSaved();
    controls();
  };
  $('prepare-clear').onclick = async () => {
    busy = true;
    controls();
    try {
      await savedRuns.removeJob(job);
      remember(null);
      hideExport();
      $('prepare-clear').disabled = true;
      await savedRuns.refreshSaved();
      status('Temporary output deleted.');
    } catch (error) {
      status('Could not clear temporary output: ' + error.message);
    } finally {
      busy = false;
      controls();
    }
  };
  document.addEventListener('canopy-task-request', (event) => {
    if (event.detail.task_ref === 'task:species') return;
    currentRequest = selection.normalize(event.detail.use, event.detail.variables);
    if (locked()) return;
    refreshPlots();
    hideExport();
    const result = assessment();
    status(
      result.status === 'ready'
        ? 'Request updated. Prepare again to bind the ZIP to these requirements.'
        : result.blockers.join('. '),
    );
    controls();
  });
  document.addEventListener('canopy-prepare-task', ({ detail }) => {
    if (detail.task_ref === 'task:species') return;
    if (busy || session.running || !catalog.datasets.some((d) => d.id === String(detail.record_id)))
      return;
    $('prepare-source').value = String(detail.record_id);
    $('prepare-mode').value = 'zenodo';
    sourceChanged();
  });
  for (const source of catalog.datasets.filter((source) => !source.classification)) {
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = source.name;
    $('prepare-source').append(option);
  }
  $('prepare-mode').value = 'zenodo';
  $('prepare-source').value =
    catalog.datasets.find((d) => selection.assess(d.id, getRequest()).status === 'ready')?.id ||
    catalog.datasets[0].id;
  try {
    if (!initialRequest) draftPanel.restoreRequest();
  } catch (error) {
    draftPanel.loadError = 'Saved requirements could not be restored: ' + error.message;
  }
  sourceChanged().then(async () => {
    for (const record of new Set(draftPanel.draft.subsets.map((s) => s.record_id))) {
      if (sourceMembership.has(record)) continue;
      const profile = profileForPipeline(
        selection.assess(record, draftPanel.draft.request).pipeline_ref,
      );
      if (!profile) continue;
      try {
        sourceMembership.set(record, await fetchMembership(profile));
      } catch (error) {
        status(`zenodo:${record}: ${error.message}`);
      }
    }
    controls();
    return supported
      ? savedRuns.recover()
      : status('Browser storage is unavailable. Use a current browser over HTTPS or localhost.');
  });
  window.addEventListener('pagehide', () => session.stop());
}
