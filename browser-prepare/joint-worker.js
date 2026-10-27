/* One complete observation supplies point instances and tree-level taxonomy. */
import { loadJointContext } from './joint-runtime.js';
import { decodeObservation } from './classification-las.js';
import { extractPlot, providerReader } from './intake.js';
import { writeArchive } from './export.js';
import { directory, write, mountBlocks } from './storage.js';
import { fingerprint } from './classification-model.js';
import { fileHash } from './joint-store.js';

const phase = (text) => self.postMessage({ type: 'phase', text });
const encode = (value) => new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n');
let active = false;

export async function executeJoint({ context, py, plan, root, inputs = [], progress = phase }) {
  const tools = await context.tools();
  const files = [];
  py.globals.set('joint_plan_json', JSON.stringify(plan));
  py.runPython(
    "joint_plan = json.loads(joint_plan_json); check_joint(joint_source, joint_plan, runtime_sha256=joint_runtime_sha256); require_admitted(joint_source); joint_preparation = JointPreparation(joint_plan, '/joint-output')",
  );
  const staging = await root.getDirectoryHandle('staging', { create: true });
  for (const plot of plan.plots) {
    const local = inputs.find((input) => input.name === plot.path);
    let file = local;
    if (!file) {
      if (inputs.length) throw Error('Selected local cloud is missing: ' + plot.path);
      const asset = plan.archives.find((a) => a.name === plot.archive);
      const requested = { ...plot, archive_member: plot.path };
      const range = providerReader(tools.zip, asset, requested, context.nativeFetch, (stats) =>
        progress(`${plot.path}: ${(stats.bytes_received / 1048576).toFixed(1)} MiB retrieved…`),
      );
      const target = await staging.getFileHandle('cloud.laz', { create: true });
      const access = await target.createSyncAccessHandle();
      try {
        access.truncate(0);
        await extractPlot(tools.zip, range.reader, requested, async (bytes, position) => {
          let offset = 0;
          while (offset < bytes.length) {
            const count = access.write(bytes.subarray(offset), { at: position + offset });
            if (!count) throw Error('Joint source staging write stopped');
            offset += count;
          }
        });
        access.flush();
      } finally {
        access.close();
      }
      file = await target.getFile();
    }
    py.globals.set('joint_plot_path', plot.path);
    py.runPython('joint_preparation.begin_plot(joint_plot_path)');
    await decodeObservation(
      file,
      { ...plot, point_record_length: plot.native_schema.point_record_length },
      tools.laz,
      async ({ offset, points, bytes, scales, offsets, format }) => {
        if (
          format !== plot.native_schema.point_format ||
          scales.some((value, i) => value !== plot.native_schema.scales[i]) ||
          offsets.some((value, i) => value !== plot.native_schema.offsets[i])
        )
          throw Error('Joint native LAS schema differs from the audited plot');
        py.globals.set('joint_block_bytes', bytes);
        py.globals.set('joint_block_offset', offset);
        py.globals.set('joint_block_points', points);
        const block = JSON.parse(
          py.runPython(
            'json.dumps(joint_preparation.add_block(bytes(joint_block_bytes.to_py()), joint_block_offset, joint_block_points))',
          ),
        );
        const output = '/joint-output/' + block.path;
        files.push({
          path: block.path,
          handle: await write(root, block.path, py.FS.readFile(output)),
        });
        py.FS.unlink(output);
        py.globals.delete('joint_block_bytes');
        progress(
          `${plot.path}: ${offset + points} / ${plot.points} points; tree taxonomy stays on the tree axis`,
        );
      },
      tools.hashers,
    );
    py.runPython('joint_preparation.end_plot()');
    await staging.removeEntry('cloud.laz').catch(() => {});
  }
  const manifest = JSON.parse(py.runPython('json.dumps(joint_preparation.finish())'));
  for (const [name, value] of Object.entries({
    'dataset.json': manifest,
    'dataset-plan.json': plan,
  })) {
    files.push({ path: name, handle: await write(root, name, encode(value)) });
    py.FS.mkdirTree('/joint-validation');
    py.FS.writeFile('/joint-validation/' + name, encode(value));
  }
  // Mount immutable browser files back into the independent reader, one block at a time.
  await mountBlocks(
    py,
    files.filter((entry) => entry.path.endsWith('.npz')),
    '/joint-validation',
  );
  progress('Independently checking all native records, point-to-tree links and tree taxonomy…');
  const validation = JSON.parse(
    py.runPython("json.dumps(JointDataset('/joint-validation').validate())"),
  );
  files.push({
    path: 'validation-report.json',
    handle: await write(root, 'validation-report.json', encode(validation)),
  });
  let last = 0;
  progress('Both targets validated. Writing the dataset ZIP…');
  const file = await writeArchive(tools.zip, root, files, (bytes) => {
    if (performance.now() - last > 1000) {
      progress(`Writing joint dataset ZIP: ${(bytes / 1048576).toFixed(1)} MiB…`);
      last = performance.now();
    }
  });
  progress('Verifying the completed ZIP checksum…');
  const zipHash = await fileHash(file, await tools.hashers.sha256(), (bytes) => {
    if (performance.now() - last > 1000) {
      progress(`Checking ZIP checksum: ${(bytes / 1048576).toFixed(1)} MiB…`);
      last = performance.now();
    }
  });
  await write(
    root,
    'complete.json',
    encode({
      plan_sha256: plan.plan_sha256,
      size_bytes: file.size,
      zip_sha256: zipHash,
      validation,
    }),
  );
  return { file, validation, manifest };
}

self.onmessage = async ({ data }) => {
  if (active) return;
  active = true;
  let job, jobs;
  try {
    const context = await loadJointContext(self, phase);
    const py = await context.boot();
    py.globals.set('joint_request_json', JSON.stringify(data.request || {}));
    py.globals.set('joint_import_json', JSON.stringify(data.plan || null));
    const plan = JSON.parse(
      py.runPython(
        data.operation === 'review'
          ? 'json.dumps(resolve_joint(joint_source, json.loads(joint_request_json), runtime_sha256=joint_runtime_sha256))'
          : 'json.dumps(check_joint(joint_source, json.loads(joint_import_json), runtime_sha256=joint_runtime_sha256))',
      ),
    );
    if (['review', 'import'].includes(data.operation)) {
      self.postMessage({
        type: 'result',
        operation: data.operation,
        plan,
        admitted: context.source.admission?.status === 'admitted',
      });
      return;
    }
    py.runPython('require_admitted(joint_source)');
    const estimate = await navigator.storage.estimate();
    if (
      !Number.isFinite(estimate.quota) ||
      estimate.quota - (estimate.usage || 0) < plan.totals.estimated_browser_storage_bytes
    )
      throw Error('Insufficient browser storage for this joint plan and its ZIP');
    jobs = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('canopy-joint', { create: true });
    job = crypto.randomUUID();
    await navigator.locks.request('canopy-joint:' + job, async () => {
      const root = await directory(jobs, job);
      await write(
        root,
        'run.json',
        encode({ plan, request: plan.request, request_sha256: await fingerprint(plan.request) }),
      );
      self.postMessage({ type: 'job', id: job });
      const result = await executeJoint({ context, py, plan, root, inputs: data.inputs });
      self.postMessage({ type: 'result', operation: 'run', ...result });
    });
  } catch (error) {
    // Keep the journal so interrupted files remain discoverable and deletable.
    self.postMessage({ type: 'error', error: String(error.message || error), job });
  } finally {
    active = false;
  }
};
