import { context, fingerprint } from './classification-model.js';
const base = new URL('../', import.meta.url);
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function checked(entry) {
  const response = await fetch(new URL(entry.path, base), {
    cache: 'no-cache',
    credentials: 'omit',
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw Error('ARTIFACT_UNAVAILABLE: ' + entry.path);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== entry.size_bytes || (await sha256(bytes)) !== entry.sha256)
    throw Error('ARTIFACT_CHANGED: ' + entry.path);
  return bytes;
}
export async function loadContext() {
  const response = await fetch(new URL('browser-prepare/classification-runtime-lock.json', base), {
    cache: 'no-store',
  });
  if (!response.ok) throw Error('CLASSIFICATION_RUNTIME_UNAVAILABLE');
  const bytes = new Uint8Array(await response.arrayBuffer()),
    lock = JSON.parse(new TextDecoder().decode(bytes));
  if (lock.schema_version !== '1.0.0') throw Error('UNSUPPORTED_CLASSIFICATION_RUNTIME');
  const artifactCache = new Map();
  const read = async (name) => {
    if (!lock.files[name]) throw Error('UNPINNED_ARTIFACT: ' + name);
    if (!artifactCache.has(name)) artifactCache.set(name, checked(lock.files[name]));
    return artifactCache.get(name);
  };
  const decoded = async (name) => {
    let bytes = await read(name);
    if (lock.files[name].path.endsWith('.gz'))
      bytes = new Uint8Array(
        await new Response(
          new Blob([bytes]).stream().pipeThrough(new globalThis.DecompressionStream('gzip')),
        ).arrayBuffer(),
      );
    return bytes;
  };
  const json = async (name) => JSON.parse(new TextDecoder().decode(await decoded(name)));
  for (const [name, entry] of Object.entries(lock.files))
    if (/\.(js|mjs|py)$/.test(name)) await checked(entry);
  const registry = await json('data/classification/source-lock.json');
  const model = await json('data/knowledge-model.json');
  for (const source of registry.sources) {
    const routes = Object.values(model.nodes).filter(
      (n) =>
        n.type === 'pipeline_spec' &&
        n.data.task_ref === 'task:species' &&
        n.data.source_ref === source.source_ref &&
        n.data.execution_enabled,
    );
    if (routes.length > 1) throw Error('AMBIGUOUS_CLASSIFICATION_PIPELINE');
    source.execution_enabled = routes.length === 1;
    source.status = routes.length ? 'validated' : 'wip';
    source.blockers = routes.length
      ? []
      : ['Maintainer source admission required by CONTRIBUTING.md'];
  }
  for (const source of registry.sources)
    if ((await sha256(await read(source.label_table.path))) !== source.label_table.sha256)
      throw Error('SOURCE_TABLE_CHANGED');
  const vocabulary = await json(registry.vocabulary.path),
    trees = (await json(registry.trees.path)).trees;
  if (
    (await sha256(await decoded(registry.vocabulary.path))) !== registry.vocabulary.sha256 ||
    (await sha256(await decoded(registry.trees.path))) !== registry.trees.sha256
  )
    throw Error('SOURCE_TABLE_CHANGED');
  return {
    ctx: context(registry, vocabulary, trees),
    lock,
    read,
    pins: {
      runtime_sha256: await sha256(bytes),
      code_sha256: await fingerprint(
        Object.fromEntries(Object.entries(lock.files).filter(([p]) => /\.(js|mjs|py)$/.test(p))),
      ),
    },
  };
}
async function moduleFrom(bytes, suffix = '', prefix = '') {
  const url = URL.createObjectURL(new Blob([prefix, bytes, suffix], { type: 'text/javascript' }));
  try {
    return await import(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function loadTools(read) {
  const prefix = 'const module={exports:{}}; const exports=module.exports;\n';
  const md5 = await moduleFrom(
    await read('browser-prepare/vendor/md5.umd.js'),
    '\nexport default module.exports;',
    prefix,
  );
  const sha = await moduleFrom(
    await read('browser-prepare/vendor/sha256.umd.js'),
    '\nexport default module.exports;',
    prefix,
  );
  const module = await moduleFrom(
    await read('browser-prepare/vendor/laz-perf.js'),
    '\nexport default createLazPerf;',
  );
  const laz = await module.default({
    wasmBinary: await read('browser-prepare/vendor/laz-perf.wasm'),
  });
  if (!self.zip) await moduleFrom(await read('browser-prepare/vendor/zip.min.js'));
  self.zip.configure({ useWebWorkers: false, chunkSize: 1024 ** 2 });
  return {
    laz,
    zip: self.zip,
    hashers: { md5: md5.default.createMD5, sha256: sha.default.createSHA256 },
  };
}
