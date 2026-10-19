// Backendless download of small pinned record assets straight from the
// provider (Zenodo), verified against the published acquisition inventory.
// Bounded to MAX_DOWNLOAD_BYTES so this prototype stays honest about scale.
import { md5 } from './md5.js';

export const INVENTORY_URL = '../docs/lidar-acquisition-inventory.json';
export const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

export function smallAssets(inventory, limit = MAX_DOWNLOAD_BYTES) {
  return inventory.records
    .flatMap(record => record.files.map(asset => ({ ...asset, record_id: record.record_id, title: record.title })))
    .filter(asset => Number.isFinite(asset.size_bytes) && asset.size_bytes <= limit)
    .sort((a, b) => a.size_bytes - b.size_bytes);
}

export function verifyAsset(bytes, asset) {
  if (bytes.byteLength !== asset.size_bytes)
    throw Error(`Downloaded size ${bytes.byteLength} != pinned ${asset.size_bytes}`);
  const [algorithm, expected] = String(asset.provider_checksum).split(':');
  if (algorithm !== 'md5') throw Error(`Unsupported provider checksum: ${algorithm}`);
  const digest = md5(bytes);
  if (digest !== expected.toLowerCase())
    throw Error(`Provider checksum mismatch: md5:${digest} != pinned ${asset.provider_checksum}`);
  return digest;
}

export async function fetchVerifiedAsset(asset, onProgress) {
  const response = await fetch(asset.download_url);
  if (!response.ok) throw Error(`Provider HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.byteLength > MAX_DOWNLOAD_BYTES)
      throw Error(`Asset exceeded the ${MAX_DOWNLOAD_BYTES} byte prototype bound`);
    chunks.push(value);
    received += value.byteLength;
    if (onProgress) onProgress(received, asset.size_bytes);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const digest = verifyAsset(bytes, asset);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
                            b => b.toString(16).padStart(2, '0')).join('');
  return { bytes, md5: digest, sha256, size_bytes: received };
}
