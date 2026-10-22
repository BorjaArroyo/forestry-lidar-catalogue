import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { write, mountBlocks } from '../browser-prepare/storage.js';
import { createPreparationController } from '../browser-prepare/controller.js';
import { MemoryDirectory } from './browser-memory-fs.mjs';

const job = '12345678-1234-1234-1234-123456789abc';
// Exercise the real checkpoint lifecycle and orchestration, with runtime/scientific boundaries isolated.
function worker({
  store = new MemoryDirectory(),
  quota = 1e9,
  fail,
  stale = false,
  held = true,
} = {}) {
  const messages = [],
    staged = [],
    validated = [],
    globals = new Map(),
    mounted = new Map();
  const request = {
    use: 'training',
    variables: { xyz: 'required', instance_reference: 'required', reflectance: 'optional' },
  };
  const plans = ['19351234', '8287792'].map((record) => ({
    schema_version: '1.0.0',
    task_plan: {
      ...request,
      source_ref: 'zenodo:' + record,
      pipeline_ref: 'pipeline:fixture',
      allowed_partitions: ['train'],
    },
    plots: [
      {
        path: record + '.las',
        sha256: 'a'.repeat(64),
        points: 9,
        size_bytes: 100,
        published_split: 'train',
      },
    ],
  }));
  const plan = {
    schema_version: '2.0.0',
    plan_sha256: 'b'.repeat(64),
    request,
    source_plans: plans,
    totals: { estimated_browser_storage_bytes: 1000 },
  };
  const py = {
    globals: { set: (name, value) => globals.set(name, value) },
    FS: {
      filesystems: { WORKERFS: {} },
      mkdir() {},
      mkdirTree() {},
      mount(fs, { blobs }, path) {
        mounted.set(path, blobs);
      },
      unmount(path) {
        mounted.delete(path);
      },
      writeFile() {},
    },
    runPython(code) {
      if (code.includes('dataset_plan.check_dataset')) {
        if (stale) throw Error('stale source pin');
        return JSON.stringify(plan);
      }
      if (code.includes('combine_manifests')) return JSON.parse(globals.get('manifests_json'))[0];
      if (code.includes('dataset_plan.check_manifest'))
        return JSON.stringify({ status: 'matched' });
      if (code.includes('folder_layout ='))
        return JSON.stringify({ copies: {}, documents: { 'dataset.json': '{}' } });
      if (code.includes('folder_dataset =')) return JSON.stringify({ scenes: 2, points: 18 });
    },
  };
  const context = {
    URL,
    Map,
    TextEncoder,
    TextDecoder,
    console,
    File,
    Blob,
    WritableStream,
    DOMException,
    write,
    mountBlocks,
    crypto: { subtle: webcrypto.subtle, randomUUID: () => job },
    self: {
      location: { href: 'http://localhost/browser-prepare/worker.js' },
      fetch() {},
      postMessage: (value) => messages.push(value),
    },
    navigator: {
      storage: { getDirectory: async () => store, estimate: async () => ({ quota, usage: 0 }) },
      locks: { request: async (name, options, fn) => fn(held ? {} : null) },
    },
    mockLoadContext: async (records) => ({
      lock: {},
      runtimeHash: 'a'.repeat(64),
      py,
      sources: new Map(
        records.map((record) => [
          record,
          {
            source: {
              plots: plans.find((p) => p.task_plan.source_ref === 'zenodo:' + record).plots,
            },
            profile: {
              recordId: record,
              plotLabel: (path) => path,
              validate(py, root) {
                validated.push(record);
                if (fail === 'validation:' + record) throw Error('invalid arrays');
                const arrays = [...mounted]
                  .filter(([path]) => path.startsWith(root + '/'))
                  .flatMap(([, files]) => files);
                if (arrays.some((file) => file.data.size !== 4)) throw Error('corrupt saved block');
                return { package: { chunks: 1 } };
              },
            },
          },
        ]),
      ),
    }),
    getTask: (py, profile) =>
      plans.find((p) => p.task_plan.source_ref === 'zenodo:' + profile.recordId).task_plan,
    stage: async (root, input) => {
      staged.push(input.record_id);
      await root.getFileHandle('source.las', { create: true });
      if (fail === 'intake:' + input.record_id) throw Error('provider payload corrupted');
      return { file: {}, intake: { kind: 'zenodo-ranges', record: input.record_id } };
    },
    prepare: async (py, root, file, profile, task, expected, files, output) => {
      const manifest = {
        source: { record_id: Number(profile.recordId) },
        scenes: [
          {
            ...plans.find((p) => p.task_plan.source_ref === 'zenodo:' + profile.recordId).plots[0],
            id: profile.recordId,
            chunks: [{ path: 'plots/' + profile.recordId + '/00000.npz' }],
          },
        ],
      };
      const path = manifest.scenes[0].chunks[0].path;
      const handle = await context.write(root, path, new Uint8Array([1, 2, 3, 4]));
      files.push({ path, handle });
      if (fail === 'write:' + profile.recordId) throw Error('interrupted block write');
      await context.mountBlocks(py, files, output);
      return { manifest, manifestText: JSON.stringify(manifest) };
    },
    zipRuntime: async () => ({
      BlobReader: class {},
      ZipWriter: class {
        async add() {
          if (fail === 'zip') throw Error('interrupted ZIP');
        }
        async close() {}
      },
    }),
  };
  const controller = createPreparationController({
    scope: context.self,
    browser: context.navigator,
    cryptoProvider: context.crypto,
    runtime: { loadContext: context.mockLoadContext },
    taskForRequest: context.getTask,
    stagePlot: context.stage,
    preparePlot: context.prepare,
    loadZip: context.zipRuntime,
  });
  return {
    store,
    messages,
    staged,
    validated,
    run: () => controller.run({ mode: 'zenodo', task_request: request, execution_plan: plan }),
    resume: () => controller.resume(job),
    inspect: controller.inspect,
    review: controller.review,
    onmessage: controller.onmessage,
  };
}
async function checkpoint(store, record) {
  const jobs = await store.getDirectoryHandle('canopy-preparation');
  const root = await jobs.getDirectoryHandle(job);
  const source = await (
    await root.getDirectoryHandle('sources')
  ).getDirectoryHandle('zenodo-' + record);
  const plots = await source.getDirectoryHandle('checkpoints');
  return (await plots.values().next()).value;
}

