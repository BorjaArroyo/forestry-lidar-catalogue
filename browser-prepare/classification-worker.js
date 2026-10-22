import { check, resolve, sourceFolder, TASK } from './classification-model.js';
import { loadContext, loadTools, sha256 } from './classification-runtime.js';
import { decodeObservation } from './classification-las.js';
import { traverseZstd } from './classification-intake.js';
import { extractPlot, localReader, providerReader } from './intake.js';

const encode = (value) => new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n');
const phase = (text) => self.postMessage({ type: 'phase', text });
async function directory(root, path) {
  let dir = root;
  for (const part of path.split('/').filter(Boolean))
    dir = await dir.getDirectoryHandle(part, { create: true });
  return dir;
}
async function target(root, path) {
  const parts = path.split('/');
  return (await directory(root, parts.slice(0, -1).join('/'))).getFileHandle(parts.at(-1), {
    create: true,
  });
}
function writeAll(access, bytes, position = 0) {
  let offset = 0;
  while (offset < bytes.length) {
    const count = access.write(bytes.subarray(offset), { at: position + offset });
    if (!count) throw Error('STORAGE_WRITE_FAILED');
    offset += count;
  }
}
async function write(root, path, bytes) {
  const file = await target(root, path),
    access = await file.createSyncAccessHandle();
  try {
    access.truncate(0);
    writeAll(access, bytes);
    access.flush();
  } finally {
    access.close();
  }
  return { path, handle: file };
}
async function streamFor(asset, inputs) {
  const file = inputs?.find(
    (input) => input.source_ref === asset.source_ref && input.archive === asset.name,
  )?.file;
  if (file) {
    if (file.size !== asset.size_bytes) throw Error('ARCHIVE_SIZE_MISMATCH');
    return file.stream();
  }
  if (inputs?.length) throw Error('LOCAL_ARCHIVE_MISSING: ' + asset.source_ref + '/' + asset.name);
  const response = await fetch(asset.url, {
    credentials: 'omit',
    signal: AbortSignal.timeout(24 * 3600 * 1000),
  });
  if (!response.ok || !response.body) throw Error('ARCHIVE_HTTP_' + response.status);
  const length = response.headers.get('Content-Length');
  if (length !== null && Number(length) !== asset.size_bytes) {
    await response.body.cancel();
    throw Error('ARCHIVE_SIZE_MISMATCH');
  }
  return response.body;
}
async function execute(plan, inputs, tools, root) {
  const files = [],
    observations = [],
    verification = [];
  async function prepare(file, observation) {
    const index = plan.observations.findIndex(
      (o) =>
        o.source_ref === observation.source_ref && o.observation_id === observation.observation_id,
    );
    const prefix = `${observation.published_split}/${sourceFolder(observation.source_ref)}/observations/${index}`;
    const blocks = [];
    const report = await decodeObservation(
      file,
      observation,
      tools.laz,
      async (block) => {
        const coords = new Uint8Array(block.points * 24),
          coordsView = new DataView(coords.buffer),
          raw = new DataView(block.bytes.buffer, block.bytes.byteOffset, block.bytes.length);
        for (let i = 0; i < block.points; i++)
          for (let axis = 0; axis < 3; axis++)
            coordsView.setFloat64(
              i * 24 + axis * 8,
              raw.getInt32(i * block.pointSize + axis * 4, true) * block.scales[axis] +
                block.offsets[axis],
              true,
            );
        const records_path = `${prefix}/blocks/${block.offset}.records.bin`,
          xyz_path = `${prefix}/blocks/${block.offset}.xyz.f64`;
        const records_sha256 = await sha256(block.bytes),
          xyz_sha256 = await sha256(coords);
        const reference = observation.chunks?.find((c) => c.offset === block.offset);
        if (
          !reference ||
          reference.points !== block.points ||
          reference.native_records_sha256 !== records_sha256 ||
          reference.xyz_sha256 !== xyz_sha256
        )
          throw Error('NATIVE_BLOCK_EQUIVALENCE_FAILED');
        files.push(
          await write(root, records_path, block.bytes),
          await write(root, xyz_path, coords),
        );
        blocks.push({
          offset: block.offset,
          points: block.points,
          records_path,
          xyz_path,
          records_sha256,
          xyz_sha256,
        });
        phase(
          `${observation.source_ref} / ${observation.tree_id} / ${observation.modality}: ${block.offset + block.points} / ${observation.points} points`,
        );
      },
      tools.hashers,
    );
    const original_path = prefix + '/original.' + observation.path.split('.').at(-1).toLowerCase();
    // Copy with bounded slices; the original cloud is included for independent revalidation.
    const original = await target(root, original_path),
      access = await original.createSyncAccessHandle();
    try {
      access.truncate(0);
      for (let offset = 0; offset < file.size; offset += 1024 ** 2)
        writeAll(
          access,
          new Uint8Array(await file.slice(offset, offset + 1024 ** 2).arrayBuffer()),
          offset,
        );
      access.flush();
    } finally {
      access.close();
    }
    files.push({ path: original_path, handle: original });
    observations.push({ ...observation, blocks, original_path, validation: report });
  }
  for (const asset of plan.archives) {
    const selected = plan.observations.filter(
      (o) => o.source_ref === asset.source_ref && o.archive === asset.name,
    );
    if (asset.traversal === 'sequential-complete') {
      let access,
        file,
        position = 0;
      const sink = {
        async start() {
          file = await target(root, 'staging/cloud');
          access = await file.createSyncAccessHandle();
          access.truncate(0);
          position = 0;
        },
        async write(bytes) {
          writeAll(access, bytes, position);
          position += bytes.length;
        },
        async end(observation) {
          access.flush();
          access.close();
          access = null;
          await prepare(await file.getFile(), observation);
        },
        async close() {
          if (access) {
            access.close();
            access = null;
          }
        },
      };
      phase(
        `Traversing ${asset.name} once: ${(asset.size_bytes / 1e9).toFixed(2)} GB; selected clouds do not reduce this transfer`,
      );
      let lastProgress = 0;
      const report = await traverseZstd(
        await streamFor(asset, inputs),
        asset,
        selected,
        sink,
        tools.hashers,
        (n, total) => {
          const now = performance.now();
          if (n === total || now - lastProgress >= 1000) {
            phase(
              `${asset.name}: ${(n / 1e9).toFixed(3)} / ${(total / 1e9).toFixed(2)} GB traversed`,
            );
            lastProgress = now;
          }
        },
      );
      verification.push({ source_ref: asset.source_ref, ...report });
    } else {
      for (const observation of selected) {
        const local = inputs?.find(
          (i) => i.source_ref === asset.source_ref && i.archive === asset.name,
        )?.file;
        if (inputs?.length && !local) throw Error('LOCAL_ARCHIVE_MISSING: ' + asset.name);
        if (local && local.size !== asset.size_bytes) throw Error('ARCHIVE_SIZE_MISMATCH');
        const member = { ...observation, archive_member: observation.path };
        const remote = local
          ? null
          : providerReader(tools.zip, { ...asset, download_url: asset.url }, member, fetch);
        const reader = local ? localReader(tools.zip, local) : remote.reader;
        const file = await target(root, 'staging/cloud'),
          access = await file.createSyncAccessHandle();
        try {
          access.truncate(0);
          await extractPlot(
            tools.zip,
            reader,
            member,
            (bytes, offset) => writeAll(access, bytes, offset),
            () => {},
            { maxEntries: 25000 },
          );
          access.flush();
        } finally {
          access.close();
        }
        await prepare(await file.getFile(), observation);
      }
      verification.push({
        source_ref: asset.source_ref,
        archive: asset.name,
        selected_members_verified: true,
        provider_checksum_verified: false,
        traversals: null,
      });
    }
  }
  if (observations.length !== plan.observations.length)
    throw Error('PLANNED_SOURCE_OR_OBSERVATION_MISSING');
  // Reread all stored payloads independently of the writer before creating the ZIP.
  for (const observation of observations)
    for (const block of observation.blocks)
      for (const [name, hash] of [
        [block.records_path, block.records_sha256],
        [block.xyz_path, block.xyz_sha256],
      ]) {
        const file = await (await target(root, name)).getFile();
        if ((await sha256(await file.arrayBuffer())) !== hash)
          throw Error('STORED_BLOCK_CORRUPTED');
      }
  const manifest = {
    schema: 'tree-classification-dataset:1.0.0',
    task_ref: TASK,
    plan_sha256: plan.plan_sha256,
    trees: plan.trees,
    observations,
    rights: plan.rights,
    spatial_audit: plan.spatial_audit,
    archive_verification: verification,
    vocabulary: 'vocabulary.json',
    plan: 'dataset-plan.json',
    partition_policy: 'preserve-published',
  };
  const evidence = {
    status: 'validated',
    scope: 'Exported selection with complete member/native references; no whole-source admission',
    totals: plan.totals,
    runtime_sha256: plan.runtime_sha256,
    code_sha256: plan.code_sha256,
    user_agent: navigator.userAgent,
    archive_verification: verification,
    observed_memory: {
      laz_perf_heap_bytes: tools.laz.HEAPU8.byteLength,
      process_peak_bytes: null,
      scope: 'Allocated decoder heap at completion; not whole-process peak memory',
    },
  };
  for (const [path, value] of Object.entries({
    'dataset.json': manifest,
    'vocabulary.json': plan.vocabulary,
    'dataset-plan.json': plan,
    'browser-run.json': evidence,
    'spatial-audit.json': plan.spatial_audit,
    'source-conditions.json': plan.rights,
  }))
    files.push(await write(root, path, encode(value)));
  phase('All sources verified. Writing one dataset ZIP…');
  const archive = await target(root, 'prepared.zip'),
    access = await archive.createSyncAccessHandle();
  let position = 0;
  try {
    access.truncate(0);
    const output = new WritableStream({
      write(bytes) {
        writeAll(access, bytes, position);
        position += bytes.length;
      },
    });
    const writer = new tools.zip.ZipWriter(output, { level: 0, zip64: true });
    for (const entry of files)
      await writer.add(entry.path, new tools.zip.BlobReader(await entry.handle.getFile()));
    await writer.close();
    access.flush();
  } finally {
    access.close();
  }
  return { file: await archive.getFile(), evidence };
}
let active = false;
self.onmessage = async ({ data }) => {
  if (active) return;
  active = true;
  let jobs, job;
  try {
    const { ctx, pins, read } = await loadContext();
    if (data.task_ref !== TASK) throw Error('TASK_MISMATCH');
    const plan =
      data.operation === 'review'
        ? await resolve(ctx, data.request, data.subsets, pins)
        : await check(ctx, data.plan, pins);
    if (['review', 'import'].includes(data.operation)) {
      self.postMessage({ type: 'result', operation: data.operation, plan });
      return;
    }
    const estimate = await navigator.storage.estimate();
    if (
      !Number.isFinite(estimate.quota) ||
      estimate.quota - (estimate.usage || 0) < plan.totals.estimated_browser_storage_bytes
    )
      throw Error('INSUFFICIENT_STORAGE');
    const origin = await navigator.storage.getDirectory();
    jobs = await origin.getDirectoryHandle('canopy-classification', { create: true });
    job = crypto.randomUUID();
    const root = await jobs.getDirectoryHandle(job, { create: true });
    self.postMessage({ type: 'job', id: job });
    const result = await execute(plan, data.inputs, await loadTools(read), root);
    self.postMessage({ type: 'result', ...result });
    // Export is a File snapshot; release worker staging after the client receives it.
  } catch (error) {
    if (job) await jobs.removeEntry(job, { recursive: true }).catch(() => {});
    self.postMessage({
      type: 'error',
      code: String(error.message).split(':')[0],
      error: String(error.message || error),
    });
  }
};
