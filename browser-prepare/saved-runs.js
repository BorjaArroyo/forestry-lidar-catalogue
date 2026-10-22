import { planSources } from './plan-panel.js';

export function renderSavedRuns({ document, runs, isRunning, onDownload, onResume, onDelete }) {
  const list = document.getElementById('saved-runs');
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
      element.disabled = isRunning() || run.status === 'busy';
      element.onclick = action;
      row.append(element);
    };
    if (run.status === 'complete') button('Download result', () => onDownload(run, sources, use));
    else if (run.resumable) button('Resume', () => onResume(run, sources, use));
    button('Delete', () => onDelete(run));
    list.append(row);
  }
}
