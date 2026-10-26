import { validJob, readJSON, occupiedBytes, removeEntry } from './run-store.js';

export const classificationLock = (id) => 'canopy-classification:' + id;

export async function inspectClassificationRuns(browser = navigator) {
  const origin = await browser.storage.getDirectory();
  let jobs;
  try {
    jobs = await origin.getDirectoryHandle('canopy-classification');
  } catch (error) {
    if (error.name === 'NotFoundError') return [];
    throw error;
  }
  const runs = [];
  for await (const [id, root] of jobs.entries()) {
    if (root.kind !== 'directory' || !validJob(id)) continue;
    await browser.locks.request(classificationLock(id), { ifAvailable: true }, async (lock) => {
      const run = { id, status: lock ? 'interrupted' : 'busy' };
      if (lock) {
        try {
          const complete = await readJSON(root, 'complete.json');
          const file = await (await root.getFileHandle('prepared.zip')).getFile();
          if (complete.evidence?.status !== 'validated' || file.size !== complete.size_bytes)
            throw Error('Saved classification output is incomplete');
          Object.assign(run, { status: 'complete', file, evidence: complete.evidence });
        } catch (error) {
          if (error.name !== 'NotFoundError') run.detail = error.message;
        }
        run.bytes = await occupiedBytes(root);
      }
      runs.push(run);
    });
  }
  return runs;
}

export async function removeClassificationRun(id, browser = navigator) {
  if (!validJob(id)) throw Error('Invalid classification run identity');
  await browser.locks.request(classificationLock(id), { ifAvailable: true }, async (lock) => {
    if (!lock)
      throw Error('This classification run is active in another tab. Try again when it stops.');
    const origin = await browser.storage.getDirectory();
    let jobs;
    try {
      jobs = await origin.getDirectoryHandle('canopy-classification');
    } catch (error) {
      if (error.name === 'NotFoundError') return;
      throw error;
    }
    await removeEntry(jobs, id);
  });
}
