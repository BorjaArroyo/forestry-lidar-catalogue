/** Browser file-system operations used by preparation and checkpoint recovery. */
async function directory(root, path) {
  let current = root;
  for (const part of path.split('/').filter(Boolean))
    current = await current.getDirectoryHandle(part, { create: true });
  return current;
}

async function write(root, path, bytes) {
  const parts = path.split('/');
  const parent = await directory(root, parts.slice(0, -1).join('/'));
  const file = await parent.getFileHandle(parts.at(-1), { create: true });
  const handle = await file.createSyncAccessHandle();
  try {
    handle.truncate(0);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = handle.write(bytes.subarray(offset), { at: offset });
      if (!count) throw Error('Browser storage write stopped');
      offset += count;
    }
    handle.flush();
  } finally {
    handle.close();
  }
  return file;
}

async function checkpointFiles(root, manifest) {
  const files = [];
  for (const scene of manifest.scenes)
    for (const chunk of scene.chunks) {
      if (!/^plots\/[a-zA-Z0-9_-]+\/[0-9]+\.npz$/.test(chunk.path))
        throw Error('Invalid checkpoint block path');
      const parts = chunk.path.split('/');
      let parent = root;
      for (const part of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(part);
      files.push({ path: chunk.path, handle: await parent.getFileHandle(parts.at(-1)) });
    }
  return files;
}

async function mountBlocks(py, files, outputRoot) {
  const mounts = new Map();
  for (const file of files) {
    const parent = file.path.slice(0, file.path.lastIndexOf('/'));
    if (!mounts.has(parent)) mounts.set(parent, []);
    mounts
      .get(parent)
      .push({ name: file.path.split('/').at(-1), data: await file.handle.getFile() });
  }
  for (const [parent, blobs] of mounts) {
    py.FS.mkdirTree(outputRoot + '/' + parent);
    py.FS.mount(py.FS.filesystems.WORKERFS, { blobs }, outputRoot + '/' + parent);
  }
}

export { directory, write, checkpointFiles, mountBlocks };

export async function checkQuota({browser, groups, mode, reusable, executionPlan, resuming}) {
      const estimate = await browser.storage.estimate();
      const candidateBytes = groups.flatMap((g) =>
        g.candidates.map(
          (p) =>
            p.size_bytes +
            p.points * (g.profile.derivedBytesPerPoint || 34) +
            Math.ceil(p.points / 250000) * 65536,
        ),
      );
      const preparedBytes =
        mode === 'las' ? Math.max(...candidateBytes) : candidateBytes.reduce((a, b) => a + b, 0);
      const pendingBytes = groups
        .flatMap((g) =>
          g.candidates
            .filter((p) => !reusable.has(g.record + ':' + p.path))
            .map(
              (p) =>
                p.size_bytes +
                p.points * (g.profile.derivedBytesPerPoint || 34) +
                Math.ceil(p.points / 250000) * 65536,
            ),
        )
        .reduce((a, b) => a + b, 0);
      const stagingBytes = Math.max(
        0,
        ...groups.flatMap((g) =>
          g.candidates
            .filter((p) => !reusable.has(g.record + ':' + p.path))
            .map((p) => p.size_bytes),
        ),
      );
      const required =
        mode === 'zenodo' && resuming
          ? preparedBytes + pendingBytes + stagingBytes + 64 * 1024 ** 2
          : (executionPlan?.totals.estimated_browser_storage_bytes ??
            2 * preparedBytes + (mode === 'las' ? 0 : stagingBytes) + 64 * 1024 ** 2);
      if (!Number.isFinite(estimate.quota) || estimate.quota - (estimate.usage || 0) < required)
        throw Error(
          `Insufficient browser storage; approximately ${Math.ceil(required / 1048576)} MiB free is required for the selected dataset and ZIP export`,
        );

}
