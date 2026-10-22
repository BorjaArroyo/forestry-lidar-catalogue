import { renderSavedRuns } from './saved-runs.js';
import { validJob, lockName } from './run-store.js';

export function createSavedRunsPanel({
  document,
  navigator,
  sessionStorage,
  supported,
  storageKey,
  session,
  inspectRuns,
  openRun,
  spawnWorker,
  isLocked,
  isRunning,
  currentJob,
  remember,
  showExport,
  hideExport,
  status,
  controls,
  beginInteraction,
  endInteraction,
}) {
  let inspecting = false;

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

  async function refreshSaved() {
    if (!supported || session.running || inspecting) return;
    inspecting = true;
    controls();
    try {
      const runs = await inspectRuns();
      renderSavedRuns({
        document,
        runs,
        isRunning,
        onDownload(run, sources, use) {
          if (isLocked()) return;
          remember(run.id);
          showExport(run.file, run.evidence, 'tree-instance-dataset.zip');
          status(`Recovered ZIP for ${sources} / ${use}. Its saved plan describes that run.`);
          controls();
        },
        onResume(run, sources, use) {
          if (isLocked()) return;
          hideExport();
          remember(run.id);
          try {
            session.start(spawnWorker, { operation: 'resume', job: run.id });
            status(`Rechecking saved plan and every completed plot for ${sources} / ${use}…`);
          } catch (error) {
            status('Could not resume preparation: ' + error.message);
          }
          controls();
        },
        async onDelete(run) {
          if (isLocked()) return;
          beginInteraction();
          try {
            await removeJob(run.id);
            if (currentJob() === run.id) {
              remember(null);
              hideExport();
            }
            status('Saved preparation deleted.');
          } catch (error) {
            status('Could not delete preparation: ' + error.message);
          } finally {
            endInteraction();
            await refreshSaved();
          }
        },
      });
      document.getElementById('saved-runs-status').textContent = runs.length
        ? 'Resume rechecks exact versions and every saved block. Browser storage can be cleared by the browser; download completed ZIPs to keep them.'
        : 'No saved preparations in this browser.';
      return runs;
    } catch (error) {
      document.getElementById('saved-runs-status').textContent =
        'Could not inspect saved preparations: ' + error.message;
    } finally {
      inspecting = false;
      controls();
    }
  }

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

  document.getElementById('saved-runs-refresh').onclick = () => refreshSaved();

  return { refreshSaved, recover, removeJob, isInspecting: () => inspecting };
}
