/** Pinned artifact verification and Pyodide bootstrap for the preparation worker. */
function createRuntime({ scope, base, nativeFetch, digest, profileForSource, phase }) {
  async function checked(entry) {
    const response = await nativeFetch(new URL(entry.url, base), {
      cache: 'no-cache',
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw Error(`Artifact HTTP ${response.status}: ${entry.url}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== entry.size_bytes || (await digest(bytes)) !== entry.sha256)
      throw Error(`Artifact integrity mismatch: ${entry.url}`);
    return bytes;
  }

  async function boot(lock) {
    const cache = new Map();
    const byURL = new Map(
      Object.values(lock.files).map((entry) => [new URL(entry.url, base).href, entry]),
    );
    async function asset(name) {
      const entry = lock.files[name];
      if (!entry) throw Error(`Unpinned runtime artifact: ${name}`);
      return checked(entry);
    }
    // Pyodide's own runtime/package fetches must pass the same pinned checks.
    scope.fetch = async (input, options) => {
      const url = new URL(input instanceof Request ? input.url : String(input), base).href;
      if (url.startsWith('blob:')) return nativeFetch(input, options);
      const entry = byURL.get(url);
      if (!entry) throw Error(`Runtime requested an unpinned artifact: ${url}`);
      if (!cache.has(url)) cache.set(url, checked(entry));
      return new Response(await cache.get(url), {
        headers: {
          'Content-Type': url.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
        },
      });
    };
    const blobURL = (bytes, type = 'text/javascript') =>
      URL.createObjectURL(new Blob([bytes], { type }));
    const bootstrapURL = blobURL(await asset('pyodide.mjs'));
    const moduleURL = blobURL(await asset('pyodide.asm.mjs'));
    const stdlibURL = blobURL(await asset('python_stdlib.zip'), 'application/zip');
    try {
      const { loadPyodide } = await import(bootstrapURL);
      const createPyodideModule = (await import(moduleURL)).default;
      const py = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/',
        packageBaseUrl: 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/',
        lockFileContents: JSON.parse(new TextDecoder().decode(await asset('pyodide-lock.json'))),
        stdLibURL: stdlibURL,
        createPyodideModule,
        stdout: () => {},
        stderr: (text) => console.warn(text),
      });
      await py.loadPackage(['numpy', 'jsonschema'], {
        errorCallback: (message) => {
          throw Error(message);
        },
      });
      for (const name of ['laspy-2.7.0-py3-none-any.whl', 'filelock-4.0.12-py3-none-any.whl']) {
        py.FS.writeFile('/' + name, await asset(name));
      }
      for (const [name, entry] of Object.entries(lock.files)) {
        if (
          !name.startsWith('scripts/') &&
          !name.startsWith('src/canopy/') &&
          ![
            'task-package.schema.json',
            'task-dataset.schema.json',
            'dataset-plan.schema.json',
            'knowledge-model.json',
            'knowledge-model.schema.json',
            'browser-prepare/kernel.py',
            'browser-prepare/batch.py',
          ].includes(name)
        )
          continue;
        const path = '/app/' + name;
        py.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
        py.FS.writeFile(path, await checked(entry));
      }
      py.runPython(
        "import sys; sys.path[:0] = ['/app/browser-prepare', '/app/src', '/laspy-2.7.0-py3-none-any.whl', '/filelock-4.0.12-py3-none-any.whl']; from kernel import Preparation; from batch import combine_manifests; from canopy.task_package import TaskPackage; from canopy.task_dataset import compose_layout, encoded, TaskDataset; from canopy.task_plan import plan_request, check_plan, validate_prepared, iter_task_blocks; from canopy.knowledge_model import load as load_model; from canopy import dataset_plan; import json, numpy, laspy, platform",
      );
      const versions = JSON.parse(
        py.runPython(
          'json.dumps(dict(python=platform.python_version(), numpy=numpy.__version__, laspy=laspy.__version__))',
        ),
      );
      for (const name of ['python', 'numpy', 'laspy'])
        if (versions[name] !== lock[name]) throw Error(`Runtime version mismatch: ${name}`);
      cache.clear();
      return py;
    } finally {
      for (const url of [bootstrapURL, moduleURL, stdlibURL]) URL.revokeObjectURL(url);
    }
  }

  async function loadContext(records) {
    const response = await nativeFetch(new URL('browser-prepare/runtime-lock.json', base), {
      cache: 'no-store',
    });
    if (!response.ok) throw Error('Runtime lock unavailable');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const lock = JSON.parse(new TextDecoder().decode(bytes)),
      sources = new Map(),
      contexts = {};
    for (const record of [...new Set(records)].sort()) {
      const profile = profileForSource(record);
      if (!profile)
        throw Error(`zenodo:${record}: no browser implementation for this reviewed source`);
      const sourceBytes = await checked(lock.files[profile.sourceLock]);
      const source = JSON.parse(new TextDecoder().decode(sourceBytes));
      if (String(source.record_id) !== record)
        throw Error('Reviewed source membership belongs to another release');
      sources.set(record, { source, profile });
      contexts[record] = {
        source,
        source_lock_path: profile.sourceLock,
        source_lock_sha256: await digest(sourceBytes),
      };
    }
    for (const [name, entry] of Object.entries(lock.files))
      if ((name.startsWith('browser-prepare/') || name.startsWith('web/')) && name.endsWith('.js'))
        await checked(entry);
    phase(
      'Checking task requirements and exact versions for every source; no source LAS is downloaded yet…',
    );
    const py = await boot(lock),
      runtimeHash = await digest(bytes);
    py.globals.set('source_contexts_json', JSON.stringify(contexts));
    py.globals.set('runtime_lock_sha256', runtimeHash);
    py.runPython(
      "task_model = load_model('/app/knowledge-model.json'); source_contexts = json.loads(source_contexts_json)",
    );
    return { lock, sources, py, runtimeHash };
  }

  return { checked, boot, loadContext };
}

export { createRuntime };
