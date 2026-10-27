/* The UI previews coverage; the isolated worker independently freezes and checks it. */
import { escapeHTML as esc, downloadJSON } from './shared/dom.js';
import { JOINT_FIELDS } from './experiment.js?v=joint-v1';
import { RunSession } from '../browser-prepare/run-session.js';
import { inspectJointRuns, removeJointRun, fileHash } from '../browser-prepare/joint-store.js';
import { loadJointContext } from '../browser-prepare/joint-runtime.js';

export const targetLabel = (target) =>
  ({ species: 'Species', genus: 'Genus', leaf_group: 'Conifer / broadleaf' })[target];

export function jointCoverage(source, request) {
  const mapping = new Map(source.taxonomy.map((row) => [row.native_code, row]));
  const plots = source.plots.filter((plot) => request.plots.includes(plot.path));
  const all = plots.flatMap((plot) => plot.trees);
  const selected = all.filter((tree) => !request.complete_crowns || tree.complete_crown);
  const labeled = selected.filter(
    (tree) => mapping.get(tree.native_code)?.[request.target] != null,
  );
  return {
    plots: plots.length,
    points: plots.reduce((n, plot) => n + plot.points, 0),
    total: all.length,
    selected: selected.length,
    taxonomy: labeled.length,
    eligible: request.policy === 'joint' ? labeled.length : selected.length,
  };
}