test('second-source failure preserves the first checkpoint; a fresh worker resumes without its download', async () => {
  const first = worker({ fail: 'intake:8287792' });
  await assert.rejects(first.run(), /provider payload corrupted/);
  assert.ok(!first.messages.some((m) => m.type === 'result'));
  assert.equal((await first.inspect())[0].completed, 1);
  const next = worker({ store: first.store });
  await next.resume();
  assert.deepEqual(next.staged, ['8287792']);
  assert.ok(next.validated.includes('19351234'));
  assert.equal(next.messages.at(-1).type, 'result');
});
for (const fail of ['intake:19351234', 'write:19351234', 'validation:19351234'])
  test(fail + ' never commits a reusable partial plot', async () => {
    const first = worker({ fail });
    await assert.rejects(first.run());
    assert.equal((await first.inspect())[0].completed, 0);
    const next = worker({ store: first.store });
    await next.resume();
    assert.deepEqual(next.staged, ['19351234', '8287792']);
  });
test('a corrupt saved block is discarded and prepared again', async () => {
  const first = worker({ fail: 'intake:8287792' });
  await assert.rejects(first.run());
  const root = await checkpoint(first.store, '19351234');
  const file = await (
    await (await root.getDirectoryHandle('plots')).getDirectoryHandle('19351234')
  ).getFileHandle('00000.npz');
  file.bytes = new Uint8Array([9]);
  const next = worker({ store: first.store });
  await next.resume();
  assert.deepEqual(next.staged, ['19351234', '8287792']);
});
test('interrupted ZIP regeneration reuses every validated plot', async () => {
  const first = worker({ fail: 'zip' });
  await assert.rejects(first.run(), /interrupted ZIP/);
  assert.equal((await first.inspect())[0].completed, 2);
  const next = worker({ store: first.store });
  await next.resume();
  assert.deepEqual(next.staged, []);
  assert.equal((await next.inspect())[0].status, 'complete');
});
test('stale plans fail before changing saved checkpoints or fetching any payload', async () => {
  const first = worker({ fail: 'zip' });
  await assert.rejects(first.run());
  const next = worker({ store: first.store, stale: true });
  await assert.rejects(next.resume(), (e) => e.code === 'DATASET_PLAN_STALE');
  assert.deepEqual(next.staged, []);
  assert.equal((await next.inspect())[0].completed, 2);
});
test('insufficient remaining quota retains checkpoints and never fetches pending payloads', async () => {
  const first = worker({ fail: 'intake:8287792' });
  await assert.rejects(first.run());
  const next = worker({ store: first.store, quota: 10 });
  await assert.rejects(next.resume(), /Insufficient browser storage/);
  assert.deepEqual(next.staged, []);
  assert.equal((await next.inspect())[0].completed, 1);
});
test('an occupied run lock prevents a second writer', async () => {
  const first = worker({ fail: 'zip' });
  await assert.rejects(first.run());
  const next = worker({ store: first.store, held: false });
  await assert.rejects(next.resume(), /in use by another page/);
  assert.deepEqual(next.staged, []);
});
test('initial global quota and stale-plan checks prevent source intake', async () => {
  for (const options of [{ quota: 10 }, { stale: true }]) {
    const w = worker(options);
    await assert.rejects(w.run());
    assert.deepEqual(w.staged, []);
  }
});

