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

async function loadContext(profile) {
  const response = await nativeFetch(new URL('browser-prepare/runtime-lock.json', base), {cache: 'no-store'});
  if (!response.ok) throw Error('Runtime lock unavailable');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const lock = JSON.parse(new TextDecoder().decode(bytes));
  const sourceBytes = await checked(lock.files[profile.sourceLock]);
  const source = JSON.parse(new TextDecoder().decode(sourceBytes));
  if (String(source.record_id) !== profile.recordId) throw Error('Reviewed source membership belongs to another release');
  for (const path of ['browser-prepare/worker.js', 'browser-prepare/intake.js', 'browser-prepare/selection.js', 'browser-prepare/profiles.js', 'browser-prepare/profiles/for-instance.js', 'browser-prepare/profiles/fgi-emit.js']) await checked(lock.files[path]);
  phase('Checking task requirements and exact versions; no source LAS is downloaded yet…');
  const py = await boot(lock);
  py.globals.set('source_json', JSON.stringify(source));
  py.globals.set('source_lock_path', profile.sourceLock);
  py.globals.set('source_lock_sha256', await digest(sourceBytes));
  const runtimeHash = await digest(bytes);
  py.globals.set('runtime_lock_sha256', runtimeHash);
  py.runPython("task_model = load_model('/app/knowledge-model.json'); source_lock = json.loads(source_json); dataset_pins = dict(source_lock_path=source_lock_path, source_lock_sha256=source_lock_sha256, runtime_lock_sha256=runtime_lock_sha256)");
  return {lock, source, py, runtimeHash};
}

function taskForRequest(py, profile, request) {
  py.globals.set('source_record_id', profile.recordId);
  py.globals.set('request_json', JSON.stringify(request.task_request || {}));
  const plan = JSON.parse(py.runPython("task_request = json.loads(request_json); task_plan = plan_request(task_model, source_record_id, task_request.get('use', 'training'), task_request.get('variables')); check_plan(task_model, task_plan); json.dumps(task_plan)"));
  if (plan.pipeline_ref !== profile.pipelineRef) throw Error('Source implementation differs from the admitted pipeline');
  return plan;
}

async function review(request) {
  if (request.mode !== 'zenodo') throw Error('Dataset plan review currently supports Zenodo selections');
  const profile = profileForSource(request.record_id);
  if (!profile) throw Error('No browser implementation for this reviewed source');
  const {py, source} = await loadContext(profile);
  let plan;
  if (request.operation === 'import') {
    if (typeof request.plan_text !== 'string' || request.plan_text.length > 1048576) throw Error('Plan files must be JSON up to 1 MiB');
    py.globals.set('imported_plan_text', request.plan_text);
    plan = JSON.parse(py.runPython("from task_package import decode_json; execution_plan = dataset_plan.check(task_model, source_lock, decode_json(imported_plan_text), **dataset_pins); json.dumps(execution_plan)"));
    if (plan.task_plan.source_ref !== 'zenodo:' + profile.recordId || plan.task_plan.pipeline_ref !== profile.pipelineRef) throw Error('Imported plan belongs to another implementation');
  } else {
    taskForRequest(py, profile, request);
    py.globals.set('subsets_json', JSON.stringify(request.subset_paths));
    plan = JSON.parse(py.runPython("execution_plan = dataset_plan.resolve(task_model, source_lock, **dataset_pins, use=task_plan['use'], variables=task_plan['variables'], subsets=json.loads(subsets_json)); json.dumps(execution_plan)"));
  }
  self.postMessage({type: 'result', operation: request.operation, plan, source_plots: request.operation === 'import' ? source.plots : undefined});
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

async function preparePlot(py, root, file, profile, taskPlan, expectedPath, files) {
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
    py.FS.mkdirTree('/output/plots/' + scene.id);
    const mounted = await Promise.all(sceneFiles.map(async f => ({name: f.path.split('/').at(-1), data: await f.handle.getFile()})));
    py.FS.mount(py.FS.filesystems.WORKERFS, {blobs: mounted}, '/output/plots/' + scene.id);
    // Keep the authoritative JSON text: JavaScript otherwise turns 1.0 into 1 in native schema descriptors.
    const manifestText = py.runPython('json.dumps(prep.manifest)');
    return {manifest: JSON.parse(manifestText), manifestText};
  } finally {
    py.runPython("prep.reader.close() if 'prep' in globals() else None");
    py.FS.unmount('/input');
  }
}

