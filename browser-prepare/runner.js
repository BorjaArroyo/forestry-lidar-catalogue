import { prepareSources } from './prepare.js';
import { write, checkQuota } from './storage.js';
import { restoreCheckpoints } from './checkpoints.js';
import { RUN_VERSION, validJob, lockName, readJSON, removeEntry } from './run-store.js';
import { selectPlots } from './selection.js';
import { exportDataset } from './export.js';

function planSources(plan) {
  return plan.schema_version === '1.0.0' ? [plan] : plan.source_plans;
}
function recordsForPlan(plan) {
  return planSources(plan).map((p) => p.task_plan.source_ref.replace(/^zenodo:/, ''));
}

export function createRunner({
  scope,
  browser,
  cryptoProvider,
  runtime,
  digest,
  phase,
  taskForRequest,
  stagePlot,
  preparePlot,
  loadZip,
}) {
  async function run(request) {
    const mode = request.mode || 'las';
    if (!['las', 'zip', 'zenodo'].includes(mode)) throw Error('Unsupported source input mode');
    if (mode !== 'zenodo' && (!(request.file instanceof File) || !request.file.size))
      throw Error('Choose a complete reviewed LAS or ZIP file');
    if (mode === 'zenodo' && !request.execution_plan)
      throw Error('Review the dataset plan before downloading');
    const records =
      mode === 'zenodo' ? recordsForPlan(request.execution_plan) : [request.record_id];
    const origin = await browser.storage.getDirectory();
    const jobs = await origin.getDirectoryHandle('canopy-preparation', { create: true });
    const job = request.job || cryptoProvider.randomUUID();
    if (!validJob(job)) throw Error('Invalid saved run identity');
    const root = await jobs.getDirectoryHandle(job, { create: !request.job });
    scope.postMessage({ type: 'job', id: job });
    return browser.locks.request(lockName(job), { ifAvailable: true }, async (held) => {
      if (!held) throw Error('This run is in use by another page');
      let py;
      try {
        const context = await runtime.loadContext(records);
        const { lock, sources, runtimeHash } = context;
        py = context.py;
        let executionPlan = null;
        if (mode === 'zenodo') {
          try {
            py.globals.set('execution_plan_json', JSON.stringify(request.execution_plan));
            executionPlan = JSON.parse(
              py.runPython(
                'execution_plan = dataset_plan.check_dataset(task_model, source_contexts, json.loads(execution_plan_json), runtime_lock_sha256=runtime_lock_sha256); json.dumps(execution_plan)',
              ),
            );
            const firstTask = planSources(executionPlan)[0].task_plan;
            if (
              JSON.stringify({ use: firstTask.use, variables: firstTask.variables }) !==
              JSON.stringify(request.task_request)
            )
              throw Error('The reviewed plan belongs to different task requirements');
          } catch (error) {
            error.code = 'DATASET_PLAN_STALE';
            throw error;
          }
        }
        const groups = [];
        for (const [record, { source, profile }] of sources) {
          const sourcePlan =
            executionPlan &&
            planSources(executionPlan).find((p) => p.task_plan.source_ref === 'zenodo:' + record);
          if (executionPlan && !sourcePlan) throw Error('Unplanned source in this run');
          const taskPlan = taskForRequest(py, profile, request);
          const candidates =
            mode === 'las'
              ? source.plots.filter((p) => p.size_bytes === request.file.size)
              : selectPlots(
                  source.plots,
                  sourcePlan ? sourcePlan.plots.map((p) => p.path) : request.selected_paths || [],
                );
          if (!candidates.length)
            throw Error(`zenodo:${record}: input does not identify complete reviewed plots`);
          if (
            mode !== 'las' &&
            candidates.some((p) => !taskPlan.allowed_partitions.includes(p.published_split))
          )
            throw Error(`zenodo:${record}: selected partition is excluded for this task use`);
          groups.push({ record, profile, sourcePlan, taskPlan, candidates });
        }
        if (mode === 'zenodo') {
          const saved = {
            schema_version: RUN_VERSION,
            mode,
            execution_plan: executionPlan,
            task_request: request.task_request,
            runtime_lock_sha256: runtimeHash,
          };
          if (request.job) {
            const previous = await readJSON(root, 'run.json');
            if (JSON.stringify(previous) !== JSON.stringify(saved))
              throw Error('Saved run dependencies changed; review a new plan');
          } else await write(root, 'run.json', new TextEncoder().encode(JSON.stringify(saved)));
        }
        // An interrupted export is rebuilt only after all checkpoints validate again.
        await removeEntry(root, 'complete.json');
        await removeEntry(root, 'prepared.zip');
        await removeEntry(root, 'folder-export');
        py.FS.mkdir('/input');
        const reusable = await restoreCheckpoints({
          mode,
          groups,
          root,
          py,
          runtimeHash,
          executionPlan,
          digest,
          phase,
        });
        await checkQuota({
          browser,
          groups,
          mode,
          reusable,
          executionPlan,
          resuming: Boolean(request.job),
        });
        const { prepared, provenance, allManifests } = await prepareSources({
          groups,
          mode,
          root,
          py,
          request,
          lock,
          reusable,
          digest,
          executionPlan,
          runtimeHash,
          phase,
          scope,
          job,
          stagePlot,
          prepare: preparePlot,
        });
        await exportDataset({
          py,
          prepared,
          provenance,
          allManifests,
          executionPlan,
          phase,
          root,
          runtimeHash,
          lock,
          loadZip,
          scope,
          browser,
          job,
        });
      } catch (error) {
        if (mode !== 'zenodo') await jobs.removeEntry(job, { recursive: true }).catch(() => {});
        throw error;
      } finally {
        py?.runPython("prep.reader.close() if 'prep' in globals() else None");
      }
    });
  }

  async function resume(id) {
    if (!validJob(id)) throw Error('Invalid saved run identity');
    const origin = await browser.storage.getDirectory();
    const jobs = await origin.getDirectoryHandle('canopy-preparation');
    const root = await jobs.getDirectoryHandle(id);
    const saved = await readJSON(root, 'run.json');
    if (saved.schema_version !== RUN_VERSION || saved.mode !== 'zenodo')
      throw Error('This historical run cannot be resumed');
    await run({ ...saved, job: id });
  }

  return { run, resume };
}
