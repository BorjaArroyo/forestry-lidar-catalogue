import { sameRequest } from './dataset-draft.js';

export function updateControls({document, CustomEvent, busy, session, inspecting, selectedProfile,
  draftPanel, initialized, selectedValues, getRequest, assessment, supported, selectionSummary, planIntent,
  reviewedPlan, reviewedKey, clearPlan, job}) {
const $ = (id) => document.getElementById(id);
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
    if (reviewedPlan && key !== reviewedKey) { clearPlan(); reviewedPlan = null; }
    $('prepare-review').disabled = !supported || running || !intent;
    $('dataset-plan-file').disabled = !supported || running;
    if (mode === 'zenodo' && !reviewedPlan) $('prepare-run').disabled = true;
    $('prepare-cancel').disabled = !session.running;
    $('saved-runs-refresh').disabled = running;
    $('prepare-clear').disabled = running || !job;
    for (const button of $('saved-runs').querySelectorAll?.('button') || [])
      button.disabled = running || button.dataset?.busy === 'true';
  }