async function run(request) {
  const profile = profileForSource(request.record_id);
  if (!profile) throw Error('No browser implementation for this reviewed source');
  const mode = request.mode || 'las';
  if (!['las', 'zip', 'zenodo'].includes(mode)) throw Error('Unsupported source input mode');
  if (mode !== 'zenodo' && (!(request.file instanceof File) || !request.file.size)) throw Error('Choose a complete reviewed LAS or ZIP file');
  const origin = await navigator.storage.getDirectory();
  const jobs = await origin.getDirectoryHandle('canopy-preparation', {create: true});
  const job = crypto.randomUUID();
  const root = await jobs.getDirectoryHandle(job, {create: true});
  self.postMessage({type: 'job', id: job});
  return navigator.locks.request('canopy-preparation:' + job, async () => {
    let py;
    try {
      const context = await loadContext(profile);
      const {lock, source, runtimeHash} = context;
      py = context.py;
      const taskPlan = taskForRequest(py, profile, request);
      let executionPlan = null;
      if (mode === 'zenodo') {
        if (!request.execution_plan) throw Error('Review the dataset plan before downloading');
        py.globals.set('execution_plan_json', JSON.stringify(request.execution_plan));
        try {
          executionPlan = JSON.parse(py.runPython("execution_plan = dataset_plan.check(task_model, source_lock, json.loads(execution_plan_json), **dataset_pins); json.dumps(execution_plan)"));
          if (JSON.stringify(executionPlan.task_plan) !== JSON.stringify(taskPlan)) throw Error('The reviewed plan belongs to different task requirements');
        } catch (error) { error.code = 'DATASET_PLAN_STALE'; throw error; }
      }
      const candidates = mode === 'las' ? source.plots.filter(p => p.size_bytes === request.file.size) :
        selectPlots(source.plots, executionPlan ? executionPlan.plots.map(p => p.path) : request.selected_paths || (request.selected_path ? [request.selected_path] : []));
      if (!candidates.length) throw Error('Input does not identify complete reviewed plots');
      if (mode !== 'las' && candidates.some(p => !taskPlan.allowed_partitions.includes(p.published_split))) throw Error('Selected dataset contains a published partition excluded from this task use');
      const outputEstimate = p => p.size_bytes + p.points * (profile.derivedBytesPerPoint || 34) + Math.ceil(p.points / 250000) * 65536;
      const preparedBytes = mode === 'las' ? Math.max(...candidates.map(outputEstimate)) : candidates.reduce((n,p) => n + outputEstimate(p), 0);
      const required = executionPlan?.totals.estimated_browser_storage_bytes ??
        (2 * preparedBytes + (mode === 'las' ? 0 : Math.max(...candidates.map(p => p.size_bytes))) + 64 * 1024 ** 2);
      const estimate = await navigator.storage.estimate();
      if (!Number.isFinite(estimate.quota) || estimate.quota - (estimate.usage || 0) < required)
        throw Error(`Insufficient browser storage; approximately ${Math.ceil(required / 1048576)} MiB free is required for the selected dataset and ZIP export`);
      const files = [], manifests = [], manifestTexts = [], intakes = [];
      py.FS.mkdir('/input');
      const queue = mode === 'las' ? [null] : candidates;
      for (const [index, plot] of queue.entries()) {
        let file = request.file;
        let intake = {kind: 'local-las', archive_verification: 'Provider ZIP not checked; selected LAS SHA256 is verified below'};
        if (plot) {
          phase(`Reading plot ${index + 1} of ${queue.length}: ${profile.plotLabel(plot.path)}…`);
          ({file, intake} = await stagePlot(root, {...request, mode}, plot, lock));
        }
        const {manifest, manifestText} = await preparePlot(py, root, file, profile, taskPlan, plot?.path, files);
        manifests.push(manifest); manifestTexts.push(manifestText); intakes.push({path: manifest.scenes[0].path, ...intake});
        if (plot) await root.removeEntry('source.las');
      }
      py.globals.set('manifests_json', JSON.stringify(manifestTexts));
      const manifestText = py.runPython('json.dumps(combine_manifests([json.loads(text) for text in json.loads(manifests_json)]), indent=2)') + '\n';
      const manifest = JSON.parse(manifestText);
      let planValidation = null;
      if (executionPlan) {
        py.globals.set('prepared_manifest_json', manifestText);
        planValidation = JSON.parse(py.runPython('json.dumps(dataset_plan.check_manifest(execution_plan, json.loads(prepared_manifest_json)))'));
        for (const [path, value] of [['dataset-plan.json', executionPlan], ['dataset-plan-validation.json', planValidation]])
          files.push({path, handle: await write(root, path, new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n'))});
      }
      files.push({path: 'task-package.json', handle: await write(root, 'task-package.json', new TextEncoder().encode(manifestText))});
      py.FS.writeFile('/output/task-package.json', manifestText);
      phase(`Independently validating every exported array across ${manifests.length} complete plots…`);
      const taskValidation = profile.validate(py);
      const report = taskValidation.package;
      const consumerSample = JSON.parse(py.runPython("sample = next(iter_task_blocks(task_model, task_plan, task_package)); json.dumps(dict(scene_id=sample['scene_id'], published_split=sample['published_split'], row_offset=sample['row_offset'], arrays={k:dict(shape=list(v.shape), dtype=str(v.dtype)) for k,v in sample['arrays'].items()}))"));
      const intake = intakes.length === 1 ? intakes[0] : {kind: 'selected-dataset', plots: intakes};
      for (const [path, value] of [['task-plan.json', taskPlan], ['task-validation.json', taskValidation]])
        files.push({path, handle: await write(root, path, new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n'))});
      phase('Organizing the dataset into published-partition folders…');
      py.globals.set('dataset_manifest_json', manifestText);
      const layout = JSON.parse(py.runPython("folder_layout = compose_layout(task_model, [dict(plan=task_plan, manifest=json.loads(dataset_manifest_json))]); json.dumps(dict(copies=folder_layout['copies'], documents={k:encoded(v).decode() for k,v in folder_layout['documents'].items()}))"));
      const blocks = new Map(files.filter(f => f.path.endsWith('.npz')).map(f => [f.path, f]));
      const exportFiles = [], mounts = new Map();
      for (const [path, source] of Object.entries(layout.copies)) {
        const block = blocks.get(source.path);
        if (!block) throw Error('Dataset layout refers to an absent prepared block');
        exportFiles.push({path, handle: block.handle});
        const parent = path.slice(0, path.lastIndexOf('/'));
        if (!mounts.has(parent)) mounts.set(parent, []);
        mounts.get(parent).push({name: path.split('/').at(-1), data: await block.handle.getFile()});
      }
      for (const [parent, blobs] of mounts) {
        py.FS.mkdirTree('/dataset/' + parent);
        py.FS.mount(py.FS.filesystems.WORKERFS, {blobs}, '/dataset/' + parent);
      }
      for (const [path, text] of Object.entries(layout.documents)) {
        const target = '/dataset/' + path;
        py.FS.mkdirTree(target.slice(0, target.lastIndexOf('/'))); py.FS.writeFile(target, text);
        exportFiles.push({path, handle: await write(root, 'folder-export/' + path, new TextEncoder().encode(text))});
      }
      phase('Validating the complete dataset through the common folder reader…');
      const datasetReport = JSON.parse(py.runPython("folder_dataset = TaskDataset('/dataset', task_model); folder_report = folder_dataset.validate(); json.dumps(folder_report)"));
      const datasetText = JSON.stringify(datasetReport, null, 2) + '\n';
      exportFiles.push({path: 'dataset-validation.json', handle: await write(root, 'folder-export/dataset-validation.json', new TextEncoder().encode(datasetText))});
      const evidence = {status: 'validated', prepared_scenes: manifest.scenes, dataset: datasetReport, task_plan: taskPlan, task_validation: taskValidation, consumer_sample: consumerSample, coverage: manifests.length === 1 ? 'one-complete-selected-plot' : 'complete-selected-plots', selection: manifest.selection, report,
        runtime: {pyodide: lock.pyodide, python: lock.python, numpy: lock.numpy, laspy: lock.laspy, zip_js: lock.zip_js},
        runtime_lock_sha256: runtimeHash, dataset_plan: executionPlan, dataset_plan_validation: planValidation,
        user_agent: navigator.userAgent, source_sha256: manifests.length === 1 ? manifests[0].scenes[0].sha256 : null, intake,
        limitations: ['Selected LAS verified; whole-provider-archive checksum not checked in this run',
          'No claim of annotation correctness or geographic independence', 'OPFS is temporary browser storage; export the ZIP before clearing it']};
      files.push({path: 'browser-run.json', handle: await write(root, 'browser-run.json', new TextEncoder().encode(JSON.stringify(evidence, null, 2) + '\n'))});
      phase('Writing the downloadable ZIP from browser storage…');
      const zip = await loadZip(lock);
      const archive = await root.getFileHandle('prepared.zip', {create: true});
      const access = await archive.createSyncAccessHandle();
      let position = 0;
      try {
        access.truncate(0);
        const output = new WritableStream({write(bytes) {
          let offset = 0;
          while (offset < bytes.length) {
            const count = access.write(bytes.subarray(offset), {at: position});
            if (!count) throw Error('ZIP write stopped');
            offset += count; position += count;
          }
        }});
        const writer = new zip.ZipWriter(output, {level: 0, zip64: true});
        const provenance = files.filter(f => !f.path.endsWith('.npz')).map(f => ({...f, path: f.path === 'task-package.json' ? 'provenance/selection-task-package.json' : f.path}));
        for (const entry of [...exportFiles, ...provenance]) await writer.add(entry.path, new zip.BlobReader(await entry.handle.getFile()));
        await writer.close(); access.flush();
      } finally { access.close(); }
      const outputFile = await archive.getFile();
      await write(root, 'complete.json', new TextEncoder().encode(JSON.stringify({size_bytes: outputFile.size, evidence})));
      self.postMessage({type: 'result', job, file: outputFile, evidence});
    } catch (error) {
      // Only this run's uniquely named staging data is removed.
      await jobs.removeEntry(job, {recursive: true}).catch(() => {});
      throw error;
    } finally {
      py?.runPython("prep.reader.close() if 'prep' in globals() else None");
    }
  });
}

self.onmessage = async ({data}) => {
  if (active) return;
  active = true;
  try { if (['review', 'import'].includes(data.operation)) await review(data); else await run(data); }
  catch (error) { self.postMessage({type: 'error', code: error.code, error: String(error.message || error)}); }
};
