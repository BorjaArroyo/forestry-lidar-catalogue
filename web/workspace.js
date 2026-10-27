import { escapeHTML as esc } from './shared/dom.js';
import { jointSources, referenceFor } from './experiment.js?v=joint-v1';

export const WORKSPACE_SECTIONS = ['objectives', 'data', 'preparation', 'splits', 'review'];
const sections = new Set([...WORKSPACE_SECTIONS, 'runs', 'service']);

export function parseWorkspaceRoute(hash) {
  const route = hash.replace(/^#/, '');
  if (route === 'model') return { view: 'model', section: 'objectives' };
  if (route === 'workbench') return { view: 'workbench', section: 'data' };
  if (route === 'runs') return { view: 'workbench', section: 'runs' };
  if (route.startsWith('experiment/')) {
    const section = route.slice('experiment/'.length);
    return { view: 'workbench', section: sections.has(section) ? section : 'objectives' };
  }
  return { view: 'datasets', section: 'objectives' };
}

export function workspaceHash(view, section = 'objectives') {
  return view === 'workbench'
    ? '#experiment/' + (sections.has(section) ? section : 'objectives')
    : '#' + (view === 'model' ? 'model' : 'datasets');
}

export function mountWorkspace({ application, document: doc = document, jointWorkspace }) {
  const $ = (id) => doc.getElementById(id);
  const isJoint = () => application.getExperiment().tasks.length > 1;
  let running = false;
  const startedTasks = new Set();
  const executionContexts = new Map();
  const rememberExecution = () => {
    const task = application.selection.task;
    const request = application.getTaskRequest();
    startedTasks.add(task.id);
    executionContexts.set(
      task.id,
      `${task.title} · ${task.requirements.uses[request.use].label}${task.id === 'species' ? ' · ' + request.rank : ''} · ${$('workspace-lineage-input').textContent}`,
    );
  };
  let sourceSignature = '';
  let subsetCount = 0;
  const setHidden = (element, hidden) => {
    if (element.hidden !== hidden) element.hidden = hidden;
  };
  const selectionList = () =>
    $(
      application.selection.task.id === 'species'
        ? 'classification-draft-list'
        : 'dataset-draft-list',
    );
  function openSubset(record) {
    const species = application.selection.task.id === 'species';
    const source = $(species ? 'classification-source' : 'prepare-source');
    const dataset = application.catalog.datasets.find((entry) => entry.id === record);
    const value = species ? dataset.source_ref : record;
    if (running || ![...source.options].some((option) => option.value === value)) return;
    source.value = value;
    if (!species) {
      $('prepare-mode').value = 'zenodo';
      $('prepare-mode').dispatchEvent(new Event('change', { bubbles: true }));
    }
    source.dispatchEvent(new Event('change', { bubbles: true }));
    subsetCount = selectionList().children.length;
    $(species ? 'classification-subset-message' : 'prepare-subset-message').textContent = '';
    $(species ? 'classification-subset-dialog' : 'prepare-subset-dialog').showModal();
  }
  function renderSources(request, task, state) {
    const source = $(task.id === 'species' ? 'classification-source' : 'prepare-source');
    const signature = JSON.stringify([
      application.getExperiment(),
      task.id,
      request,
      state.taskRunning,
      jointWorkspace.source?.admission?.status,
      [...source.options].map((option) => option.value),
    ]);
    if (signature === sourceSignature) return;
    sourceSignature = signature;
    const experiment = application.getExperiment();
    const candidates = isJoint()
      ? jointSources(application.catalog)
      : application.catalog.datasets.filter(
          (dataset) => task.preparation_sources[dataset.id]?.pipelines.length,
        );
    $('workspace-source-list').innerHTML = candidates
      .map((dataset) => {
        if (isJoint()) {
          const selected = experiment.sources.includes(dataset.id);
          return `<tr><td><button class="workspace-source-name" data-detail="${esc(dataset.id)}">${esc(dataset.name)}</button><small>zenodo:${esc(dataset.id)}</small></td><td data-label="Task coverage">${esc(referenceFor(dataset, 'instances').label)}<small>${esc(referenceFor(dataset, 'species').label)}</small><span class="workspace-tag">Reference review required</span></td><td data-label="Representation">Native plot clouds<small>${jointWorkspace.source?.admission?.status === 'admitted' ? 'Audited joint plot selection available' : 'Audited scope · admission pending'}</small></td><td><button class="button" data-experiment-${selected ? 'remove' : 'add'}="${esc(dataset.id)}">${selected ? 'Remove source' : 'Add to experiment'}</button></td></tr>`;
        }
        const fit = application.selection.assess(dataset.id, request);
        const loaded = [...source.options].some(
          (option) => option.value === (task.id === 'species' ? dataset.source_ref : dataset.id),
        );
        const representation = dataset.classification
          ? dataset.modalities.join(' / ') + ' native tree observations'
          : 'Native plot clouds' + (fit.included.reflectance ? ' + spectral channels' : '');
        return `<tr><td><button class="workspace-source-name" data-detail="${esc(dataset.id)}">${esc(dataset.name)}</button><small>${esc(dataset.source_ref || 'zenodo:' + dataset.id)}</small></td><td data-label="Task coverage"><span class="workspace-tag">${fit.status === 'ready' ? 'Audited route' : 'Request unavailable'}</span>${fit.blockers.length ? `<small>${esc(fit.blockers.join('. '))}</small>` : ''}</td><td data-label="Representation">${esc(representation)}</td><td><button class="button" data-workspace-source="${esc(dataset.id)}" ${running || !loaded || fit.status !== 'ready' ? 'disabled' : ''}>${loaded ? 'Configure subset' : 'Loading…'}</button></td></tr>`;
      })
      .join('');
  }
  function renderExperiment(state) {
    const experiment = application.getExperiment();
    const multi = isJoint();
    $('workspace-available-routes').hidden =
      !multi || state.view !== 'workbench' || state.section !== 'data';
    $('workspace-single-task-routes').hidden = multi;
    for (const id of ['experiment-selection', 'experiment-coverage', 'experiment-runs-info']) {
      const panel = $(id);
      panel.hidden =
        !multi ||
        state.view !== 'workbench' ||
        !panel.dataset.workspaceStage.split(' ').includes(state.section);
    }
    $('experiment-review-blockers').hidden = !multi;
    for (const input of doc.querySelectorAll('[data-workspace-task]')) {
      input.checked = experiment.tasks.includes(input.dataset.workspaceTask.replace('task:', ''));
      input.disabled = state.taskRunning;
    }
    $('workspace-objectives-note').textContent =
      'Select one or both targets. At least one target is required.';
    $('workspace-source-help').textContent = multi
      ? 'One source can contribute to both targets. Reference coverage is separate from execution readiness.'
      : 'Coverage is checked for the active task. Related sensor views remain separate observations.';
    $('workspace-consumer-caption').textContent = multi
      ? 'Proposed joint consumer fields. Source-specific reference policies and the producer still need validation.'
      : 'Requested task fields; exact source coverage and optional omissions are checked in the reviewed plan.';
    $('workspace-consumer-help').textContent = multi
      ? 'N counts points; T counts linked reference trees. Targets keep independent masks. Eligibility exclusions do not change reference validity or remove scene context.'
      : 'N counts points in a scene or observation; C counts source-specific channels. File blocks are storage units. Exact source omissions appear in the reviewed plan.';
    $('workspace-assignment-title').textContent = multi
      ? 'Shared assignments are required'
      : 'Provider assignments are preserved';
    $('workspace-review-fix').dataset.workspaceSection = 'data';
    if (!multi) return;
    jointWorkspace.render(state);
  }

  function render() {
    const state = application.getState();
    const request = application.getTaskRequest();
    const task = application.selection.task;
    const workspace = state.view === 'workbench';
    doc.body.dataset.area = state.view;
    doc.body.dataset.workspaceSection = state.section;
    for (const panel of doc.querySelectorAll('[data-workspace-stage]'))
      setHidden(
        panel,
        !workspace || !panel.dataset.workspaceStage.split(' ').includes(state.section),
      );
    for (const dialog of doc.querySelectorAll('.workspace-subset-dialog[open]'))
      if (!workspace || state.section !== 'data') dialog.close();
    $('workspace-context').hidden = !workspace && !running;
    $('workspace-navigation').hidden = !workspace || ['runs', 'service'].includes(state.section);
    $('workspace-footer').hidden = !workspace;
    $('workspace-context-text').textContent =
      `${task.title} · ${task.requirements.uses[request.use].label}` +
      (task.id === 'species' ? ` · ${request.rank} reference` : '');
    $('workspace-activity').hidden = !running;
    $('workspace-storage-warning').hidden = !state.storageUnavailable;
    doc.querySelectorAll('#workspace-navigation [data-workspace-section]').forEach((button) => {
      button.setAttribute(
        'aria-current',
        workspace && button.dataset.workspaceSection === state.section ? 'step' : 'false',
      );
    });
    const index = WORKSPACE_SECTIONS.indexOf(state.section);
    const next = index >= 0 ? WORKSPACE_SECTIONS[index + 1] : null;
    $('workspace-next').hidden = !next;
    $('workspace-next').dataset.workspaceSection = next || 'review';
    $('workspace-next').textContent = next ? 'Continue to ' + next : '';
    $('workspace-back').hidden = index === 0;
    $('workspace-back').dataset.workspaceSection =
      index < 0 ? 'review' : WORKSPACE_SECTIONS[index - 1];
    $('workspace-back').textContent = index < 0 ? 'Return to experiment' : 'Back';
    const species = task.id === 'species';
    const executionStarted = startedTasks.has(task.id);
    if (state.section === 'runs' && executionContexts.has(task.id))
      $('workspace-context-text').textContent = executionContexts.get(task.id);
    $('workspace-service-unavailable').hidden = !species;
    $('workspace-service').hidden = species || !['preparation', 'service'].includes(state.section);
    const plan = $(species ? 'classification-plan' : 'dataset-plan');
    const run = $(species ? 'classification-run' : 'prepare-run');
    const review = $(species ? 'classification-review' : 'prepare-review');
    const localInput = !species && $('prepare-mode').value !== 'zenodo';
    const hasSelection = selectionList().children.length > 0;
    const downloadable = !$(species ? 'classification-download' : 'prepare-download').hidden;
    const hasSaved = $(species ? 'classification-saved-runs' : 'saved-runs').children.length > 0;
    for (const actions of doc.querySelectorAll('.workspace-review-actions'))
      actions.disabled = !hasSelection && !localInput;
    $('workspace-context-title').textContent =
      state.section === 'runs' ? 'Executions & outputs' : 'Current experiment';
    $('workspace-context-state').textContent = running
      ? 'Work active'
      : downloadable
        ? 'Validated output available'
        : !plan.hidden
          ? 'Reviewed plan'
          : hasSelection
            ? 'Needs review'
            : 'No data selected';
    if (state.section === 'runs' && !running && !downloadable)
      $('workspace-context-state').textContent = hasSaved
        ? 'Saved preparations'
        : executionStarted
          ? 'Execution stopped'
          : 'No runs';
    $('workspace-footer-state').textContent = hasSelection
      ? !run.disabled
        ? 'Ready to prepare · open Review to start'
        : `${selectionList().children.length} saved subsets · review the exact plan before preparing`
      : 'Next: choose a source in Data and add a subset';
    setHidden($('workspace-requirements'), species);
    setHidden(
      $('workspace-runs-empty'),
      state.section !== 'runs' || running || downloadable || hasSaved || executionStarted,
    );
    setHidden(
      $(species ? 'workspace-classification-result' : 'workspace-instance-result'),
      state.section !== 'runs' || (!running && !downloadable && !executionStarted),
    );
    const status = $(species ? 'classification-status' : 'prepare-status');
    setHidden(
      status,
      (state.section === 'runs' && !executionStarted && !running && !downloadable) ||
        (!species && status.textContent.trim().startsWith('Ready.')) ||
        (species &&
          status.textContent.startsWith('Loading pinned') &&
          $('classification-source').options.length > 0),
    );
    $('workspace-review-state').textContent = running
      ? 'Work is in progress. Navigation keeps this page’s worker active.'
      : !plan.hidden && !run.disabled
        ? 'Plan reviewed. Inspect its coverage before starting preparation.'
        : localInput && !run.disabled
          ? 'Local input selected. Preparation verifies the file and exports its provenance; the frozen selection plan applies to Zenodo intake.'
          : !review.disabled
            ? 'Selection available. Review its exact plan before preparing.'
            : 'Review is unavailable for the current selection. Check Data and Objectives.';
    $('workspace-review-fix').hidden = !review.disabled || running || (localInput && !run.disabled);
    if (!hasSelection && !localInput && !running) {
      $('workspace-review-state').textContent =
        'Add a source subset in Data, or import a reviewed plan below, before preparing a dataset.';
      $('workspace-review-fix').hidden = false;
    }
    $('workspace-partitions').textContent =
      task.requirements.uses[request.use].allowed_partitions.join(', ');
    $('workspace-consumer-fields').innerHTML = task.requirements.variables
      .filter((variable) => request.variables[variable.key] !== 'off')
      .flatMap((variable) =>
        variable.output_fields.map(
          (field) =>
            `<tr><th scope="row">${esc(field.name)}</th><td data-label="Type">${esc(field.dtypes.join(' / '))}</td><td data-label="Shape">${esc(field.shape.length ? field.shape.join(' × ') : 'scalar per tree')}</td><td data-label="Requirement">${esc(request.variables[variable.key])}</td></tr>`,
        ),
      )
      .join('');
    $('workspace-consumer-unit').textContent = species
      ? 'Coordinates belong to an observation; taxonomy and rank validity belong to its physical tree. Sensor views remain separate.'
      : 'Coordinates, instances and reference masks are point-aligned within a scene. Instance identity stays source- and scene-scoped.';
    const names = application.catalog.datasets
      .filter((dataset) =>
        [...selectionList().children].some((row) =>
          row.textContent.startsWith(species ? dataset.source_ref + ':' : dataset.name + ' ·'),
        ),
      )
      .map((dataset) => dataset.name);
    const selected = names.length
      ? names.join(' · ')
      : localInput
        ? $('prepare-file').files[0]?.name || 'Choose a reviewed local file in Preparation'
        : 'No saved subsets — add data first';
    $('workspace-lineage-input').textContent = selected;
    $('workspace-lineage-output').textContent = task.title;
    $('workspace-review-summary').innerHTML = [
      [
        'Objective',
        task.title +
          ' · ' +
          task.requirements.uses[request.use].label +
          (species ? ' · ' + request.rank : ''),
      ],
      ['Selected data', selected],
      ['Representation', 'Native observations · source identities preserved'],
      ['Assignments', 'Provider partitions · independence not established'],
    ]
      .map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`)
      .join('');
    let cost = '';
    if (species && !plan.hidden) {
      try {
        const value = JSON.parse($('classification-plan-text').textContent);
        cost = `${value.totals.trees} physical trees · ${value.totals.observations} observations · ${(value.totals.sequential_download_bytes / 1e9).toFixed(2)} GB sequential source traversal. Inspect the exact plan below.`;
      } catch {
        /* A plan is displayed only after its coordinator validates it. */
      }
    }
    $('workspace-plan-cost').textContent = cost;
    setHidden($('workspace-plan-cost'), !cost);
    renderSources(request, task, state);
    renderExperiment(state);
  }
  doc.addEventListener('click', (event) => {
    const readyTask = event.target.closest('[data-ready-task]');
    if (readyTask) {
      application.setExperiment({ tasks: [readyTask.dataset.readyTask] });
      application.navigate('workbench', 'data');
    }
    const button = event.target.closest('button[data-workspace-section]');
    if (button && !button.dataset.view)
      application.navigate('workbench', button.dataset.workspaceSection);
    if (event.target.closest('[data-experiment-remove]')) {
      const id = event.target.closest('[data-experiment-remove]').dataset.experimentRemove;
      application.setExperiment({
        sources: application.getExperiment().sources.filter((value) => value !== id),
      });
      doc.querySelector(`#workspace-source-list [data-experiment-add="${id}"]`)?.focus();
    }
    if (event.target.closest('[data-experiment-add]'))
      doc
        .querySelector(
          `#workspace-source-list [data-experiment-remove="${event.target.closest('[data-experiment-add]').dataset.experimentAdd}"]`,
        )
        ?.focus();
    const sourceButton = event.target.closest('[data-workspace-source]');
    if (sourceButton) openSubset(sourceButton.dataset.workspaceSource);
    if (event.target.closest('#prepare-add, #classification-add')) {
      if (selectionList().children.length > subsetCount) {
        doc.querySelector('.workspace-subset-dialog[open]')?.close();
        render();
      } else {
        const species = application.selection.task.id === 'species';
        $(species ? 'classification-subset-message' : 'prepare-subset-message').textContent = $(
          species ? 'classification-status' : 'dataset-draft-status',
        ).textContent;
      }
    }
  });
  $('classification-run').addEventListener(
    'click',
    () => {
      rememberExecution();
      application.navigate('workbench', 'runs');
    },
    { capture: true },
  );
  doc.addEventListener('canopy-view', render);
  doc.addEventListener('canopy-joint-state', render);
  doc.addEventListener('canopy-experiment-change', render);
  doc.addEventListener('canopy-task-request', render);
  doc.addEventListener('canopy-task-change', render);
  doc.addEventListener('canopy-workspace-storage-error', render);
  doc.addEventListener('canopy-execution-started', () => {
    rememberExecution();
    application.navigate('workbench', 'runs');
  });
  doc.addEventListener('canopy-prepare-task', (event) =>
    openSubset(String(event.detail.record_id)),
  );
  doc.addEventListener('canopy-plan-reviewed', () => {
    const state = application.getState();
    if (state.view === 'workbench' && ['data', 'review'].includes(state.section))
      application.navigate('workbench', 'review');
  });
  doc.addEventListener('canopy-preparation-state', (event) => {
    running = event.detail.running;
    render();
  });
  const observer = new doc.defaultView.MutationObserver(() => {
    const state = application.getState();
    if (
      !isJoint() &&
      application.selection.task.id === 'species' &&
      state.view === 'workbench' &&
      state.section === 'data' &&
      !$('classification-plan').hidden
    )
      application.navigate('workbench', 'review');
    render();
  });
  for (const id of [
    'classification-plan',
    'dataset-plan',
    'classification-run',
    'prepare-run',
    'classification-review',
    'prepare-review',
  ])
    observer.observe($(id), { attributes: true, attributeFilter: ['hidden', 'disabled'] });
  for (const id of [
    'classification-source',
    'prepare-source',
    'classification-draft-list',
    'dataset-draft-list',
    'saved-runs',
    'classification-saved-runs',
    'classification-plan-text',
    'classification-status',
    'prepare-status',
    'dataset-draft-summary',
    'dataset-draft-status',
  ])
    observer.observe($(id), { childList: true, subtree: true, characterData: true });
  for (const id of ['classification-download', 'prepare-download'])
    observer.observe($(id), { attributes: true, attributeFilter: ['hidden'] });
  doc.addEventListener('change', (event) => {
    if (event.target.matches('[data-workspace-task]')) {
      const tasks = [...doc.querySelectorAll('[data-workspace-task]:checked')].map((input) =>
        input.dataset.workspaceTask.replace('task:', ''),
      );
      application.setExperiment({ tasks });
    }
    if (event.target.matches('[name="experiment-coverage"]'))
      application.setExperiment({ policy: event.target.value });
    if (event.target.id === 'experiment-complete-crowns')
      application.setExperiment({ completeCrowns: event.target.checked });
    if (event.target.matches('#prepare-mode, #prepare-file')) render();
  });
  // A shared draft cannot execute a stale single-task plan through hidden controls.
  for (const type of ['click', 'change'])
    doc.addEventListener(
      type,
      (event) => {
        if (isJoint() && event.target.closest('#workspace-single-task-routes')) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  render();
}
