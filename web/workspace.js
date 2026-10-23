import { escapeHTML as esc } from './shared/dom.js';

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

export function mountWorkspace({ application, document: doc = document }) {
  const $ = (id) => doc.getElementById(id);
  let running = false;
  function render() {
    const state = application.getState();
    const request = application.getTaskRequest();
    const task = application.selection.task;
    const workspace = state.view === 'workbench';
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
    const next = WORKSPACE_SECTIONS[index + 1];
    $('workspace-next').hidden = !next;
    $('workspace-next').dataset.workspaceSection = next || 'review';
    $('workspace-next').textContent = next ? 'Continue to ' + next : '';
    $('workspace-back').hidden = index <= 0;
    $('workspace-back').dataset.workspaceSection = WORKSPACE_SECTIONS[index - 1] || 'objectives';
    const species = task.id === 'species';
    $('workspace-service-unavailable').hidden = !species;
    $('workspace-service').hidden = species;
    const plan = $(species ? 'classification-plan' : 'dataset-plan');
    const run = $(species ? 'classification-run' : 'prepare-run');
    const review = $(species ? 'classification-review' : 'prepare-review');
    const localInput = !species && $('prepare-mode').value !== 'zenodo';
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
  }
  doc.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-workspace-section]');
    if (button && !button.dataset.view)
      application.navigate('workbench', button.dataset.workspaceSection);
  });
  $('classification-run').addEventListener(
    'click',
    () => application.navigate('workbench', 'runs'),
    { capture: true },
  );
  doc.addEventListener('canopy-view', render);
  doc.addEventListener('canopy-task-request', render);
  doc.addEventListener('canopy-task-change', render);
  doc.addEventListener('canopy-workspace-storage-error', render);
  doc.addEventListener('canopy-execution-started', () => application.navigate('workbench', 'runs'));
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
  render();
}
