import { inspectRuns, validJob, lockName, openRun } from './run-store.js';
import { emptyDraft, readDraft, sameRequest } from './dataset-draft.js';
import { DraftPanel } from './draft-panel.js';
import { datasetPlots } from './selection.js';
import { RunSession } from './run-session.js?v=2';
import { profileForPipeline } from './profiles.js';
import { createTaskSelection } from '../web/catalog/task-selection.js';

export function mountPreparation(catalog = window.LIDAR_CATALOG) {
  const $ = (id) => document.getElementById(id);
  const selection = createTaskSelection(catalog);
  let currentRequest = selection.normalize();
  const getRequest = () => currentRequest;
  const setRequest = (request) => {
    currentRequest = selection.normalize(request.use, request.variables);
    document.dispatchEvent(new CustomEvent('canopy-set-task-request', { detail: currentRequest }));
  };
  const selectedSource = () => $('prepare-source').value;
  const selectedValues = (id) => [...$(id).options].filter((o) => o.selected).map((o) => o.value);
  const assessment = () => selection.assess(selectedSource(), getRequest());
  const selectedProfile = () => profileForPipeline(assessment().pipeline_ref);
  const status = (text) => {
    $('prepare-status').textContent = text;
  };
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
  let inspecting = false;
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
  function planSources(plan) {
    return plan.schema_version === '1.0.0' ? [plan] : plan.source_plans;
  }
  function planRequest(plan) {
    return plan.schema_version === '1.0.0'
      ? { use: plan.task_plan.use, variables: plan.task_plan.variables }
      : plan.request;
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
    const { plan } = data,
      request = planRequest(plan),
      sources = planSources(plan);
    const normalized = selection.normalize(request.use, request.variables);
    if (!sameRequest(request, normalized))
      throw Error('Imported task requirements differ from this page. Reload and try again.');
    const draft = emptyDraft(request),
      memberships = new Map();
    for (const source of sources) {
      const task = source.task_plan,
        record = task.source_ref.replace(/^zenodo:/, '');
      const profile = profileForPipeline(task.pipeline_ref),
        result = selection.assess(record, request);
      if (
        !profile ||
        profile.recordId !== record ||
        result.status !== 'ready' ||
        result.pipeline_ref !== task.pipeline_ref
      )
        throw Error(`zenodo:${record}: imported source has no current browser implementation`);
      const nativePlots = Array.isArray(data.source_plots)
        ? data.source_plots
        : data.source_plots[record];
      const membership = nativePlots.map((plot) => ({
        ...plot,
        collection: profile.collectionOf(plot),
      }));
      memberships.set(
        record,
        membership.sort((a, b) => a.size_bytes - b.size_bytes),
      );
      const byPath = new Map(membership.map((plot) => [plot.path, plot]));
      draft.subsets.push(
        ...source.subsets.map((paths) => ({
          record_id: record,
          pipeline_ref: task.pipeline_ref,
          paths,
          collections: [...new Set(paths.map((path) => byPath.get(path).collection))],
          partitions: [...new Set(paths.map((path) => byPath.get(path).published_split))],
        })),
      );
    }
    readDraft(JSON.stringify(draft), selection.normalize);
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
    const { totals } = plan,
      request = planRequest(plan),
      sources = planSources(plan);
    $('dataset-plan-summary').textContent =
      `${totals.plots} unique plots · ${totals.points.toLocaleString()} points · ${totals.overlapping_selections} overlapping selections retrieved once. Source LAS: ${(totals.source_las_bytes / 1048576).toFixed(1)} MiB; estimated browser space: ${Math.ceil(totals.estimated_browser_storage_bytes / 1048576)} MiB. Compressed network volume is not known.`;
    $('dataset-plan-requirements').textContent =
      `Use: ${request.use}. ` +
      sources
        .map((source) => {
          const task = source.task_plan;
          return `${catalog.datasets.find((d) => 'zenodo:' + d.id === task.source_ref)?.name || task.source_ref}: ${source.totals.plots} plots, ${source.totals.points.toLocaleString()} points; included ${Object.keys(task.included).join(', ')}; optional omissions ${Object.keys(task.omitted).join(', ') || 'none'}; folders ${source.output.partitions.join(', ')} / ${task.source_ref}.`;
        })
        .join(' ');
    $('dataset-plan-version').textContent =
      sources
        .map((source) => `${source.task_plan.source_ref}: ${source.task_plan.pipeline_ref}`)
        .join('; ') + `. Plan: ${plan.plan_sha256}.`;
    $('dataset-plan-evidence').textContent = JSON.stringify(plan, null, 2);
    const limitations = $('dataset-plan-limitations');
    limitations.replaceChildren();
    for (const text of plan.limitations) {
      const row = document.createElement('li');
      row.textContent = text;
      limitations.append(row);
    }
    planURL = URL.createObjectURL(
      new Blob([JSON.stringify(plan, null, 2) + '\n'], { type: 'application/json' }),
    );
    $('dataset-plan-download').href = planURL;
    $('dataset-plan').hidden = false;
  }
  function controls() {
    const running = busy || session.running || inspecting;
    document.dispatchEvent(new CustomEvent('canopy-preparation-state', { detail: { running } }));
    const profile = selectedProfile();
    const mode = $('prepare-mode').value,
      local = mode !== 'zenodo';
    const draft = draftPanel?.render(running);
    const hasDraft = draftPanel?.hasSubsets;
    if (hasDraft && mode !== 'zenodo')
      $('dataset-draft-status').textContent =
        'Saved subsets currently use Zenodo downloads. Choose Zenodo input or clear the dataset selection to use a local file.';
    const locked = running || !initialized || !profile;
    $('prepare-source').disabled = running;
    $('prepare-mode').disabled = locked;
    $('prepare-file-label').hidden = !local;
    $('prepare-file-title').textContent =
      (mode === 'zip' ? profile?.archiveLabel : profile?.fileLabel) || 'Reviewed source file';
    $('prepare-file').accept = mode === 'zip' ? '.zip' : '.las';
    $('prepare-file').disabled = locked || !local;
    $('prepare-plot-label').hidden = mode === 'las';
    for (const id of ['prepare-collections', 'prepare-partitions'])
      $(id).disabled = locked || mode === 'las';
    $('prepare-selection-summary').textContent = selectionSummary(mode);
    $('prepare-plot').disabled = locked || !$('prepare-plot').options.length;
    const compatibleDraft = !hasDraft || sameRequest(getRequest(), draftPanel.draft.request);
    $('prepare-add').disabled =
      locked ||
      mode !== 'zenodo' ||
      assessment().status !== 'ready' ||
      !selectedValues('prepare-plot').length ||
      !compatibleDraft ||
      draftPanel?.blockedStorage;
    $('prepare-run').textContent = hasDraft ? 'Prepare my dataset' : 'Prepare current selection';
    $('prepare-run').disabled =
      !supported ||
      running ||
      draftPanel?.blockedStorage ||
      (hasDraft
        ? mode !== 'zenodo' || draft?.status !== 'ready'
        : assessment().status !== 'ready' ||
          locked ||
          (local && !$('prepare-file').files.length) ||
          (mode !== 'las' && !selectedValues('prepare-plot').length));
    const intent = planIntent(),
      key = intent ? JSON.stringify(intent) : null;
    if (reviewedPlan && key !== reviewedKey) clearPlan();
    $('prepare-review').disabled = !supported || running || !intent;
    $('dataset-plan-file').disabled = !supported || running;
    if (mode === 'zenodo' && !reviewedPlan) $('prepare-run').disabled = true;
    $('prepare-cancel').disabled = !session.running;
    $('saved-runs-refresh').disabled = running;
    $('prepare-clear').disabled = running || !job;
    for (const button of $('saved-runs').querySelectorAll?.('button') || [])
      button.disabled = running || button.dataset?.busy === 'true';
  }
  function options(id, values) {
    $(id).replaceChildren();
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      option.selected = true;
      $(id).append(option);
    }
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
    const allowed = assessment().allowed_partitions,
      profile = selectedProfile();
    if (resetFilters) {
      options('prepare-collections', [...new Set(plots.map((p) => p.collection))].sort());
      options(
        'prepare-partitions',
        [...new Set(plots.map((p) => p.published_split))].filter((p) => allowed.includes(p)).sort(),
      );
    }
    $('prepare-plot').replaceChildren();
    const chosen = datasetPlots(
      plots,
      allowed,
      selectedValues('prepare-collections'),
      selectedValues('prepare-partitions'),
    );
    for (const plot of chosen) {
      const option = document.createElement('option');
      option.value = plot.path;
      option.selected = true;
      option.textContent = `${profile.plotLabel(plot.path)} · ${plot.published_split} · ${(plot.size_bytes / 1048576).toFixed(1)} MiB`;
      $('prepare-plot').append(option);
    }
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
      const response = await fetch(new URL('../' + profile.sourceLock, import.meta.url));
      if (!response.ok) throw Error('Reviewed plot list unavailable');
      const sourceLock = await response.json();
      if (revision !== sourceRevision) return;
      plots = sourceLock.plots
        .map((p) => ({ ...p, collection: profile.collectionOf(p) }))
        .sort((a, b) => a.size_bytes - b.size_bytes);
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
  async function removeJob(id) {
    if (!id) return;
    if (!validJob(id)) throw Error('Invalid saved run identity');
    await navigator.locks.request(lockName(id), { ifAvailable: true }, async (lock) => {
      if (!lock) throw Error('This output is in use by another page');
      try {
        const { jobs } = await openRun(id);
        await jobs.removeEntry(id, { recursive: true });
      } catch (error) {
        if (error.name !== 'NotFoundError') throw error;
      }
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
        void refreshSaved();
        status(
          `Validated for ${request.use}: ${report.plots} plots, ${report.points.toLocaleString()} points in ${report.chunks} blocks. Optional omissions: ${omissions}. Download the ZIP to keep it.`,
        );
      } else if (data.type === 'error') {
        reviewing = false;
        if (data.code === 'DATASET_PLAN_STALE') clearPlan();
        status('Preparation failed: ' + data.error.trim().split('\n').at(-1));
        $('prepare-result').textContent = data.error;
        // Zenodo checkpoints survive failures; local preparations retain their cleanup behavior.
        void refreshSaved();
        $('prepare-clear').disabled = !job;
      }
      controls();
    },
    failure(text) {
      reviewing = false;
      status(text);
      void refreshSaved();
      $('prepare-clear').disabled = !job;
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
    if (busy || session.running || $('prepare-add').disabled) return;
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
  $('prepare-source').onchange = sourceChanged;
  $('dataset-plan-file').onchange = async () => {
    if (busy || session.running || inspecting) return;
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
      session.start(
        () => new Worker(new URL('./worker.js?v=resume-v1', import.meta.url), { type: 'module' }),
        {
          operation: 'import',
          mode: 'zenodo',
          records: sources.map((source) => source.slice(7)),
          plan_text: text,
        },
      );
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
    if (busy || session.running || inspecting || $('prepare-review').disabled) return;
    const intent = planIntent();
    if (!intent) return;
    clearPlan();
    pendingReviewKey = JSON.stringify(intent);
    reviewing = true;
    try {
      session.start(
        () => new Worker(new URL('./worker.js?v=resume-v1', import.meta.url), { type: 'module' }),
        { operation: 'review', ...intent },
      );
      status('Resolving the plan against pinned source metadata and audited task requirements…');
    } catch (error) {
      reviewing = false;
      status(error.message);
    }
    controls();
  };
  $('prepare-run').onclick = async () => {
    if (busy || session.running || inspecting || $('prepare-run').disabled) return;
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
      session.start(
        () => new Worker(new URL('./worker.js?v=resume-v1', import.meta.url), { type: 'module' }),
        {
          ...(intent || { record_id: record, mode: $('prepare-mode').value }),
          selected_paths: saved?.paths || selectedValues('prepare-plot'),
          file: $('prepare-file').files[0],
          task_request: request,
          execution_plan: reviewedPlan,
        },
      );
      status('Rechecking the frozen plan and available browser storage…');
      void refreshSaved();
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
    await refreshSaved();
    controls();
  };
  $('prepare-clear').onclick = async () => {
    busy = true;
    controls();
    try {
      await removeJob(job);
      remember(null);
      hideExport();
      $('prepare-clear').disabled = true;
      await refreshSaved();
      status('Temporary output deleted.');
    } catch (error) {
      status('Could not clear temporary output: ' + error.message);
    } finally {
      busy = false;
      controls();
    }
  };
  async function refreshSaved() {
    if (!supported || session.running || inspecting) return;
    inspecting = true;
    controls();
    const list = $('saved-runs');
    try {
      const runs = await inspectRuns();
      list.replaceChildren();
      for (const run of runs) {
        const row = document.createElement('li'),
          description = document.createElement('p');
        const savedPlan = run.saved?.execution_plan;
        const plan =
          savedPlan &&
          (savedPlan.schema_version === '1.0.0'
            ? savedPlan.task_plan?.source_ref
            : Array.isArray(savedPlan.source_plans))
            ? savedPlan
            : null;
        const sources = plan
          ? planSources(plan)
              .map((p) => p?.task_plan?.source_ref || 'Invalid saved source')
              .join(', ')
          : run.evidence?.sources?.map((s) => s.task_plan.source_ref).join(', ') ||
            run.evidence?.task_plan?.source_ref ||
            'Historical preparation';
        const use =
          run.saved?.task_request?.use ||
          run.evidence?.request?.use ||
          run.evidence?.task_plan?.use ||
          'unspecified use';
        description.textContent = `${sources} / ${use} · ${run.status} · ${run.completed || 0} saved plots (checked again on resume)${plan ? ' / ' + (plan.totals?.plots ?? '?') + ' plots' : ''} · ${run.bytes === undefined ? 'storage in use' : (run.bytes / 1048576).toFixed(1) + ' MiB'}. ${run.detail || ''}`;
        row.dataset.run = run.id;
        row.append(description);
        const button = (label, action) => {
          const element = document.createElement('button');
          element.className = 'button small';
          element.textContent = label;
          element.dataset.busy = String(run.status === 'busy');
          element.disabled = busy || session.running || run.status === 'busy';
          element.onclick = action;
          row.append(element);
        };
        if (run.status === 'complete')
          button('Download result', () => {
            if (busy || session.running || inspecting) return;
            remember(run.id);
            showExport(run.file, run.evidence, 'tree-instance-dataset.zip');
            status(`Recovered ZIP for ${sources} / ${use}. Its saved plan describes that run.`);
            controls();
          });
        else if (run.resumable)
          button('Resume', () => {
            if (busy || session.running || inspecting) return;
            hideExport();
            remember(run.id);
            try {
              session.start(
                () =>
                  new Worker(new URL('./worker.js?v=resume-v1', import.meta.url), {
                    type: 'module',
                  }),
                { operation: 'resume', job: run.id },
              );
              status(`Rechecking saved plan and every completed plot for ${sources} / ${use}…`);
            } catch (error) {
              status('Could not resume preparation: ' + error.message);
            }
            controls();
          });
        button('Delete', async () => {
          if (busy || session.running || inspecting) return;
          busy = true;
          controls();
          try {
            await removeJob(run.id);
            if (job === run.id) {
              remember(null);
              hideExport();
            }
            status('Saved preparation deleted.');
          } catch (error) {
            status('Could not delete preparation: ' + error.message);
          } finally {
            busy = false;
            controls();
            await refreshSaved();
          }
        });
        list.append(row);
      }
      $('saved-runs-status').textContent = runs.length
        ? 'Resume rechecks exact versions and every saved block. Browser storage can be cleared by the browser; download completed ZIPs to keep them.'
        : 'No saved preparations in this browser.';
      return runs;
    } catch (error) {
      $('saved-runs-status').textContent = 'Could not inspect saved preparations: ' + error.message;
    } finally {
      inspecting = false;
      controls();
    }
  }
  $('saved-runs-refresh').onclick = () => refreshSaved();
  async function recover() {
    const runs = await refreshSaved();
    // Older local-input results have no run.json; retain their tab recovery as well.
    try {
      const previous = sessionStorage.getItem(storageKey);
      if (!validJob(previous)) return;
      const run = runs?.find((run) => run.id === previous);
      if (run?.status === 'complete') {
        remember(previous);
        showExport(run.file, run.evidence);
        status('Recovered a completed ZIP. Its saved plan describes the previous run.');
      }
    } catch {
      /* All discoverable runs remain available in the saved preparations list. */
    }
    controls();
  }
  document.addEventListener('canopy-task-request', (event) => {
    currentRequest = selection.normalize(event.detail.use, event.detail.variables);
    if (busy || session.running || inspecting) return;
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
    if (busy || session.running || !catalog.datasets.some((d) => d.id === String(detail.record_id)))
      return;
    $('prepare-source').value = String(detail.record_id);
    $('prepare-mode').value = 'zenodo';
    sourceChanged();
  });
  for (const source of catalog.datasets) {
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
    draftPanel.restoreRequest();
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
        const response = await fetch(new URL('../' + profile.sourceLock, import.meta.url));
        if (!response.ok) throw Error('Reviewed source membership unavailable');
        const lock = await response.json();
        sourceMembership.set(
          record,
          lock.plots.map((p) => ({ ...p, collection: profile.collectionOf(p) })),
        );
      } catch (error) {
        status(`zenodo:${record}: ${error.message}`);
      }
    }
    controls();
    return supported
      ? recover()
      : status('Browser storage is unavailable. Use a current browser over HTTPS or localhost.');
  });
  window.addEventListener('pagehide', () => session.stop());
}