test('a malformed checkpoint marker forces regeneration rather than trusting its blocks', async () => {
  const first = worker({ fail: 'intake:8287792' });
  await assert.rejects(first.run());
  const root = await checkpoint(first.store, '19351234');
  const marker = await root.getFileHandle('checkpoint.json');
  marker.bytes = new TextEncoder().encode('{');
  const next = worker({ store: first.store });
  await next.resume();
  assert.deepEqual(next.staged, ['19351234', '8287792']);
});
test('changed saved runtime identity blocks reuse without deleting valid checkpoints', async () => {
  const first = worker({ fail: 'zip' });
  await assert.rejects(first.run());
  const root = await (
    await first.store.getDirectoryHandle('canopy-preparation')
  ).getDirectoryHandle(job);
  const file = await root.getFileHandle('run.json');
  const saved = JSON.parse(await (await file.getFile()).text());
  saved.runtime_lock_sha256 = 'c'.repeat(64);
  file.bytes = new TextEncoder().encode(JSON.stringify(saved));
  const next = worker({ store: first.store });
  await assert.rejects(next.resume(), /dependencies changed/);
  assert.deepEqual(next.staged, []);
  assert.equal((await next.inspect())[0].completed, 2);
});
test('historical completed ZIPs remain discoverable without a run marker', async () => {
  const w = worker();
  await w.run();
  const root = await (
    await w.store.getDirectoryHandle('canopy-preparation')
  ).getDirectoryHandle(job);
  await root.removeEntry('run.json');
  const saved = (await w.inspect())[0];
  assert.equal(saved.status, 'complete');
  assert.equal(saved.resumable, undefined);
  assert.ok(saved.file instanceof File);
});

test('resume reserves space for the ZIP without charging completed plots a second preparation copy', async () => {
  const first = worker({ fail: 'zip' });
  await assert.rejects(first.run());
  // Enough for the full conservative ZIP estimate plus reserve; insufficient for two new copies.
  const next = worker({ store: first.store, quota: 67_250_000 });
  await next.resume();
  assert.deepEqual(next.staged, []);
  assert.equal(next.messages.at(-1).type, 'result');
});
