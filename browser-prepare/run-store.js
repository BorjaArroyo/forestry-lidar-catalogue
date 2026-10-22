/* Durable browser runs. A checkpoint is committed only after independent validation. */
export const RUN_VERSION = '1.0.0';
export const validJob = (id) =>
  typeof id === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export const lockName = (id) => 'canopy-preparation:' + id;
export async function readJSON(root, name) {
  return JSON.parse(await (await (await root.getFileHandle(name)).getFile()).text());
}
export async function openRun(id, create = false) {
  if (!validJob(id)) throw Error('Invalid saved run identity');
  const origin = await navigator.storage.getDirectory();
  const jobs = await origin.getDirectoryHandle('canopy-preparation', { create });
  return { jobs, root: await jobs.getDirectoryHandle(id, { create }) };
}
export async function removeEntry(root, name) {
  try {
    await root.removeEntry(name, { recursive: true });
  } catch (error) {
    if (error.name !== 'NotFoundError') throw error;
  }
}
export async function occupiedBytes(root) {
  let bytes = 0;
  for await (const handle of root.values())
    bytes +=
      handle.kind === 'directory' ? await occupiedBytes(handle) : (await handle.getFile()).size;
  return bytes;
}
export async function inspectRuns(browser = navigator) {
  const origin = await browser.storage.getDirectory();
  let jobs;
  try {
    jobs = await origin.getDirectoryHandle('canopy-preparation');
  } catch (error) {
    if (error.name === 'NotFoundError') return [];
    throw error;
  }
  const runs = [];
  for await (const [id, root] of jobs.entries()) {
    if (root.kind !== 'directory' || !validJob(id)) continue;
    await browser.locks.request(lockName(id), { ifAvailable: true }, async (lock) => {
      if (!lock) {
        runs.push({ id, status: 'busy' });
        return;
      }
      const run = { id, status: 'interrupted', completed: 0 };
      try {
        const saved = await readJSON(root, 'run.json');
        if (saved.schema_version !== RUN_VERSION || saved.mode !== 'zenodo')
          throw Error('Unsupported saved run version');
        Object.assign(run, { saved, resumable: true });
        const sources = await root.getDirectoryHandle('sources').catch((error) => {
          if (error.name !== 'NotFoundError') throw error;
        });
        if (sources)
          for await (const source of sources.values()) {
            if (source.kind !== 'directory') continue;
            const checkpoints = await source.getDirectoryHandle('checkpoints').catch((error) => {
              if (error.name !== 'NotFoundError') throw error;
            });
            if (checkpoints)
              for await (const checkpoint of checkpoints.values()) {
                try {
                  if (
                    (await readJSON(checkpoint, 'checkpoint.json')).schema_version === RUN_VERSION
                  )
                    run.completed++;
                } catch {
                  /* Incomplete markers are never reusable; the worker checks every committed payload. */
                }
              }
          }
      } catch (error) {
        run.detail = error.message;
      }
      try {
        const complete = await readJSON(root, 'complete.json');
        const file = await (await root.getFileHandle('prepared.zip')).getFile();
        if (file.size !== complete.size_bytes) throw Error('Saved ZIP size changed');
        Object.assign(run, { status: 'complete', file, evidence: complete.evidence });
      } catch (error) {
        if (error.name !== 'NotFoundError') run.detail = error.message;
      }
      run.bytes = await occupiedBytes(root);
      runs.push(run);
    });
  }
  return runs;
}
