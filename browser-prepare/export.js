import { write } from './storage.js';

export async function writeArchive(zip, root, entries) {
  const archive = await root.getFileHandle('prepared.zip', { create: true });
  const access = await archive.createSyncAccessHandle();
  let position = 0;
  try {
    access.truncate(0);
    const output = new WritableStream({
      write(bytes) {
        let offset = 0;
        while (offset < bytes.length) {
          const count = access.write(bytes.subarray(offset), { at: position });
          if (!count) throw Error('ZIP write stopped');
          offset += count;
          position += count;
        }
      },
    });
    const writer = new zip.ZipWriter(output, { level: 0, zip64: true });
    for (const entry of entries)
      await writer.add(entry.path, new zip.BlobReader(await entry.handle.getFile()));
    await writer.close();
    access.flush();
  } finally {
    access.close();
  }
  return archive.getFile();
}

export function createZipRuntime({ scope, runtime }) {
  return async function loadZip(lock) {
    if (!scope.zip) {
      const url = URL.createObjectURL(
        new Blob([await runtime.checked(lock.files['zip.min.js'])], { type: 'text/javascript' }),
      );
      try {
        await import(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      scope.zip.configure({ useWebWorkers: false, chunkSize: 1024 ** 2 });
    }
    return scope.zip;
  };
}

export async function exportDataset({
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
}) {
  py.globals.set('all_manifests_json', JSON.stringify(allManifests));
  py.globals.set('all_plans_json', JSON.stringify(prepared.map((p) => p.taskPlan)));
  py.runPython(
    'source_manifests = [json.loads(text) for text in json.loads(all_manifests_json)]; source_task_plans = json.loads(all_plans_json)',
  );
  const planValidation = executionPlan
    ? JSON.parse(
        py.runPython('json.dumps(dataset_plan.check_manifests(execution_plan, source_manifests))'),
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
    mounts.get(parent).push({ name: path.split('/').at(-1), data: await block.handle.getFile() });
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
    user_agent: browser.userAgent,
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
  scope.postMessage({ type: 'result', job, file: outputFile, evidence });
}
