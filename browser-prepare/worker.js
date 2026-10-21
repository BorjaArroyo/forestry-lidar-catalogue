import {RUN_VERSION, validJob, lockName, readJSON, removeEntry, inspectRuns} from './run-store.js';
import {selectPlots} from './selection.js';
import {profileForSource} from './profiles.js';
import {extractPlot, localReader, providerReader} from './intake.js';
/* Fixed preparation only. User files never leave this worker or this origin. */
const base = new URL('../', self.location.href);
const nativeFetch = self.fetch.bind(self);
const phase = text => self.postMessage({type: 'phase', text});
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(x => x.toString(16).padStart(2, '0')).join('');
let active = false;

async function checked(entry) {
  const response = await nativeFetch(new URL(entry.url, base), {cache: 'no-cache', signal: AbortSignal.timeout(120000)});
  if (!response.ok) throw Error(`Artifact HTTP ${response.status}: ${entry.url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== entry.size_bytes || await digest(bytes) !== entry.sha256)
    throw Error(`Artifact integrity mismatch: ${entry.url}`);
  return bytes;
}

async function boot(lock) {
  const cache = new Map();
  const byURL = new Map(Object.values(lock.files).map(entry => [new URL(entry.url, base).href, entry]));
  async function asset(name) {
    const entry = lock.files[name];
    if (!entry) throw Error(`Unpinned runtime artifact: ${name}`);
    return checked(entry);
  }
  // Pyodide's own runtime/package fetches must pass the same pinned checks.
  self.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input), base).href;
    if (url.startsWith('blob:')) return nativeFetch(input, options);
    const entry = byURL.get(url);
    if (!entry) throw Error(`Runtime requested an unpinned artifact: ${url}`);
    if (!cache.has(url)) cache.set(url, checked(entry));
    return new Response(await cache.get(url), {headers: {'Content-Type': url.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'}});
  };
  const blobURL = (bytes, type = 'text/javascript') => URL.createObjectURL(new Blob([bytes], {type}));
  const bootstrapURL = blobURL(await asset('pyodide.mjs'));
  const moduleURL = blobURL(await asset('pyodide.asm.mjs'));
  const stdlibURL = blobURL(await asset('python_stdlib.zip'), 'application/zip');
  try {
    const {loadPyodide} = await import(bootstrapURL);
    const createPyodideModule = (await import(moduleURL)).default;
    const py = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/',
      packageBaseUrl: 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/',
      lockFileContents: JSON.parse(new TextDecoder().decode(await asset('pyodide-lock.json'))),
      stdLibURL: stdlibURL, createPyodideModule,
      stdout: () => {}, stderr: text => console.warn(text),
    });
    await py.loadPackage(['numpy', 'jsonschema'], {errorCallback: message => { throw Error(message); }});
    for (const name of ['laspy-2.7.0-py3-none-any.whl', 'filelock-4.0.12-py3-none-any.whl']) {
      py.FS.writeFile('/' + name, await asset(name));
      py.runPython(`import sys; sys.path.insert(0, '/${name}')`);
    }
    for (const [name, entry] of Object.entries(lock.files)) {
      if (!name.startsWith('scripts/') && !['task-package.schema.json', 'task-dataset.schema.json', 'dataset-plan.schema.json', 'knowledge-model.json', 'knowledge-model.schema.json', 'browser-prepare/kernel.py', 'browser-prepare/batch.py'].includes(name)) continue;
      const path = '/app/' + name;
      py.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
      py.FS.writeFile(path, await checked(entry));
    }
    py.runPython("import sys; sys.path[:0] = ['/app/browser-prepare', '/app/scripts']; from kernel import Preparation; from batch import combine_manifests; from task_package import TaskPackage; from task_dataset import compose_layout, encoded, TaskDataset; from task_plan import plan_request, check_plan, validate_prepared, iter_task_blocks; from knowledge_model import load as load_model; import dataset_plan; import json, numpy, laspy, platform");
    const versions = JSON.parse(py.runPython("json.dumps(dict(python=platform.python_version(), numpy=numpy.__version__, laspy=laspy.__version__))"));
    for (const name of ['python', 'numpy', 'laspy']) if (versions[name] !== lock[name]) throw Error(`Runtime version mismatch: ${name}`);
    cache.clear();
    return py;
  } finally {
    for (const url of [bootstrapURL, moduleURL, stdlibURL]) URL.revokeObjectURL(url);
  }
}

async function loadContext(records) {
  const response = await nativeFetch(new URL('browser-prepare/runtime-lock.json', base), {cache:'no-store'});
  if (!response.ok) throw Error('Runtime lock unavailable');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const lock = JSON.parse(new TextDecoder().decode(bytes)), sources = new Map(), contexts = {};
  for (const record of [...new Set(records)].sort()) {
    const profile = profileForSource(record);
    if (!profile) throw Error(`zenodo:${record}: no browser implementation for this reviewed source`);
    const sourceBytes = await checked(lock.files[profile.sourceLock]);
    const source = JSON.parse(new TextDecoder().decode(sourceBytes));
    if (String(source.record_id) !== record) throw Error('Reviewed source membership belongs to another release');
    sources.set(record, {source, profile});
    contexts[record] = {source, source_lock_path:profile.sourceLock, source_lock_sha256:await digest(sourceBytes)};
  }
  for (const path of ['browser-prepare/worker.js', 'browser-prepare/run-store.js', 'browser-prepare/intake.js', 'browser-prepare/selection.js', 'browser-prepare/profiles.js', 'browser-prepare/profiles/for-instance.js', 'browser-prepare/profiles/fgi-emit.js']) await checked(lock.files[path]);
  phase('Checking task requirements and exact versions for every source; no source LAS is downloaded yet…');
  const py = await boot(lock), runtimeHash = await digest(bytes);
  py.globals.set('source_contexts_json', JSON.stringify(contexts));
  py.globals.set('runtime_lock_sha256', runtimeHash);
  py.runPython("task_model = load_model('/app/knowledge-model.json'); source_contexts = json.loads(source_contexts_json)");
  return {lock, sources, py, runtimeHash};
}

function planSources(plan) { return plan.schema_version === '1.0.0' ? [plan] : plan.source_plans; }
function recordsForPlan(plan) { return planSources(plan).map(p => p.task_plan.source_ref.replace(/^zenodo:/, '')); }

function taskForRequest(py, profile, request) {
  py.globals.set('source_record_id', profile.recordId);
  py.globals.set('request_json', JSON.stringify(request.task_request || {}));
  const plan = JSON.parse(py.runPython("task_request = json.loads(request_json); task_plan = plan_request(task_model, source_record_id, task_request.get('use', 'training'), task_request.get('variables')); check_plan(task_model, task_plan); json.dumps(task_plan)"));
  if (plan.pipeline_ref !== profile.pipelineRef) throw Error('Source implementation differs from the admitted pipeline');
  return plan;
}

async function review(request) {
  if (request.mode !== 'zenodo') throw Error('Dataset plan review currently supports Zenodo selections');
  const records = request.operation === 'import' ? request.records : request.subsets.map(s => s.record_id);
  const {py, sources} = await loadContext(records);
  let plan;
  if (request.operation === 'import') {
    if (typeof request.plan_text !== 'string' || request.plan_text.length > 1048576) throw Error('Plan files must be JSON up to 1 MiB');
    py.globals.set('imported_plan_text', request.plan_text);
    plan = JSON.parse(py.runPython("from task_package import decode_json; execution_plan = dataset_plan.check_dataset(task_model, source_contexts, decode_json(imported_plan_text), runtime_lock_sha256=runtime_lock_sha256); json.dumps(execution_plan)"));
  } else {
    py.globals.set('request_json', JSON.stringify(request.task_request));
    py.globals.set('subsets_json', JSON.stringify(request.subsets));
    plan = JSON.parse(py.runPython("task_request = json.loads(request_json); execution_plan = dataset_plan.resolve_dataset(task_model, source_contexts, use=task_request['use'], variables=task_request['variables'], subsets=json.loads(subsets_json), runtime_lock_sha256=runtime_lock_sha256); json.dumps(execution_plan)"));
  }
  self.postMessage({type:'result', operation:request.operation, plan,
    source_plots:request.operation === 'import' ? Object.fromEntries([...sources].map(([record, {source}]) => [record, source.plots])) : undefined});
}

async function directory(root, path) {
  let current = root;
  for (const part of path.split('/').filter(Boolean)) current = await current.getDirectoryHandle(part, {create: true});
  return current;
}

async function write(root, path, bytes) {
  const parts = path.split('/');
  const parent = await directory(root, parts.slice(0, -1).join('/'));
  const file = await parent.getFileHandle(parts.at(-1), {create: true});
  const handle = await file.createSyncAccessHandle();
  try {
    handle.truncate(0);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = handle.write(bytes.subarray(offset), {at: offset});
      if (!count) throw Error('Browser storage write stopped');
      offset += count;
    }
    handle.flush();
  } finally { handle.close(); }
  return file;
}

async function loadZip(lock) {
  if (!self.zip) {
    const url = URL.createObjectURL(new Blob([await checked(lock.files['zip.min.js'])], {type: 'text/javascript'}));
    try { await import(url); } finally { URL.revokeObjectURL(url); }
    self.zip.configure({useWebWorkers: false, chunkSize: 1024 ** 2});
  }
  return self.zip;
}

async function stagePlot(root, request, plot, lock) {
  const zip = await loadZip(lock);
  const profile = profileForSource(request.record_id);
  const asset = profile.archiveForPlot ? profile.archiveForPlot(lock, plot) : lock.provider_archive;
  const remote = request.mode === 'zenodo' ? providerReader(zip, asset, plot, nativeFetch) : null;
  const reader = remote?.reader || localReader(zip, request.file);
  const staged = await root.getFileHandle('source.las', {create: true});
  const access = await staged.createSyncAccessHandle();
  let intake;
  try {
    access.truncate(0);
    intake = await extractPlot(zip, reader, plot, (bytes, offset) => {
      let written = 0;
      while (written < bytes.length) {
        const count = access.write(bytes.subarray(written), {at: offset + written});
        if (!count) throw Error('Staged LAS write stopped');
        written += count;
      }
    }, (received, total) => phase(`Extracted ${Math.round(received / 1048576)} of ${Math.ceil(total / 1048576)} MiB for the selected plot…`));
    access.flush();
  } finally { access.close(); }
  return {file: await staged.getFile(), intake: {kind: request.mode === 'zenodo' ? 'zenodo-ranges' : 'local-zip',
    ...intake, ...(remote ? remote.stats : {})}};
}

async function preparePlot(py, root, file, profile, taskPlan, expectedPath, files, outputRoot) {
  py.FS.mount(py.FS.filesystems.WORKERFS, {blobs: [{name: 'source.las', data: file}]}, '/input');
  try {
    phase('Verifying the complete source LAS against the reviewed SHA256…');
    profile.start(py);
    const scene = JSON.parse(py.runPython('json.dumps(prep.scene)'));
    if (!taskPlan.allowed_partitions.includes(scene.published_split)) throw Error('Source belongs to a published partition excluded from this task use');
    if (expectedPath && scene.path !== expectedPath) throw Error('Extracted LAS belongs to a different reviewed plot');
    const sceneFiles = [];
    for (;;) {
      const chunk = JSON.parse(py.runPython("json.dumps(prep.next_block('/chunk.npz'))"));
      if (!chunk) break;
      // One source and one output block at a time, regardless of dataset size.
      const handle = await write(root, chunk.path, py.FS.readFile('/chunk.npz'));
      py.FS.unlink('/chunk.npz');
      sceneFiles.push({path: chunk.path, handle});
      phase(`Prepared ${(chunk.offset + chunk.points).toLocaleString()} of ${scene.points.toLocaleString()} points in ${profile.plotLabel(scene.path)}…`);
    }
    files.push(...sceneFiles);
    py.FS.mkdirTree(outputRoot + '/plots/' + scene.id);
    const mounted = await Promise.all(sceneFiles.map(async f => ({name: f.path.split('/').at(-1), data: await f.handle.getFile()})));
    py.FS.mount(py.FS.filesystems.WORKERFS, {blobs: mounted}, outputRoot + '/plots/' + scene.id);
    // Keep the authoritative JSON text: JavaScript otherwise turns 1.0 into 1 in native schema descriptors.
    const manifestText = py.runPython('json.dumps(prep.manifest)');
    return {manifest: JSON.parse(manifestText), manifestText};
  } finally {
    py.runPython("prep.reader.close() if 'prep' in globals() else None");
    py.FS.unmount('/input');
  }
}

async function checkpointFiles(root, manifest) {
  const files = [];
  for (const scene of manifest.scenes) for (const chunk of scene.chunks) {
    if (!/^plots\/[a-zA-Z0-9_-]+\/[0-9]+\.npz$/.test(chunk.path)) throw Error('Invalid checkpoint block path');
    const parts = chunk.path.split('/');
    let parent = root;
    for (const part of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(part);
    files.push({path:chunk.path, handle:await parent.getFileHandle(parts.at(-1))});
  }
  return files;
}

async function mountBlocks(py, files, outputRoot) {
  const mounts = new Map();
  for (const file of files) {
    const parent = file.path.slice(0, file.path.lastIndexOf('/'));
    if (!mounts.has(parent)) mounts.set(parent, []);
    mounts.get(parent).push({name:file.path.split('/').at(-1), data:await file.handle.getFile()});
  }
  for (const [parent, blobs] of mounts) {
    py.FS.mkdirTree(outputRoot + '/' + parent);
    py.FS.mount(py.FS.filesystems.WORKERFS, {blobs}, outputRoot + '/' + parent);
  }
}

function validateCheckpoint(py, profile, outputRoot, manifestText, plot) {
  py.globals.set('checkpoint_manifest_text', manifestText);
  py.globals.set('checkpoint_plot_json', JSON.stringify(plot));
  py.runPython("checkpoint_manifest = json.loads(checkpoint_manifest_text); checkpoint_plot = json.loads(checkpoint_plot_json)\nif len(checkpoint_manifest['scenes']) != 1: raise ValueError('Checkpoint must contain exactly one plot')\ncheckpoint_scene = checkpoint_manifest['scenes'][0]\nif any(checkpoint_scene[k] != checkpoint_plot[k] for k in ['path', 'sha256', 'points', 'published_split']): raise ValueError('Checkpoint differs from reviewed plot')");
  py.FS.writeFile(outputRoot + '/task-package.json', manifestText);
  return profile.validate(py, outputRoot);
}

async function run(request) {
  const mode = request.mode || 'las';
  if (!['las', 'zip', 'zenodo'].includes(mode)) throw Error('Unsupported source input mode');
  if (mode !== 'zenodo' && (!(request.file instanceof File) || !request.file.size)) throw Error('Choose a complete reviewed LAS or ZIP file');
  if (mode === 'zenodo' && !request.execution_plan) throw Error('Review the dataset plan before downloading');
  const records = mode === 'zenodo' ? recordsForPlan(request.execution_plan) : [request.record_id];
  const origin = await navigator.storage.getDirectory();
  const jobs = await origin.getDirectoryHandle('canopy-preparation', {create:true});
  const job = request.job || crypto.randomUUID();
  if (!validJob(job)) throw Error('Invalid saved run identity');
  const root = await jobs.getDirectoryHandle(job, {create:!request.job});
  self.postMessage({type:'job', id:job});
  return navigator.locks.request(lockName(job), {ifAvailable:true}, async held => {
    if (!held) throw Error('This run is in use by another page');
    let py;
    try {
      const context = await loadContext(records);
      const {lock, sources, runtimeHash} = context; py = context.py;
      let executionPlan = null;
      if (mode === 'zenodo') {
        try {
          py.globals.set('execution_plan_json', JSON.stringify(request.execution_plan));
          executionPlan = JSON.parse(py.runPython("execution_plan = dataset_plan.check_dataset(task_model, source_contexts, json.loads(execution_plan_json), runtime_lock_sha256=runtime_lock_sha256); json.dumps(execution_plan)"));
          const firstTask = planSources(executionPlan)[0].task_plan;
          if (JSON.stringify({use:firstTask.use, variables:firstTask.variables}) !== JSON.stringify(request.task_request)) throw Error('The reviewed plan belongs to different task requirements');
        } catch (error) { error.code = 'DATASET_PLAN_STALE'; throw error; }
      }
      const groups = [];
      for (const [record, {source, profile}] of sources) {
        const sourcePlan = executionPlan && planSources(executionPlan).find(p => p.task_plan.source_ref === 'zenodo:' + record);
        if (executionPlan && !sourcePlan) throw Error('Unplanned source in this run');
        const taskPlan = taskForRequest(py, profile, request);
        const candidates = mode === 'las' ? source.plots.filter(p => p.size_bytes === request.file.size) :
          selectPlots(source.plots, sourcePlan ? sourcePlan.plots.map(p => p.path) : request.selected_paths || []);
        if (!candidates.length) throw Error(`zenodo:${record}: input does not identify complete reviewed plots`);
        if (mode !== 'las' && candidates.some(p => !taskPlan.allowed_partitions.includes(p.published_split))) throw Error(`zenodo:${record}: selected partition is excluded for this task use`);
        groups.push({record, profile, sourcePlan, taskPlan, candidates});
      }
      if (mode === 'zenodo') {
        const saved = {schema_version:RUN_VERSION, mode, execution_plan:executionPlan, task_request:request.task_request, runtime_lock_sha256:runtimeHash};
        if (request.job) {
          const previous = await readJSON(root, 'run.json');
          if (JSON.stringify(previous) !== JSON.stringify(saved)) throw Error('Saved run dependencies changed; review a new plan');
        } else await write(root, 'run.json', new TextEncoder().encode(JSON.stringify(saved)));
      }
      // An interrupted export is rebuilt only after all checkpoints validate again.
      await removeEntry(root, 'complete.json');
      await removeEntry(root, 'prepared.zip');
      await removeEntry(root, 'folder-export');
      py.FS.mkdir('/input');
      const reusable = new Map();
      if (mode === 'zenodo') for (const group of groups) {
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
            if (saved.schema_version !== RUN_VERSION || saved.runtime_lock_sha256 !== runtimeHash || saved.plan_sha256 !== executionPlan.plan_sha256)
              throw Error('Checkpoint dependency mismatch');
            const files = await checkpointFiles(checkpointRoot, JSON.parse(saved.manifestText));
            await mountBlocks(py, files, outputRoot);
            phase('Revalidating saved plot: ' + group.profile.plotLabel(plot.path));
            validateCheckpoint(py, group.profile, outputRoot, saved.manifestText, plot);
            reusable.set(group.record + ':' + plot.path, {...saved, files});
          } catch (error) {
            // Unmount invalid files before replacing their storage; never reuse partial arrays.
            try {
              const manifest = await readJSON(checkpointRoot, 'checkpoint.json');
              for (const scene of JSON.parse(manifest.manifestText).scenes) {
                if (/^[a-zA-Z0-9_-]+$/.test(scene.id)) {
                  try { py.FS.unmount(outputRoot + '/plots/' + scene.id); } catch { /* Not mounted. */ }
                }
              }
            } catch { /* A partial checkpoint has no valid manifest. */ }
            await removeEntry(checkpoints, key);
            if (error.name !== 'NotFoundError') phase('Discarding incomplete or invalid checkpoint: ' + group.profile.plotLabel(plot.path));
          }
        }
      }
      const estimate = await navigator.storage.estimate();
      const candidateBytes = groups.flatMap(g => g.candidates.map(p => p.size_bytes + p.points * (g.profile.derivedBytesPerPoint || 34) + Math.ceil(p.points / 250000) * 65536));
      const preparedBytes = mode === 'las' ? Math.max(...candidateBytes) : candidateBytes.reduce((a,b) => a+b, 0);
      const pendingBytes = groups.flatMap(g => g.candidates.filter(p => !reusable.has(g.record + ':' + p.path)).map(p =>
        p.size_bytes + p.points * (g.profile.derivedBytesPerPoint || 34) + Math.ceil(p.points / 250000) * 65536)).reduce((a,b) => a+b, 0);
      const stagingBytes = Math.max(0, ...groups.flatMap(g => g.candidates.filter(p => !reusable.has(g.record + ':' + p.path)).map(p => p.size_bytes)));
      const required = mode === 'zenodo' && request.job ? preparedBytes + pendingBytes + stagingBytes + 64 * 1024 ** 2 :
        executionPlan?.totals.estimated_browser_storage_bytes ?? (2 * preparedBytes + (mode === 'las' ? 0 : stagingBytes) + 64 * 1024 ** 2);
      if (!Number.isFinite(estimate.quota) || estimate.quota - (estimate.usage || 0) < required)
        throw Error(`Insufficient browser storage; approximately ${Math.ceil(required / 1048576)} MiB free is required for the selected dataset and ZIP export`);
      const prepared = [], provenance = [], allManifests = [];
      let completedPlots = 0;
      const totalPlots = groups.reduce((n,g) => n + (mode === 'las' ? 1 : g.candidates.length), 0);
      for (const group of groups) {
        const {record, profile, sourcePlan, taskPlan, candidates} = group;
        const sourceRoot = await directory(root, 'sources/zenodo-' + record), outputRoot = '/output/zenodo-' + record;
        const files = [], manifestTexts = [], intakes = [];
        py.FS.mkdirTree(outputRoot);
        try {
          py.globals.set('current_task_plan_json', JSON.stringify(taskPlan));
          py.runPython('task_plan = json.loads(current_task_plan_json)');
          for (const plot of mode === 'las' ? [null] : candidates) {
            phase(`zenodo:${record}: reading plot ${completedPlots + 1} of ${totalPlots}${plot ? ': ' + profile.plotLabel(plot.path) : ''}…`);
            let result, intake, sceneFiles = [];
            const cached = plot && reusable.get(record + ':' + plot.path);
            if (cached) {
              result = {manifest:JSON.parse(cached.manifestText), manifestText:cached.manifestText};
              intake = cached.intake; sceneFiles = cached.files;
              phase('Reusing independently validated plot: ' + profile.plotLabel(plot.path));
            } else {
              let file = request.file;
              intake = {kind:'local-las', archive_verification:'Selected LAS SHA256 verified; provider ZIP not checked'};
              let plotRoot = sourceRoot, plotOutput = outputRoot;
              if (mode === 'zenodo') {
                const key = await digest(new TextEncoder().encode(plot.path));
                plotRoot = await directory(sourceRoot, 'checkpoints/' + key);
                plotOutput = '/new-checkpoints/' + record + '/' + key;
              }
              if (plot) ({file, intake} = await stagePlot(sourceRoot, {...request, record_id:record, mode}, plot, lock));
              result = await preparePlot(py, plotRoot, file, profile, taskPlan, plot?.path, sceneFiles, plotOutput);
              if (mode === 'zenodo') {
                phase('Independently validating plot before saving its checkpoint…');
                const validation = validateCheckpoint(py, profile, plotOutput, result.manifestText, plot);
                await write(plotRoot, 'checkpoint.json', new TextEncoder().encode(JSON.stringify({
                  schema_version:RUN_VERSION, runtime_lock_sha256:runtimeHash, plan_sha256:executionPlan.plan_sha256,
                  manifestText:result.manifestText, intake, validation,
                })));
                self.postMessage({type:'checkpoint', job, record, path:plot.path});
              }
              if (plot) await sourceRoot.removeEntry('source.las');
            }
            if (mode === 'zenodo') await mountBlocks(py, sceneFiles, outputRoot);
            files.push(...sceneFiles);
            manifestTexts.push(result.manifestText); intakes.push({path:result.manifest.scenes[0].path, ...intake});
            completedPlots++;
          }
          py.globals.set('manifests_json', JSON.stringify(manifestTexts));
          const manifestText = py.runPython('json.dumps(combine_manifests([json.loads(text) for text in json.loads(manifests_json)]), indent=2)') + '\n';
          const manifest = JSON.parse(manifestText); allManifests.push(manifestText);
          py.FS.writeFile(outputRoot + '/task-package.json', manifestText);
          phase(`zenodo:${record}: independently validating every prepared array…`);
          const taskValidation = profile.validate(py, outputRoot);
          const sourceEvidence = {task_plan:taskPlan, task_validation:taskValidation, prepared_scenes:manifest.scenes,
            selection:manifest.selection, intake:intakes.length === 1 ? intakes[0] : {kind:'selected-dataset', plots:intakes}};
          prepared.push({record, manifestText, taskPlan, files, evidence:sourceEvidence});
          const documents = {'selection-task-package.json':manifestText, 'task-plan.json':JSON.stringify(taskPlan, null, 2), 'task-validation.json':JSON.stringify(taskValidation, null, 2)};
          if (sourcePlan) {
            py.globals.set('source_plan_json', JSON.stringify(sourcePlan));
            py.globals.set('source_manifest_json', manifestText);
            sourceEvidence.plan_validation = JSON.parse(py.runPython('json.dumps(dataset_plan.check_manifest(json.loads(source_plan_json), json.loads(source_manifest_json)))'));
            documents['dataset-plan.json'] = JSON.stringify(sourcePlan, null, 2);
            documents['dataset-plan-validation.json'] = JSON.stringify(sourceEvidence.plan_validation, null, 2);
          }
          for (const [name, text] of Object.entries(documents)) provenance.push({path:`provenance/zenodo-${record}/${name}`, handle:await write(sourceRoot, name, new TextEncoder().encode(text))});
        } catch (error) { error.message = `zenodo:${record}: ${error.message}`; throw error; }
      }
      py.globals.set('all_manifests_json', JSON.stringify(allManifests));
      py.globals.set('all_plans_json', JSON.stringify(prepared.map(p => p.taskPlan)));
      py.runPython('source_manifests = [json.loads(text) for text in json.loads(all_manifests_json)]; source_task_plans = json.loads(all_plans_json)');
      const planValidation = executionPlan ? JSON.parse(py.runPython('json.dumps(dataset_plan.check_manifests(execution_plan, source_manifests))')) : null;
      phase('Organizing all sources into preserved partition folders…');
      const layout = JSON.parse(py.runPython("folder_layout = compose_layout(task_model, [dict(plan=plan, manifest=manifest) for plan, manifest in zip(source_task_plans, source_manifests)]); json.dumps(dict(copies=folder_layout['copies'], documents={k:encoded(v).decode() for k,v in folder_layout['documents'].items()}))"));
      const blocks = prepared.map(p => new Map(p.files.map(f => [f.path, f]))), exportFiles = [], mounts = new Map();
      for (const [path, source] of Object.entries(layout.copies)) {
        const block = blocks[source.input]?.get(source.path);
        if (!block) throw Error('Dataset layout refers to an absent prepared block');
        exportFiles.push({path, handle:block.handle});
        const parent = path.slice(0, path.lastIndexOf('/'));
        if (!mounts.has(parent)) mounts.set(parent, []);
        mounts.get(parent).push({name:path.split('/').at(-1), data:await block.handle.getFile()});
      }
      for (const [parent, blobs] of mounts) {
        py.FS.mkdirTree('/dataset/' + parent); py.FS.mount(py.FS.filesystems.WORKERFS, {blobs}, '/dataset/' + parent);
      }
      for (const [path, text] of Object.entries(layout.documents)) {
        const target = '/dataset/' + path; py.FS.mkdirTree(target.slice(0, target.lastIndexOf('/'))); py.FS.writeFile(target, text);
        exportFiles.push({path, handle:await write(root, 'folder-export/' + path, new TextEncoder().encode(text))});
      }
      phase('Validating the complete combined dataset through the independent folder reader…');
      const datasetReport = JSON.parse(py.runPython("folder_dataset = TaskDataset('/dataset', task_model); folder_report = folder_dataset.validate(); json.dumps(folder_report)"));
      const requestSummary = {use:prepared[0].taskPlan.use, variables:prepared[0].taskPlan.variables};
      const report = {status:'validated', plots:datasetReport.scenes, points:datasetReport.points, chunks:prepared.reduce((n,p) => n + p.evidence.task_validation.package.chunks, 0)};
      const evidence = {status:'validated', request:requestSummary, sources:prepared.map(p => p.evidence), report,
        dataset:datasetReport, prepared_scenes:prepared.flatMap(p => p.evidence.prepared_scenes),
        runtime:{pyodide:lock.pyodide, python:lock.python, numpy:lock.numpy, laspy:lock.laspy, zip_js:lock.zip_js},
        runtime_lock_sha256:runtimeHash, dataset_plan:executionPlan, dataset_plan_validation:planValidation, user_agent:navigator.userAgent,
        limitations:['Selected LAS SHA256 verified; whole-provider-archive checksums not checked in this run',
          'Optional missing variables are omitted; no values fabricated', 'Published partitions do not establish geographic independence', 'OPFS is temporary storage; export the ZIP before clearing it']};
      const documents = {'dataset-validation.json':datasetReport, 'browser-run.json':evidence};
      if (executionPlan) Object.assign(documents, {'dataset-plan.json':executionPlan, 'dataset-plan-validation.json':planValidation});
      for (const [path, value] of Object.entries(documents)) exportFiles.push({path, handle:await write(root, 'folder-export/' + path, new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n'))});
      phase('Writing the downloadable ZIP from browser storage…');
      const zip = await loadZip(lock), archive = await root.getFileHandle('prepared.zip', {create:true});
      const access = await archive.createSyncAccessHandle(); let position = 0;
      try {
        access.truncate(0);
        const output = new WritableStream({write(bytes) {
          let offset = 0;
          while (offset < bytes.length) {
            const count = access.write(bytes.subarray(offset), {at:position});
            if (!count) throw Error('ZIP write stopped');
            offset += count; position += count;
          }
        }});
        const writer = new zip.ZipWriter(output, {level:0, zip64:true});
        for (const entry of [...exportFiles, ...provenance]) await writer.add(entry.path, new zip.BlobReader(await entry.handle.getFile()));
        await writer.close(); access.flush();
      } finally { access.close(); }
      const outputFile = await archive.getFile();
      await write(root, 'complete.json', new TextEncoder().encode(JSON.stringify({size_bytes:outputFile.size, evidence})));
      self.postMessage({type:'result', job, file:outputFile, evidence});
    } catch (error) {
      if (mode !== 'zenodo') await jobs.removeEntry(job, {recursive:true}).catch(() => {});
      throw error;
    } finally { py?.runPython("prep.reader.close() if 'prep' in globals() else None"); }
  });
}

async function resume(id) {
  if (!validJob(id)) throw Error('Invalid saved run identity');
  const origin = await navigator.storage.getDirectory();
  const jobs = await origin.getDirectoryHandle('canopy-preparation');
  const root = await jobs.getDirectoryHandle(id);
  const saved = await readJSON(root, 'run.json');
  if (saved.schema_version !== RUN_VERSION || saved.mode !== 'zenodo') throw Error('This historical run cannot be resumed');
  await run({...saved, job:id});
}

self.onmessage = async ({data}) => {
  if (active) return;
  active = true;
  try {
    if (data.operation === 'inspect') self.postMessage({type:'result', operation:'inspect', runs:await inspectRuns()});
    else if (data.operation === 'resume') await resume(data.job);
    else if (['review', 'import'].includes(data.operation)) await review(data);
    else await run(data);
  }
  catch (error) { self.postMessage({type: 'error', code: error.code, error: String(error.message || error)}); }
};