export function mountJointWorkspace({ application, document: doc = document }) {
  const $ = (id) => doc.getElementById(id);
  const number = (value) => value.toLocaleString('en-US');
  let source = null,
    loadError = null,
    plan = null,
    reviewedSignature = null,
    initialized = false;
  let message = 'Review the exact selection before starting.',
    outputURL = null;
  let savedVersion = 0;
  let previousSection = null;
  const savedURLs = [];
  const active = () => application.getExperiment().tasks.length > 1;
  const request = () => {
    const draft = application.getExperiment();
    return {
      plots: draft.sources.includes('19127709') ? draft.plots : [],
      target: draft.target,
      policy: draft.policy,
      complete_crowns: draft.completeCrowns,
    };
  };
  const signature = () => JSON.stringify(request());
  const changed = () => doc.dispatchEvent(new CustomEvent('canopy-joint-state'));
  const clearPlan = () => {
    plan = null;
    reviewedSignature = null;
  };
  const hideOutput = () => {
    if (outputURL) URL.revokeObjectURL(outputURL);
    outputURL = null;
    $('joint-download').hidden = true;
  };
  function workState(running) {
    doc.dispatchEvent(
      new CustomEvent('canopy-preparation-state', {
        detail: { running, task_refs: ['task:instances', 'task:species'] },
      }),
    );
  }
  const session = new RunSession({
    event(data) {
      if (data.type === 'phase') message = data.text;
      if (data.type === 'result') {
        workState(false);
        if (['review', 'import'].includes(data.operation)) {
          if (data.operation === 'import') {
            const value = data.plan.request;
            application.setExperiment({
              sources: ['19127709'],
              plots: value.plots,
              target: value.target,
              policy: value.policy,
              completeCrowns: value.complete_crowns,
            });
          }
          plan = data.plan;
          reviewedSignature = signature();
          message = data.admitted
            ? 'Exact plan reviewed. Inspect its costs before preparing both targets.'
            : 'Exact plan reviewed; maintainer scientific admission is still required for this audited scope.';
        } else {
          outputURL = URL.createObjectURL(data.file);
          $('joint-download').href = outputURL;
          $('joint-download').hidden = false;
          message = `Validated ${number(data.validation.points)} points and ${data.validation.trees} trees. Classification labels are stored once per tree. Download the ZIP to retain it.`;
          refreshSaved();
        }
        workState(false);
      }
      if (data.type === 'error') {
        message = 'Joint preparation failed: ' + data.error;
        clearPlan();
        workState(false);
        refreshSaved();
      }
      changed();
    },
    failure(text) {
      message = text;
      clearPlan();
      workState(false);
      refreshSaved();
      changed();
    },
    timeoutMessage:
      'Stopped after 180 seconds without progress. Saved temporary files can be deleted below. Review the plan before restarting.',
  });
  function blockers() {
    const value = request();
    const reasons = [];
    if (loadError) reasons.push(loadError);
    if (!source) reasons.push('Audited source metadata is loading.');
    if (!application.getExperiment().sources.length) reasons.push('Select TreeScan in Data.');
    if (!value.plots.length) reasons.push('Select at least one complete audited plot in Data.');
    if (source && value.plots.some((path) => !source.plots.some((plot) => plot.path === path)))
      reasons.push('A saved plot is outside the current audited scope; update Data.');
    if (!value.policy) reasons.push('Choose reference coverage in Preparation.');
    if (source && !jointCoverage(source, value).taxonomy)
      reasons.push('No eligible classification reference for this selection and target.');
    return reasons;
  }
  function start(operation, imported) {
    if (session.running || (operation !== 'import' && blockers().length)) return;
    if (operation === 'run') {
      hideOutput();
      application.navigate('workbench', 'runs');
    }
    message =
      operation === 'run'
        ? 'Checking the frozen joint plan before source intake…'
        : 'Checking the exact selection and execution dependencies…';
    session.start(
      () =>
        new Worker(new URL('../browser-prepare/joint-worker.js', import.meta.url), {
          type: 'module',
        }),
      {
        operation,
        request: request(),
        plan: imported || plan,
        inputs: $('joint-input-mode').value === 'local' ? [...$('joint-inputs').files] : [],
      },
    );
    workState(true);
    changed();
  }
  let refreshPromise = null;
  function refreshSaved() {
    if (!refreshPromise)
      refreshPromise = updateSaved().finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  }
  async function updateSaved() {
    const version = ++savedVersion;
    try {
      const runs = await inspectJointRuns();
      if (version !== savedVersion) return;
      savedURLs.splice(0).forEach((url) => URL.revokeObjectURL(url));
      $('joint-saved-runs').replaceChildren();
      $('joint-saved-empty').hidden = runs.length > 0;
      for (const run of runs) {
        const row = doc.createElement('li');
        const text = doc.createElement('p');
        text.textContent = `${run.id} · ${run.status === 'complete' ? 'Saved result; checksum checked before download' : run.status === 'busy' ? 'Active in a browser tab' : 'Interrupted; review and restart'}${run.bytes == null ? '' : ' · ' + (run.bytes / 1048576).toFixed(1) + ' MiB'}`;
        row.append(text);
        if (run.status === 'complete') {
          const button = doc.createElement('button');
          button.className = 'button small';
          button.textContent = 'Verify and download ZIP';
          button.onclick = async () => {
            button.disabled = true;
            try {
              const context = await loadJointContext(window);
              const tools = await context.tools();
              const digest = await fileHash(run.file, await tools.hashers.sha256(), (bytes) => {
                $('joint-status').textContent =
                  `Checking saved ZIP: ${(bytes / 1048576).toFixed(1)} MiB…`;
              });
              if (digest !== run.complete.zip_sha256)
                throw Error('Saved ZIP checksum mismatch; this result cannot be reused');
              const url = URL.createObjectURL(run.file);
              savedURLs.push(url);
              const link = doc.createElement('a');
              link.href = url;
              link.download = 'joint-tree-reference.zip';
              link.click();
              message =
                'Saved ZIP checksum verified. Its native dataset validator remains available after extraction.';
            } catch (error) {
              message = error.message;
            }
            button.disabled = false;
            changed();
          };
          row.append(button);
        }
        const remove = doc.createElement('button');
        remove.className = 'button small';
        remove.textContent = 'Delete temporary files';
        remove.disabled = run.status === 'busy' || session.running;
        remove.onclick = async () => {
          remove.disabled = true;
          try {
            await removeJointRun(run.id);
            message = 'Temporary joint files deleted. Downloaded ZIPs are retained.';
          } catch (error) {
            message = error.message;
          }
          await refreshSaved();
          changed();
        };
        row.append(remove);
        $('joint-saved-runs').append(row);
      }
    } catch (error) {
      $('joint-saved-empty').textContent = 'Could not inspect browser storage: ' + error.message;
    }
  }
  async function initialize() {
    if (initialized) return;
    initialized = true;
    try {
      const context = await loadJointContext(window);
      source = context.source;
      $('joint-plots').innerHTML =
        '<legend>Complete audited plots</legend>' +
        source.plots
          .map(
            (plot) =>
              `<label class="experiment-check"><input type="checkbox" data-joint-plot="${esc(plot.path)}" /> <span>${esc(plot.path)}<small>${number(plot.points)} points · ${plot.trees.length} native tree identities · ${(plot.size_bytes / 1048576).toFixed(1)} MiB source</small></span></label>`,
          )
          .join('');
    } catch (error) {
      loadError = 'Audited joint source unavailable: ' + error.message;
    }
    await refreshSaved();
    changed();
  }
  function render(state) {
    if (!active()) return;
    initialize();
    const draft = application.getExperiment();
    const value = request();
    const counts = source ? jointCoverage(source, value) : null;
    const reasons = blockers();
    const admitted = source?.admission?.status === 'admitted';
    $('workspace-requirements').hidden = true;
    $('workspace-service').hidden = true;
    $('workspace-runs-empty').hidden = true;
    $('workspace-context-text').textContent =
      `Instances + tree classification · ${targetLabel(draft.target)} · ${value.plots.length} plots`;
    $('workspace-context-state').textContent = session.running
      ? 'Work active'
      : outputURL
        ? 'Validated joint output'
        : plan
          ? 'Reviewed joint plan'
          : 'Joint draft · needs review';
    $('workspace-footer-state').textContent = plan
      ? 'Exact joint plan reviewed · start in Review'
      : 'Select complete audited plots, choose coverage and review the exact plan';
    $('workspace-lineage-input').textContent = 'TreeScanPL10K · complete native plot observations';
    $('workspace-lineage-output').textContent =
      'Point instances + tree species, genus and conifer/broadleaf labels';
    $('workspace-assignment-title').textContent = 'No reviewed provider split';
    $('workspace-partitions').textContent =
      'unassigned · prepare references first; no independent evaluation is claimed';
    $('workspace-consumer-caption').textContent =
      'Point and tree axes remain separate. Each tree label retains its own validity mask.';
    $('workspace-consumer-unit').textContent =
      'One plot observation: N points and T trees. Each point can link to one reference tree; species, genus and conifer/broadleaf labels belong to trees.';
    $('workspace-consumer-fields').innerHTML = JOINT_FIELDS.map(
      ([name, type, shape, meaning]) =>
        `<tr><th scope="row">${esc(name)}</th><td>${esc(type)}</td><td>${esc(shape)}</td><td>${esc(meaning)}</td></tr>`,
    ).join('');
    $('experiment-selection-summary').textContent = `${value.plots.length} plots selected`;
    $('experiment-selection-status').textContent = source
      ? `${source.plots.length} complete plots audited. The remaining provider plots are outside this execution scope. Companion tree rows disagree with native references and are never used to assign labels.`
      : loadError || 'Loading the audited native scope…';
    $('experiment-source-evidence').hidden = !draft.sources.length;
    $('joint-plots').hidden = !draft.sources.length;
    for (const input of $('joint-plots').querySelectorAll('[data-joint-plot]')) {
      input.checked = value.plots.includes(input.dataset.jointPlot);
      input.disabled = session.running;
    }
    $('experiment-complete-crowns').checked = draft.completeCrowns;
    $('experiment-complete-crowns').disabled = session.running;
    for (const input of doc.querySelectorAll('[name="experiment-coverage"]')) {
      input.checked = input.value === draft.policy;
      input.disabled = session.running;
    }
    $('experiment-coverage-counts').innerHTML = counts
      ? [
          ['Native trees in selected plots', counts.total],
          ['Eligible for instance supervision', value.policy ? counts.eligible : null],
          [targetLabel(draft.target) + ' reference after crown filter', counts.taxonomy],
          ['Points preserved', counts.points],
        ]
          .map(
            ([label, count]) =>
              `<div><span>${esc(label)}</span><strong>${count == null ? 'Choose a policy' : number(count)}</strong></div>`,
          )
          .join('')
      : '<p>Select audited plots in Data.</p>';
    $('experiment-blockers').innerHTML = [
      ...reasons,
      ...(!admitted && source
        ? ['Maintainer scientific admission is required before execution (CONTRIBUTING.md).']
        : []),
    ]
      .map((reason) => `<li>${esc(reason)}</li>`)
      .join('');
    $('joint-review').disabled = session.running || reasons.length > 0;
    $('joint-plan-download').disabled = !plan;
    $('joint-plan').hidden = !plan;
    if (plan) $('joint-plan-text').textContent = JSON.stringify(plan, null, 2);
    $('joint-input-label').hidden = $('joint-input-mode').value !== 'local';
    const missingInputs =
      $('joint-input-mode').value === 'local' &&
      value.plots.some((path) => ![...$('joint-inputs').files].some((file) => file.name === path));
    $('experiment-run').disabled =
      session.running ||
      !plan ||
      reviewedSignature !== signature() ||
      !admitted ||
      missingInputs ||
      reasons.length > 0;
    $('experiment-run').textContent = 'Prepare both targets';
    $('joint-stop').disabled = !session.running;
    $('joint-input-mode').disabled = session.running;
    $('joint-inputs').disabled = session.running;
    $('joint-plan-import').disabled = session.running;
    $('workspace-review-state').textContent = session.running
      ? message
      : plan
        ? `Reviewed ${number(plan.totals.points)} points and ${plan.totals.trees} trees; estimated browser space ${(plan.totals.estimated_browser_storage_bytes / 1e9).toFixed(2)} GB. ${missingInputs ? 'Choose every selected original LAZ file before starting.' : 'Inspect the frozen plan before preparing.'}`
        : 'Select audited plots and review the exact joint plan before source intake.';
    $('workspace-review-fix').hidden = reasons.length === 0;
    $('workspace-review-fix').dataset.workspaceSection = !value.plots.length
      ? 'data'
      : 'preparation';
    $('workspace-review-summary').innerHTML = [
      ['Objectives', 'Instances + ' + targetLabel(draft.target)],
      ['Data', `${value.plots.length} complete audited plots`],
      [
        'Coverage',
        draft.policy === 'partial'
          ? 'Partial references allowed'
          : draft.policy === 'joint'
            ? 'All selected references required'
            : 'Not selected',
      ],
      ['Reference axes', 'Point → tree; tree → species / genus / conifer or broadleaf'],
      ['Assignments', 'Unassigned · no reviewed provider split'],
    ]
      .map(([label, text]) => `<div><dt>${esc(label)}</dt><dd>${esc(text)}</dd></div>`)
      .join('');
    $('joint-status').textContent = message;
    $('joint-download').hidden = !outputURL;
    if (state.section === 'runs' && previousSection !== 'runs') refreshSaved();
    previousSection = state.section;
  }
  $('joint-review').onclick = () => start('review');
  $('experiment-run').onclick = () => start('run');
  $('joint-plan-download').onclick = () => {
    if (plan) downloadJSON(doc, plan, 'joint-dataset-plan.json');
  };
  $('joint-stop').onclick = () => {
    session.stop();
    message = 'Stopped. Temporary files are retained below; review and restart to prepare again.';
    clearPlan();
    workState(false);
    refreshSaved();
    changed();
  };
  $('joint-plan-import').onchange = async () => {
    try {
      const file = $('joint-plan-import').files[0];
      if (!file || file.size > 1024 ** 2) throw Error('Import a joint plan JSON up to 1 MiB');
      start('import', JSON.parse(await file.text()));
    } catch (error) {
      message = 'Could not import the joint plan: ' + error.message;
      changed();
    }
    $('joint-plan-import').value = '';
  };
  for (const id of ['joint-input-mode', 'joint-inputs']) $(id).onchange = changed;
  $('joint-plots').addEventListener('change', () =>
    application.setExperiment({
      plots: [...$('joint-plots').querySelectorAll('input:checked')].map(
        (input) => input.dataset.jointPlot,
      ),
    }),
  );
  doc.addEventListener('canopy-experiment-change', () => {
    if (reviewedSignature && reviewedSignature !== signature()) clearPlan();
  });
  return {
    render,
    get source() {
      return source;
    },
  };
}
