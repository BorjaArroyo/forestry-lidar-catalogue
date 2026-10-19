/* Offline checks for the backendless download logic, run by CI with Node. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { md5 } from '../container-lab/md5.js';
import { smallAssets, verifyAsset } from '../container-lab/download.js';

const vectors = [
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['The quick brown fox jumps over the lazy dog', '9e107d9d372bb6826bd81d3542a419d6'],
  ['a'.repeat(1000000), '7707d6ae4e027c70eea2a935c2296f21'],
];
for (const [text, expected] of vectors)
  assert.equal(md5(new TextEncoder().encode(text)), expected, `md5("${text.slice(0, 24)}…")`);

const bytes = new TextEncoder().encode('abc');
assert.equal(verifyAsset(bytes, { size_bytes: 3, provider_checksum: 'md5:900150983cd24fb0d6963f7d28e17f72' }),
             '900150983cd24fb0d6963f7d28e17f72');
assert.throws(() => verifyAsset(bytes, { size_bytes: 4, provider_checksum: 'md5:900150983cd24fb0d6963f7d28e17f72' }), /size/);
assert.throws(() => verifyAsset(bytes, { size_bytes: 3, provider_checksum: 'md5:deadbeef' }), /checksum/);
assert.throws(() => verifyAsset(bytes, { size_bytes: 3, provider_checksum: 'sha256:abc' }), /Unsupported/);

const inventory = JSON.parse(readFileSync(new URL('../docs/lidar-acquisition-inventory.json', import.meta.url)));
const assets = smallAssets(inventory);
assert.ok(assets.length > 10, 'public inventory exposes several small assets');
assert.ok(assets.every(a => a.size_bytes <= 8 * 1024 * 1024), 'bound respected');
assert.deepEqual([...assets].sort((a, b) => a.size_bytes - b.size_bytes).map(a => a.name), assets.map(a => a.name),
                 'sorted by size');
const metadata = assets.find(a => a.record_id === 19351234 && a.name === 'metadata.yaml');
assert.equal(metadata.size_bytes, 2793);
assert.equal(metadata.provider_checksum, 'md5:a42b36c6f11e7c571b29d9006129c458');

console.log(`md5 vectors + verifyAsset + ${assets.length} bounded assets OK`);
