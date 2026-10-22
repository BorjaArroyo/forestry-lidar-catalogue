import { directory, write, checkpointFiles, mountBlocks } from './storage.js';
import { preparePlot } from './prepare.js';
import { validateCheckpoint } from './checkpoints.js';
import { createRuntime } from './runtime.js';
import {
  RUN_VERSION,
  validJob,
  lockName,
  readJSON,
  removeEntry,
  inspectRuns,
} from './run-store.js';
import { selectPlots } from './selection.js';
import { profileForSource } from './profiles.js';
import { extractPlot, localReader, providerReader } from './intake.js';
import { writeArchive } from './export.js';
import { createWorkerController } from './runner.js';
/* Fixed preparation only. User files never leave this worker or this origin. */
const base = new URL('../', self.location.href);
const nativeFetch = self.fetch.bind(self);
const phase = (text) => self.postMessage({ type: 'phase', text });
const digest = async (bytes) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
const runtime = createRuntime({ scope: self, base, nativeFetch, digest, profileForSource, phase });

function planSources(plan) {
  return plan.schema_version === '1.0.0' ? [plan] : plan.source_plans;
}
function recordsForPlan(plan) {
  return planSources(plan).map((p) => p.task_plan.source_ref.replace(/^zenodo:/, ''));
}

function taskForRequest(py, profile, request) {
  py.globals.set('source_record_id', profile.recordId);
  py.globals.set('request_json', JSON.stringify(request.task_request || {}));
  const plan = JSON.parse(
    py.runPython(
      "task_request = json.loads(request_json); task_plan = plan_request(task_model, source_record_id, task_request.get('use', 'training'), task_request.get('variables')); check_plan(task_model, task_plan); json.dumps(task_plan)",
    ),
  );
  if (plan.pipeline_ref !== profile.pipelineRef)
    throw Error('Source implementation differs from the admitted pipeline');
  return plan;
}

async function review(request) {
  if (request.mode !== 'zenodo')
    throw Error('Dataset plan review currently supports Zenodo selections');
  const records =
    request.operation === 'import' ? request.records : request.subsets.map((s) => s.record_id);
  const { py, sources } = await runtime.loadContext(records);
  let plan;
  if (request.operation === 'import') {
    if (typeof request.plan_text !== 'string' || request.plan_text.length > 1048576)
      throw Error('Plan files must be JSON up to 1 MiB');
    py.globals.set('imported_plan_text', request.plan_text);
    plan = JSON.parse(
      py.runPython(
        'from task_package import decode_json; execution_plan = dataset_plan.check_dataset(task_model, source_contexts, decode_json(imported_plan_text), runtime_lock_sha256=runtime_lock_sha256); json.dumps(execution_plan)',
      ),
    );
  } else {
    py.globals.set('request_json', JSON.stringify(request.task_request));
    py.globals.set('subsets_json', JSON.stringify(request.subsets));
    plan = JSON.parse(
      py.runPython(
        "task_request = json.loads(request_json); execution_plan = dataset_plan.resolve_dataset(task_model, source_contexts, use=task_request['use'], variables=task_request['variables'], subsets=json.loads(subsets_json), runtime_lock_sha256=runtime_lock_sha256); json.dumps(execution_plan)",
      ),
    );
  }
  self.postMessage({
    type: 'result',
    operation: request.operation,
    plan,
    source_plots:
      request.operation === 'import'
        ? Object.fromEntries([...sources].map(([record, { source }]) => [record, source.plots]))
        : undefined,
  });
}

