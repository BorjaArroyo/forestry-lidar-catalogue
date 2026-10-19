/* Offline archive and bounded HTTP checks against the exact shipped ZIP reader. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {extractPlot, localReader, memberName, providerReader, MAX_RANGE_BYTES} from '../browser-prepare/intake.js';

const require = createRequire(import.meta.url);
const zip = require('../browser-prepare/vendor/zip.min.js');
zip.configure({useWebWorkers: false});
const plot = {path: 'sources/8287792/originals/FORinstance_dataset/RMIT/test.las', size_bytes: 6};
const asset = {size_bytes: 100, download_url: 'https://provider.invalid/pinned.zip'};

async function fixture(name = 'RMIT/test.las', content = 'abcdef', options = {}) {
  const writer = new zip.BlobWriter();
  const archive = new zip.ZipWriter(writer, {zip64: true, level: 0});
  await archive.add(name, new zip.TextReader(content), options);
  await archive.close();
  return writer.getData();
}

async function extracted(file, selected = plot) {
  const chunks = [];
  const result = await extractPlot(zip, localReader(zip, file), selected, async bytes => {
    chunks.push(bytes.slice());
  });
  return {result, bytes: Buffer.concat(chunks)};
}

test('ZIP64 extracts the exact selected member with CRC and bounded storage writes', async () => {
  const {bytes, result} = await extracted(await fixture());
  assert.equal(bytes.toString(), 'abcdef');
  assert.equal(result.archive_member, 'RMIT/test.las');
  assert.equal(result.crc32_checked, true);
  assert.match(result.archive_verification, /whole-archive checksum not checked/);
  assert.throws(() => memberName({path: '../foreign.las'}), /profile/);
});

test('missing member and mismatched source size fail before output completion', async () => {
  await assert.rejects(extracted(await fixture('different.las')), /absent/);
  await assert.rejects(extracted(await fixture(), {...plot, size_bytes: 7}), /contract/);
});

test('native deflate is decoded and truncated archive data is rejected', async () => {
  const blob = new zip.BlobWriter(); const writer = new zip.ZipWriter(blob, {level: 6});
  await writer.add('RMIT/test.las', new zip.TextReader('abcdef')); await writer.close();
  const file = await blob.getData();
  assert.equal((await extracted(file)).bytes.toString(), 'abcdef');
  await assert.rejects(extracted(file.slice(0, file.size - 32)));
});

test('a corrupted stored payload fails its actual ZIP CRC', async () => {
  const bytes = Buffer.from(await (await fixture()).arrayBuffer());
  const index = bytes.indexOf(Buffer.from('abcdef')); assert.ok(index >= 0);
  bytes[index] ^= 1;
  await assert.rejects(extracted(new Blob([bytes])), /CRC|signature|checksum/i);
});

test('Deflate64 literal blocks use the shipped decoder and verify CRC', async () => {
  const blob = new zip.BlobWriter(); const writer = new zip.ZipWriter(blob, {level: 6});
  await writer.add('RMIT/test.las', new zip.TextReader('abcdef')); await writer.close();
  // This literal-only Deflate stream is also valid Deflate64. Set method 9 in
  // both headers to exercise that decoder without claiming extended-code coverage.
  const bytes = Buffer.from(await (await blob.getData()).arrayBuffer());
  bytes.writeUInt16LE(9, bytes.indexOf(Buffer.from([0x50, 0x4b, 3, 4])) + 8);
  bytes.writeUInt16LE(9, bytes.indexOf(Buffer.from([0x50, 0x4b, 1, 2])) + 10);
  const result = await extracted(new Blob([bytes]));
  assert.equal(result.bytes.toString(), 'abcdef');
  assert.equal(result.result.compression_method, 9);
});

test('duplicate central-directory names are rejected', async () => {
  const blob = new zip.BlobWriter(); const writer = new zip.ZipWriter(blob, {level: 0});
  await writer.add('RMIT/test.las', new zip.TextReader('abcdef'));
  await writer.add('RMIT/tesx.las', new zip.TextReader('abcdef')); await writer.close();
  const bytes = Buffer.from(await (await blob.getData()).arrayBuffer());
  for (let offset = 0; (offset = bytes.indexOf('RMIT/tesx.las', offset)) >= 0; offset += 13)
    bytes.write('RMIT/test.las', offset);
  await assert.rejects(extracted(new Blob([bytes])), /duplicate|ambiguous/i);
});

test('unsafe member paths and symbolic links are rejected', async () => {
  await assert.rejects(extracted(await fixture('../evil.las')), /filename|unsafe|traversal/i);
  const file = await fixture('RMIT/test.las', 'abcdef', {externalFileAttributes: (0o120777 << 16) >>> 0, msDosCompatible: false});
  await assert.rejects(extracted(file), /contract/);
});

test('local reads are bounded even when archive metadata requests a giant allocation', async () => {
  const reader = localReader(zip, new Blob([new Uint8Array(MAX_RANGE_BYTES + 1)]));
  await assert.rejects(reader.readUint8Array(0, MAX_RANGE_BYTES + 1), /bound/);
});

test('a CORS response without exposed Content-Range still needs exact received bytes', async () => {
  let range;
  const remote = providerReader(zip, asset, plot, async (url, options) => {
    assert.equal(url, asset.download_url); range = options.headers.Range;
    return new Response(new Uint8Array([1, 2, 3]), {status: 206});
  });
  assert.deepEqual(await remote.reader.readUint8Array(4, 3), new Uint8Array([1, 2, 3]));
  assert.equal(range, 'bytes=4-6');
  assert.deepEqual(remote.stats, {requests: 1, bytes_received: 3});
});

test('an ignored range response is cancelled without reading its whole body', async () => {
  let cancelled = false;
  const remote = providerReader(zip, asset, plot, async () => new Response(new ReadableStream({
    cancel() { cancelled = true; },
  }), {status: 200}));
  await assert.rejects(remote.reader.readUint8Array(0, 5), /unavailable/);
  assert.equal(cancelled, true);
  assert.equal(remote.stats.bytes_received, 0);
});

test('incorrect range metadata, truncated body and extra body bytes are rejected', async () => {
  for (const response of [
    new Response(new Uint8Array(3), {status: 206, headers: {'Content-Range': 'bytes 5-7/100'}}),
    new Response(new Uint8Array(2), {status: 206}),
    new Response(new Uint8Array(4), {status: 206}),
  ]) {
    const remote = providerReader(zip, asset, plot, async () => response);
    await assert.rejects(remote.reader.readUint8Array(0, 3), /inconsistent|Truncated|exceeded/);
  }
});

test('invalid and oversized ranges are refused before any provider request', async () => {
  const remote = providerReader(zip, {...asset, size_bytes: MAX_RANGE_BYTES + 10}, plot, () => {
    throw Error('Network must not be called');
  });
  await assert.rejects(remote.reader.readUint8Array(-1, 3), /Invalid/);
  await assert.rejects(remote.reader.readUint8Array(0, MAX_RANGE_BYTES + 1), /bound/);
  assert.equal(remote.stats.requests, 0);
});

test('cumulative transfer is capped even when individual ranges are valid', async () => {
  const remote = providerReader(zip, {...asset, size_bytes: MAX_RANGE_BYTES}, plot,
    async () => new Response(new Uint8Array(MAX_RANGE_BYTES), {status: 206}));
  for (let i = 0; i < 4; i++) await remote.reader.readUint8Array(0, MAX_RANGE_BYTES);
  await assert.rejects(remote.reader.readUint8Array(0, MAX_RANGE_BYTES), /selected-plot bound/);
});
