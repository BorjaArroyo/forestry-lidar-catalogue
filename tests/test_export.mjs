import test from 'node:test';
import assert from 'node:assert/strict';
import { writeArchive } from '../browser-prepare/export.js';
import { MemoryDirectory } from './browser-memory-fs.mjs';

test('ZIP output reports actual stored bytes, including partial writes', async () => {
  const root = new MemoryDirectory();
  const file = await root.getFileHandle('prepared.zip', { create: true });
  const original = file.createSyncAccessHandle.bind(file);
  file.createSyncAccessHandle = async () => {
    const access = await original();
    return { ...access, write: (bytes, options) => access.write(bytes.subarray(0, 2), options) };
  };
  const progress = [];
  const zip = {
    BlobReader: class {},
    ZipWriter: class {
      constructor(stream) {
        this.sink = stream.getWriter();
      }
      async add() {
        await this.sink.write(new Uint8Array([1, 2, 3, 4, 5]));
      }
      async close() {
        await this.sink.close();
      }
    },
  };
  const output = await writeArchive(
    zip,
    root,
    [
      { path: 'one', handle: file },
      { path: 'two', handle: file },
    ],
    (bytes) => progress.push(bytes),
  );
  assert.deepEqual(progress, [2, 4, 5, 7, 9, 10]);
  assert.equal(output.size, 10);
});
