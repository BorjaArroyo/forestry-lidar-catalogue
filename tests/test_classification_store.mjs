import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDirectory } from './browser-memory-fs.mjs';
import { write } from '../browser-prepare/storage.js';
import {
  inspectClassificationRuns,
  removeClassificationRun,
  classificationLock,
} from '../browser-prepare/classification-store.js';

const id = '12345678-1234-1234-1234-123456789abc';
async function fixture({ busy = false, complete = false, corrupt = false } = {}) {
  const origin = new MemoryDirectory();
  const jobs = await origin.getDirectoryHandle('canopy-classification', { create: true });
  const root = await jobs.getDirectoryHandle(id, { create: true });
  await write(root, 'prepared.zip', new Uint8Array([1, 2, 3]));
  if (complete)
    await write(
      root,
      'complete.json',
      new TextEncoder().encode(
        JSON.stringify({
          size_bytes: corrupt ? 4 : 3,
          evidence: { status: 'validated' },
        }),
      ),
    );
  const browser = {
    storage: { getDirectory: async () => origin },
    locks: {
      request: async (name, options, fn) => {
        assert.equal(name, classificationLock(id));
        assert.equal(options.ifAvailable, true);
        return fn(busy ? null : {});
      },
    },
  };
  return { browser, jobs };
}

test('completed classification ZIPs are recoverable from storage without page state', async () => {
  const { browser, jobs } = await fixture({ complete: true });
  const [run] = await inspectClassificationRuns(browser);
  assert.equal(run.status, 'complete');
  assert.equal(run.file.size, 3);
  await removeClassificationRun(id, browser);
  assert.equal(jobs.children.size, 0);
  await removeClassificationRun(id, browser);
});
test('interrupted, legacy and damaged exports remain discoverable for explicit deletion', async () => {
  for (const options of [{}, { complete: true, corrupt: true }]) {
    const { browser, jobs } = await fixture(options);
    const [run] = await inspectClassificationRuns(browser);
    assert.equal(run.status, 'interrupted');
    assert.equal(run.file, undefined);
    assert.ok(run.bytes >= 3);
    await removeClassificationRun(id, browser);
    assert.equal(jobs.children.size, 0);
  }
});
test('another tab cannot delete an active classification run, even from a stale list', async () => {
  const { browser, jobs } = await fixture({ busy: true, complete: true });
  const [run] = await inspectClassificationRuns(browser);
  assert.equal(run.status, 'busy');
  assert.equal(run.file, undefined);
  await assert.rejects(removeClassificationRun(id, browser), /active in another tab/);
  assert.equal(jobs.children.size, 1);
});