async function loadZip(lock) {
  if (!self.zip) {
    const url = URL.createObjectURL(
      new Blob([await runtime.checked(lock.files['zip.min.js'])], { type: 'text/javascript' }),
    );
    try {
      await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    self.zip.configure({ useWebWorkers: false, chunkSize: 1024 ** 2 });
  }
  return self.zip;
}

async function stagePlot(root, request, plot, lock) {
  const zip = await loadZip(lock);
  const profile = profileForSource(request.record_id);
  const asset = profile.archiveForPlot ? profile.archiveForPlot(lock, plot) : lock.provider_archive;
  const remote = request.mode === 'zenodo' ? providerReader(zip, asset, plot, nativeFetch) : null;
  const reader = remote?.reader || localReader(zip, request.file);
  const staged = await root.getFileHandle('source.las', { create: true });
  const access = await staged.createSyncAccessHandle();
  let intake;
  try {
    access.truncate(0);
    intake = await extractPlot(
      zip,
      reader,
      plot,
      (bytes, offset) => {
        let written = 0;
        while (written < bytes.length) {
          const count = access.write(bytes.subarray(written), { at: offset + written });
          if (!count) throw Error('Staged LAS write stopped');
          written += count;
        }
      },
      (received, total) =>
        phase(
          `Extracted ${Math.round(received / 1048576)} of ${Math.ceil(total / 1048576)} MiB for the selected plot…`,
        ),
    );
    access.flush();
  } finally {
    access.close();
  }
  return {
    file: await staged.getFile(),
    intake: {
      kind: request.mode === 'zenodo' ? 'zenodo-ranges' : 'local-zip',
      ...intake,
      ...(remote ? remote.stats : {}),
    },
  };
}

async function run(request) {
  const mode = request.mode || 'las';
  if (!['las', 'zip', 'zenodo'].includes(mode)) throw Error('Unsupported source input mode');
  if (mode !== 'zenodo' && (!(request.file instanceof File) || !request.file.size))
    throw Error('Choose a complete reviewed LAS or ZIP file');
  if (mode === 'zenodo' && !request.execution_plan)
    throw Error('Review the dataset plan before downloading');
  const records = mode === 'zenodo' ? recordsForPlan(request.execution_plan) : [request.record_id];
  const origin = await navigator.storage.getDirectory();
  const jobs = await origin.getDirectoryHandle('canopy-preparation', { create: true });
  const job = request.job || crypto.randomUUID();
  if (!validJob(job)) throw Error('Invalid saved run identity');
  const root = await jobs.getDirectoryHandle(job, { create: !request.job });
  self.postMessage({ type: 'job', id: job });
  return navigator.locks.request(lockName(job), { ifAvailable: true }, async (held) => {
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
      const reusable = new Map();
      if (mode === 'zenodo')
        for (const group of groups) {
          const sourceRoot = await directory(root, 'sources/zenodo-' + group.record);
          await removeEntry(sourceRoot, 'source.las');
          const checkpoints = await directory(sourceRoot, 'checkpoints');
          py.globals.set('current_task_plan_json', JSON.stringify(group.taskPlan));
          py.runPython('task_plan = json.loads(current_task_plan_json)');
          for (const plot of group.candidates) {
            const key = await digest(new TextEncoder().encode(plot.path));
            const outputRoot = '/checkpoints/' + group.record + '/' + key;
            let checkpointRoot;
            try {
              checkpointRoot = await checkpoints.getDirectoryHandle(key);
              const saved = await readJSON(checkpointRoot, 'checkpoint.json');
              if (
                saved.schema_version !== RUN_VERSION ||
                saved.runtime_lock_sha256 !== runtimeHash ||
                saved.plan_sha256 !== executionPlan.plan_sha256
              )
                throw Error('Checkpoint dependency mismatch');
              const files = await checkpointFiles(checkpointRoot, JSON.parse(saved.manifestText));
              await mountBlocks(py, files, outputRoot);
              phase('Revalidating saved plot: ' + group.profile.plotLabel(plot.path));
              validateCheckpoint(py, group.profile, outputRoot, saved.manifestText, plot);
              reusable.set(group.record + ':' + plot.path, { ...saved, files });
            } catch (error) {
              // Unmount invalid files before replacing their storage; never reuse partial arrays.
              try {
                const manifest = await readJSON(checkpointRoot, 'checkpoint.json');
                for (const scene of JSON.parse(manifest.manifestText).scenes) {
                  if (/^[a-zA-Z0-9_-]+$/.test(scene.id)) {
                    try {
                      py.FS.unmount(outputRoot + '/plots/' + scene.id);
                    } catch {
                      /* Not mounted. */
                    }
                  }
                }
              } catch {
                /* A partial checkpoint has no valid manifest. */
              }
              await removeEntry(checkpoints, key);
              if (error.name !== 'NotFoundError')
                phase(
                  'Discarding incomplete or invalid checkpoint: ' +
                    group.profile.plotLabel(plot.path),
                );
            }
          }
        }
      const estimate = await navigator.storage.estimate();
      const candidateBytes = groups.flatMap((g) =>
        g.candidates.map(
          (p) =>
            p.size_bytes +
            p.points * (g.profile.derivedBytesPerPoint || 34) +
            Math.ceil(p.points / 250000) * 65536,
        ),
      );
      const preparedBytes =
        mode === 'las' ? Math.max(...candidateBytes) : candidateBytes.reduce((a, b) => a + b, 0);
      const pendingBytes = groups
        .flatMap((g) =>
          g.candidates
            .filter((p) => !reusable.has(g.record + ':' + p.path))
            .map(
              (p) =>
                p.size_bytes +
                p.points * (g.profile.derivedBytesPerPoint || 34) +
                Math.ceil(p.points / 250000) * 65536,
            ),
        )
        .reduce((a, b) => a + b, 0);
      const stagingBytes = Math.max(
        0,
        ...groups.flatMap((g) =>
          g.candidates
            .filter((p) => !reusable.has(g.record + ':' + p.path))
            .map((p) => p.size_bytes),
        ),
      );
      const required =
        mode === 'zenodo' && request.job
          ? preparedBytes + pendingBytes + stagingBytes + 64 * 1024 ** 2
          : (executionPlan?.totals.estimated_browser_storage_bytes ??
            2 * preparedBytes + (mode === 'las' ? 0 : stagingBytes) + 64 * 1024 ** 2);
      if (!Number.isFinite(estimate.quota) || estimate.quota - (estimate.usage || 0) < required)
        throw Error(
          `Insufficient browser storage; approximately ${Math.ceil(required / 1048576)} MiB free is required for the selected dataset and ZIP export`,
        );
      const prepared = [],
        provenance = [],
        allManifests = [];
      let completedPlots = 0;
      const totalPlots = groups.reduce((n, g) => n + (mode === 'las' ? 1 : g.candidates.length), 0);
      for (const group of groups) {
        const { record, profile, sourcePlan, taskPlan, candidates } = group;
        const sourceRoot = await directory(root, 'sources/zenodo-' + record),
          outputRoot = '/output/zenodo-' + record;
        const files = [],
          manifestTexts = [],
          intakes = [];
        py.FS.mkdirTree(outputRoot);
        try {
          py.globals.set('current_task_plan_json', JSON.stringify(taskPlan));
          py.runPython('task_plan = json.loads(current_task_plan_json)');
          for (const plot of mode === 'las' ? [null] : candidates) {
            phase(
              `zenodo:${record}: reading plot ${completedPlots + 1} of ${totalPlots}${plot ? ': ' + profile.plotLabel(plot.path) : ''}…`,
            );
            let result,
              intake,
              sceneFiles = [];
            const cached = plot && reusable.get(record + ':' + plot.path);
            if (cached) {
              result = {
                manifest: JSON.parse(cached.manifestText),
                manifestText: cached.manifestText,
              };
              intake = cached.intake;
              sceneFiles = cached.files;
              phase('Reusing independently validated plot: ' + profile.plotLabel(plot.path));
            } else {
              let file = request.file;
              intake = {
                kind: 'local-las',
                archive_verification: 'Selected LAS SHA256 verified; provider ZIP not checked',
              };
              let plotRoot = sourceRoot,
                plotOutput = outputRoot;
              if (mode === 'zenodo') {
                const key = await digest(new TextEncoder().encode(plot.path));
                plotRoot = await directory(sourceRoot, 'checkpoints/' + key);
                plotOutput = '/new-checkpoints/' + record + '/' + key;
              }
              if (plot)
                ({ file, intake } = await stagePlot(
                  sourceRoot,
                  { ...request, record_id: record, mode },
                  plot,
                  lock,
                ));
              result = await preparePlot(
                py,
                plotRoot,
                file,
                profile,
                taskPlan,
                plot?.path,
                sceneFiles,
                plotOutput,
                phase,
              );
              if (mode === 'zenodo') {
                phase('Independently validating plot before saving its checkpoint…');
                const validation = validateCheckpoint(
                  py,
                  profile,
                  plotOutput,
                  result.manifestText,
                  plot,
                );
                await write(
                  plotRoot,
                  'checkpoint.json',
                  new TextEncoder().encode(
                    JSON.stringify({
                      schema_version: RUN_VERSION,
                      runtime_lock_sha256: runtimeHash,
                      plan_sha256: executionPlan.plan_sha256,
                      manifestText: result.manifestText,
                      intake,
                      validation,
                    }),
                  ),
                );
                self.postMessage({ type: 'checkpoint', job, record, path: plot.path });
              }
              if (plot) await sourceRoot.removeEntry('source.las');
            }
            if (mode === 'zenodo') await mountBlocks(py, sceneFiles, outputRoot);
            files.push(...sceneFiles);
            manifestTexts.push(result.manifestText);
            intakes.push({ path: result.manifest.scenes[0].path, ...intake });
            completedPlots++;
          }
          py.globals.set('manifests_json', JSON.stringify(manifestTexts));
          const manifestText =
            py.runPython(
              'json.dumps(combine_manifests([json.loads(text) for text in json.loads(manifests_json)]), indent=2)',
            ) + '\n';
          const manifest = JSON.parse(manifestText);
          allManifests.push(manifestText);
          py.FS.writeFile(outputRoot + '/task-package.json', manifestText);
          phase(`zenodo:${record}: independently validating every prepared array…`);
          const taskValidation = profile.validate(py, outputRoot);
          const sourceEvidence = {
            task_plan: taskPlan,
            task_validation: taskValidation,
            prepared_scenes: manifest.scenes,
            selection: manifest.selection,
            intake:
              intakes.length === 1 ? intakes[0] : { kind: 'selected-dataset', plots: intakes },
          };
          prepared.push({ record, manifestText, taskPlan, files, evidence: sourceEvidence });
          const documents = {
            'selection-task-package.json': manifestText,
            'task-plan.json': JSON.stringify(taskPlan, null, 2),
            'task-validation.json': JSON.stringify(taskValidation, null, 2),
          };
          if (sourcePlan) {
            py.globals.set('source_plan_json', JSON.stringify(sourcePlan));
            py.globals.set('source_manifest_json', manifestText);
            sourceEvidence.plan_validation = JSON.parse(
              py.runPython(
                'json.dumps(dataset_plan.check_manifest(json.loads(source_plan_json), json.loads(source_manifest_json)))',
              ),
            );
            documents['dataset-plan.json'] = JSON.stringify(sourcePlan, null, 2);
            documents['dataset-plan-validation.json'] = JSON.stringify(
              sourceEvidence.plan_validation,
              null,
              2,
            );
          }
          for (const [name, text] of Object.entries(documents))
            provenance.push({
              path: `provenance/zenodo-${record}/${name}`,
              handle: await write(sourceRoot, name, new TextEncoder().encode(text)),
            });
        } catch (error) {
          error.message = `zenodo:${record}: ${error.message}`;
          throw error;
        }
      }
      py.globals.set('all_manifests_json', JSON.stringify(allManifests));
      py.globals.set('all_plans_json', JSON.stringify(prepared.map((p) => p.taskPlan)));
      py.runPython(
        'source_manifests = [json.loads(text) for text in json.loads(all_manifests_json)]; source_task_plans = json.loads(all_plans_json)',
      );
      const planValidation = executionPlan
        ? JSON.parse(
            py.runPython(
              'json.dumps(dataset_plan.check_manifests(execution_plan, source_manifests))',
            ),
          )
        : null;
      phase('Organizing all sources into preserved partition folders…');
      const layout = JSON.parse(
        py.runPython(
          "folder_layout = compose_layout(task_model, [dict(plan=plan, manifest=manifest) for plan, manifest in zip(source_task_plans, source_manifests)]); json.dumps(dict(copies=folder_layout['copies'], documents={k:encoded(v).decode() for k,v in folder_layout['documents'].items()}))",
        ),
      );
      const blocks = prepared.map((p) => new Map(p.files.map((f) => [f.path, f]))),
        exportFiles = [],
        mounts = new Map();
      for (const [path, source] of Object.entries(layout.copies)) {
        const block = blocks[source.input]?.get(source.path);
        if (!block) throw Error('Dataset layout refers to an absent prepared block');
        exportFiles.push({ path, handle: block.handle });
        const parent = path.slice(0, path.lastIndexOf('/'));
        if (!mounts.has(parent)) mounts.set(parent, []);
        mounts
          .get(parent)
          .push({ name: path.split('/').at(-1), data: await block.handle.getFile() });
      }
      for (const [parent, blobs] of mounts) {
        py.FS.mkdirTree('/dataset/' + parent);
        py.FS.mount(py.FS.filesystems.WORKERFS, { blobs }, '/dataset/' + parent);
      }
      for (const [path, text] of Object.entries(layout.documents)) {
        const target = '/dataset/' + path;
        py.FS.mkdirTree(target.slice(0, target.lastIndexOf('/')));
        py.FS.writeFile(target, text);
        exportFiles.push({
          path,
          handle: await write(root, 'folder-export/' + path, new TextEncoder().encode(text)),
        });
      }
      phase('Validating the complete combined dataset through the independent folder reader…');
      const datasetReport = JSON.parse(
        py.runPython(
          "folder_dataset = TaskDataset('/dataset', task_model); folder_report = folder_dataset.validate(); json.dumps(folder_report)",
        ),
      );
      const requestSummary = {
        use: prepared[0].taskPlan.use,
        variables: prepared[0].taskPlan.variables,
      };
      const report = {
        status: 'validated',
        plots: datasetReport.scenes,
        points: datasetReport.points,
        chunks: prepared.reduce((n, p) => n + p.evidence.task_validation.package.chunks, 0),
      };
      const evidence = {
        status: 'validated',
        request: requestSummary,
        sources: prepared.map((p) => p.evidence),
        report,
        dataset: datasetReport,
        prepared_scenes: prepared.flatMap((p) => p.evidence.prepared_scenes),
        runtime: {
          pyodide: lock.pyodide,
          python: lock.python,
          numpy: lock.numpy,
          laspy: lock.laspy,
          zip_js: lock.zip_js,
        },
        runtime_lock_sha256: runtimeHash,
        dataset_plan: executionPlan,
        dataset_plan_validation: planValidation,
        user_agent: navigator.userAgent,
        limitations: [
          'Selected LAS SHA256 verified; whole-provider-archive checksums not checked in this run',
          'Optional missing variables are omitted; no values fabricated',
          'Published partitions do not establish geographic independence',
          'OPFS is temporary storage; export the ZIP before clearing it',
        ],
      };
      const documents = { 'dataset-validation.json': datasetReport, 'browser-run.json': evidence };
      if (executionPlan)
        Object.assign(documents, {
          'dataset-plan.json': executionPlan,
          'dataset-plan-validation.json': planValidation,
        });
      for (const [path, value] of Object.entries(documents))
        exportFiles.push({
          path,
          handle: await write(
            root,
            'folder-export/' + path,
            new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n'),
          ),
        });
      phase('Writing the downloadable ZIP from browser storage…');
      const zip = await loadZip(lock);
      const outputFile = await writeArchive(zip, root, [...exportFiles, ...provenance]);
      await write(
        root,
        'complete.json',
        new TextEncoder().encode(JSON.stringify({ size_bytes: outputFile.size, evidence })),
      );
      self.postMessage({ type: 'result', job, file: outputFile, evidence });
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
  const origin = await navigator.storage.getDirectory();
  const jobs = await origin.getDirectoryHandle('canopy-preparation');
  const root = await jobs.getDirectoryHandle(id);
  const saved = await readJSON(root, 'run.json');
  if (saved.schema_version !== RUN_VERSION || saved.mode !== 'zenodo')
    throw Error('This historical run cannot be resumed');
  await run({ ...saved, job: id });
}

self.onmessage = createWorkerController({
  scope: self,
  inspect: inspectRuns,
  review,
  resume,
  run,
});
