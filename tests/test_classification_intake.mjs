import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  TarSelection,
  traverseZstd,
  ZstdFrameGuard,
} from '../browser-prepare/classification-intake.js';
import { decodeObservation } from '../browser-prepare/classification-las.js';
import { sourceRef, emptyDraft, readDraft } from '../browser-prepare/classification-model.js';
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
const require = createRequire(import.meta.url);
const hashers = {
  md5: vm.runInThisContext(
    '(()=>{const module={exports:{}};const exports=module.exports;' +
      fs.readFileSync(new URL('../browser-prepare/vendor/md5.umd.js', import.meta.url), 'utf8') +
      ';return module.exports;})()',
  ).createMD5,
  sha256: vm.runInThisContext(
    '(()=>{const module={exports:{}};const exports=module.exports;' +
      fs.readFileSync(new URL('../browser-prepare/vendor/sha256.umd.js', import.meta.url), 'utf8') +
      ';return module.exports;})()',
  ).createSHA256,
};
const digest = (bytes, name = 'sha256') => createHash(name).update(bytes).digest('hex');
const enc = new TextEncoder();
function tar(entries) {
  const chunks = [];
  for (const [name, data, type = 48] of entries) {
    const header = new Uint8Array(512);
    header.set(enc.encode(name), 0);
    header.set(enc.encode('0000644\0'), 100);
    header.set(enc.encode('0000000\0'), 108);
    header.set(enc.encode('0000000\0'), 116);
    header.set(enc.encode(data.length.toString(8).padStart(11, '0') + '\0'), 124);
    header.set(enc.encode('00000000000\0'), 136);
    header.fill(32, 148, 156);
    header[156] = type;
    header.set(
      enc.encode(
        [...header]
          .reduce((a, b) => a + b, 0)
          .toString(8)
          .padStart(6, '0') + '\0 ',
      ),
      148,
    );
    chunks.push(header, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  chunks.push(new Uint8Array(1024));
  return Buffer.concat(chunks);
}
function zstd(data) {
  assert.ok(data.length >= 256 && data.length < 65792);
  const size = data.length - 256,
    b = (data.length << 3) | 1;
  return Buffer.concat([
    Buffer.from([
      0x28,
      0xb5,
      0x2f,
      0xfd,
      0x60,
      size & 255,
      size >>> 8,
      b & 255,
      (b >>> 8) & 255,
      b >>> 16,
    ]),
    data,
  ]);
}
function stream(bytes, chunkSize = 77) {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}
function sink() {
  const files = [];
  let current;
  return {
    files,
    async start() {
      current = [];
    },
    async write(bytes) {
      current.push(bytes.slice());
    },
    async end(o) {
      files.push({ observation: o, bytes: Buffer.concat(current) });
    },
  };
}
const observation = { path: 'TLS/tree_TLS.laz', size_bytes: 6 };

test('sequential Zstandard traverses once, retains only selection, and verifies final archive checksum', async () => {
  const compressed = zstd(
    tar([
      ['TLS/ignored.laz', enc.encode('ignore')],
      [observation.path, enc.encode('abcdef')],
      ['TLS/after.laz', enc.encode('after')],
    ]),
  );
  const asset = {
      name: 'TLS.tar.zst',
      size_bytes: compressed.length,
      checksum: 'md5:' + digest(compressed, 'md5'),
    },
    out = sink();
  const report = await traverseZstd(stream(compressed), asset, [observation], out, hashers);
  assert.equal(out.files.length, 1);
  assert.equal(out.files[0].bytes.toString(), 'abcdef');
  assert.equal(report.traversals, 1);
  assert.equal(report.provider_checksum_verified, true);
  assert.equal(report.tar_complete, true);
  assert.equal(report.entries, 3);
});
test('corruption after the selected cloud and truncated archives fail instead of validating a partial selection', async () => {
  const original = zstd(tar([[observation.path, enc.encode('abcdef')]]));
  const asset = {
    name: 'TLS.tar.zst',
    size_bytes: original.length,
    checksum: 'md5:' + digest(original, 'md5'),
  };
  const changed = Buffer.from(original);
  changed[changed.length - 1] = 1;
  await assert.rejects(
    traverseZstd(stream(changed), asset, [observation], sink(), hashers),
    /TAR_|CHECKSUM/,
  );
  await assert.rejects(
    traverseZstd(stream(original.subarray(0, -1)), asset, [observation], sink(), hashers),
    /truncated|TRUNCATED|eof/i,
  );
  await assert.rejects(
    traverseZstd(
      stream(original),
      { ...asset, checksum: 'md5:' + '0'.repeat(32) },
      [observation],
      sink(),
      hashers,
    ),
    /ARCHIVE_CHECKSUM/,
  );
  await assert.rejects(
    traverseZstd(
      stream(original),
      { ...asset, sha256: '0'.repeat(64) },
      [observation],
      sink(),
      hashers,
    ),
    (error) =>
      error.message ===
      `ARCHIVE_SHA256_MISMATCH: ${asset.name}; expected ${'0'.repeat(64)}; received ${digest(original)}`,
  );
});
test('unsafe TAR paths, links, duplicated members, bad headers and missing views fail closed', async () => {
  for (const entries of [
    [['../escape', enc.encode('x')]],
    [['/absolute', enc.encode('x')]],
    [['TLS/link', new Uint8Array(), 50]],
    [
      [observation.path, enc.encode('abcdef')],
      [observation.path, enc.encode('abcdef')],
    ],
  ]) {
    const reader = new TarSelection([observation], sink());
    await assert.rejects(reader.push(tar(entries)), /TAR_/);
  }
  const bytes = tar([[observation.path, enc.encode('abcdef')]]);
  bytes[8] ^= 1;
  await assert.rejects(new TarSelection([observation], sink()).push(bytes), /CHECKSUM/);
  const missing = new TarSelection([observation], sink());
  await missing.push(tar([['other', enc.encode('x')]]));
  assert.throws(() => missing.finish(), /COMMITTED_MODALITY_MISSING/);
  const truncated = new TarSelection([observation], sink());
  await truncated.push(tar([[observation.path, enc.encode('abcdef')]]).subarray(0, 600));
  assert.throws(() => truncated.finish(), /TAR_TRUNCATED/);
});
test('cancellation propagates through sequential traversal', async () => {
  const bytes = zstd(tar([[observation.path, enc.encode('abcdef')]])),
    controller = new globalThis.AbortController();
  controller.abort();
  await assert.rejects(
    traverseZstd(
      stream(bytes),
      { size_bytes: bytes.length, checksum: 'md5:' + digest(bytes, 'md5') },
      [observation],
      sink(),
      hashers,
      () => {},
      controller.signal,
    ),
    /abort/i,
  );
});
test('Zstandard window limits, frame concatenation and checksums are framed before allocation', () => {
  const bytes = zstd(tar([[observation.path, enc.encode('abcdef')]]));
  const guard = new ZstdFrameGuard();
  for (const value of Buffer.concat([bytes, bytes])) guard.push(new Uint8Array([value]));
  guard.finish();
  assert.equal(guard.frames, 2);
  const tooLarge = new ZstdFrameGuard(1024);
  assert.throws(() => tooLarge.push(bytes), /ZSTD_WINDOW_LIMIT/);
  const truncated = new ZstdFrameGuard();
  truncated.push(bytes.subarray(0, -1));
  assert.throws(() => truncated.finish(), /ZSTD_TRUNCATED/);
  const trailing = new ZstdFrameGuard();
  trailing.push(bytes);
  trailing.push(new Uint8Array([0, 1]));
  assert.throws(() => trailing.finish(), /ZSTD_TRUNCATED/);
});
test('pinned hash runtimes agree with independent streaming hashes across many chunk boundaries', async () => {
  const bytes = Buffer.alloc(2 ** 20 + 177);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  for (const name of ['md5', 'sha256']) {
    const hash = await hashers[name]();
    hash.init();
    for (let i = 0; i < bytes.length; i += 13) hash.update(bytes.subarray(i, i + 13));
    assert.equal(hash.digest(), digest(bytes, name));
  }
});
test('classification drafts and source identity remain scoped to their explicit task and release', () => {
  assert.equal(sourceRef('13255198'), 'zenodo:13255198');
  assert.equal(sourceRef('grodata:128035:1.0'), 'grodata:128035:1.0');
  assert.throws(() => sourceRef('grodata:128035'), /INVALID_SOURCE/);
  const draft = emptyDraft();
  assert.deepEqual(readDraft(JSON.stringify(draft)), draft);
  for (const mutate of [
    (d) => (d.task_ref = 'task:instances'),
    (d) => (d.schema_version = '1.0.0'),
    (d) => (d.request.use = 'random'),
  ]) {
    const bad = structuredClone(draft);
    mutate(bad);
    assert.throws(() => readDraft(JSON.stringify(bad)), /REVIEW_REQUIRED/);
  }
});
test('worker storage preflight rejects before opening payloads or creating staging', async () => {
  const messages = [];
  const world = vm.createContext({
    self: { postMessage: (value) => messages.push(value) },
    loadContext: async () => ({ ctx: {}, pins: {} }),
    check: async () => ({ totals: { estimated_browser_storage_bytes: 1000 } }),
    navigator: {
      storage: {
        estimate: async () => ({ quota: 50, usage: 1 }),
        getDirectory: () => {
          throw Error('Unexpected staging access');
        },
      },
    },
    TASK: 'task:species',
    TextEncoder,
  });
  const code = fs
    .readFileSync(new URL('../browser-prepare/classification-worker.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '');
  vm.runInContext(code, world);
  await vm.runInContext("self.onmessage({data:{task_ref:'task:species',plan:{}}})", world);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'error');
  assert.equal(messages[0].code, 'INSUFFICIENT_STORAGE');
});
test('laz-perf preserves all native records in the fixed real bounded samples when locally available', async (t) => {
  const manifest = JSON.parse(
    fs.readFileSync(
      new URL('../evidence/classification/acceptance-manifest.json', import.meta.url),
    ),
  );
  const samples = manifest.native_samples || [];
  const files = samples.map(
    (o) =>
      new URL(
        '../temp/classification/' +
          (o.source_ref.startsWith('zenodo:')
            ? o.published_split + '-' + o.path
            : o.modality + '-' + o.path.split('/').at(-1)),
        import.meta.url,
      ),
  );
  if (!files.length || files.some((p) => !fs.existsSync(p)))
    return t.skip(
      'Regenerate bounded native samples locally; raw data is excluded from the repository',
    );
  const laz = await require('../browser-prepare/vendor/laz-perf-node.cjs')({
    wasmBinary: fs.readFileSync(
      new URL('../browser-prepare/vendor/laz-perf-node.wasm', import.meta.url),
    ),
  });
  for (let i = 0; i < samples.length; i++) {
    const o = samples[i],
      bytes = fs.readFileSync(files[i]);
    let points = 0;
    const report = await decodeObservation(
      new Blob([bytes]),
      o,
      laz,
      (block) => {
        points += block.points;
      },
      hashers,
    );
    assert.equal(report.status, 'validated');
    assert.equal(points, o.points);
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] ^= 1;
    await assert.rejects(
      decodeObservation(new Blob([changed]), o, laz, () => {}, hashers),
      /MEMBER_CHECKSUM/,
    );
  }
});
