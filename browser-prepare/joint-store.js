/* Saved joint outputs stay discoverable after reload; interrupted work restarts. */
import { validJob, readJSON, occupiedBytes, removeEntry } from './run-store.js';

export async function inspectJointRuns(browser = navigator) {
  let jobs;
  try {
    jobs = await (await browser.storage.getDirectory()).getDirectoryHandle('canopy-joint');
  } catch (error) {
    if (error.name === 'NotFoundError') return [];
    throw error;
  }
  const runs = [];
  for await (const [id, root] of jobs.entries()) {
    if (root.kind !== 'directory' || !validJob(id)) continue;
    await browser.locks.request(
      'canopy-joint:' + id,
      { ifAvailable: true, mode: 'shared' },
      async (lock) => {
        const run = { id, status: lock ? 'interrupted' : 'busy' };
        if (lock) {
          try {
            const complete = await readJSON(root, 'complete.json');
            const file = await (await root.getFileHandle('prepared.zip')).getFile();
            if (
              complete.validation?.status !== 'validated' ||
              file.size !== complete.size_bytes ||
              !/^[0-9a-f]{64}$/.test(complete.zip_sha256)
            )
              throw Error('Saved joint ZIP is incomplete');
            Object.assign(run, { status: 'complete', file, complete });
          } catch (error) {
            if (error.name !== 'NotFoundError') run.detail = error.message;
          }
          run.bytes = await occupiedBytes(root);
        }
        runs.push(run);
      },
    );
  }
  return runs;
}

export async function removeJointRun(id, browser = navigator) {
  if (!validJob(id)) throw Error('Invalid joint run identity');
  // A short inspection may still hold a shared lock when its row becomes visible.
  // Queue behind readers, while keeping an active worker protected by its exclusive lock.
  await browser.locks.request(
    'canopy-joint:' + id,
    { signal: AbortSignal.timeout(3000) },
    async () => {
      const jobs = await (await browser.storage.getDirectory()).getDirectoryHandle('canopy-joint');
      await removeEntry(jobs, id);
    },
  );
}

export async function fileHash(file, hasher, progress = () => {}) {
  hasher.init();
  let received = 0;
  for await (const bytes of file.stream()) {
    hasher.update(bytes);
    received += bytes.length;
    progress(received);
  }
  return hasher.digest();
}
