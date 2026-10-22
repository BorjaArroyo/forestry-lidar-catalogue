/** Prepare one reviewed LAS plot and mount its outputs for validation. */
import { write } from './storage.js';

async function preparePlot(
  py,
  root,
  file,
  profile,
  taskPlan,
  expectedPath,
  files,
  outputRoot,
  emitPhase,
) {
  py.FS.mount(
    py.FS.filesystems.WORKERFS,
    { blobs: [{ name: 'source.las', data: file }] },
    '/input',
  );
  try {
    emitPhase('Verifying the complete source LAS against the reviewed SHA256…');
    profile.start(py);
    const scene = JSON.parse(py.runPython('json.dumps(prep.scene)'));
    if (!taskPlan.allowed_partitions.includes(scene.published_split))
      throw Error('Source belongs to a published partition excluded from this task use');
    if (expectedPath && scene.path !== expectedPath)
      throw Error('Extracted LAS belongs to a different reviewed plot');
    const sceneFiles = [];
    for (;;) {
      const chunk = JSON.parse(py.runPython("json.dumps(prep.next_block('/chunk.npz'))"));
      if (!chunk) break;
      // One source and one output block at a time, regardless of dataset size.
      const handle = await write(root, chunk.path, py.FS.readFile('/chunk.npz'));
      py.FS.unlink('/chunk.npz');
      sceneFiles.push({ path: chunk.path, handle });
      emitPhase(
        `Prepared ${(chunk.offset + chunk.points).toLocaleString()} of ${scene.points.toLocaleString()} points in ${profile.plotLabel(scene.path)}…`,
      );
    }
    files.push(...sceneFiles);
    py.FS.mkdirTree(outputRoot + '/plots/' + scene.id);
    const mounted = await Promise.all(
      sceneFiles.map(async (f) => ({
        name: f.path.split('/').at(-1),
        data: await f.handle.getFile(),
      })),
    );
    py.FS.mount(py.FS.filesystems.WORKERFS, { blobs: mounted }, outputRoot + '/plots/' + scene.id);
    // Keep the authoritative JSON text: JavaScript otherwise turns 1.0 into 1 in native schema descriptors.
    const manifestText = py.runPython('json.dumps(prep.manifest)');
    return { manifest: JSON.parse(manifestText), manifestText };
  } finally {
    py.runPython("prep.reader.close() if 'prep' in globals() else None");
    py.FS.unmount('/input');
  }
}

export { preparePlot };
