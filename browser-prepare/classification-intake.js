/* Bounded sequential TAR/Zstandard intake. Every chosen archive is traversed once. */
import { Decompress } from './vendor/fzstd.mjs';

export function safeMember(name) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.startsWith('/') ||
    /[\\\0:]/.test(name) ||
    name
      .replace(/\/$/, '')
      .split('/')
      .some((p) => !p || p === '.' || p === '..')
  )
    throw Error('TAR_UNSAFE_PATH: ' + name);
  return name;
}
const decoder = new TextDecoder('utf-8', { fatal: true });
function field(bytes) {
  return decoder.decode(bytes.subarray(0, bytes.indexOf(0) < 0 ? bytes.length : bytes.indexOf(0)));
}
function octal(bytes) {
  const text = field(bytes).trim();
  if (!/^[0-7]+$/.test(text)) throw Error('TAR_INVALID_NUMBER');
  const number = parseInt(text, 8);
  if (!Number.isSafeInteger(number) || number < 0) throw Error('TAR_SIZE_LIMIT');
  return number;
}

// Inspect framing before fzstd can allocate its window, including concatenated
// frames. Block payloads are skipped with a counter, never accumulated here.
export class ZstdFrameGuard {
  constructor(maxWindowBytes = 64 * 1024 ** 2) {
    this.maxWindowBytes = maxWindowBytes;
    this.state = 'frame';
    this.header = [];
    this.remaining = 0;
    this.next = null;
    this.checksum = false;
    this.frames = 0;
  }
  push(bytes) {
    for (let offset = 0; offset < bytes.length;) {
      if (this.remaining) {
        const count = Math.min(this.remaining, bytes.length - offset);
        offset += count;
        this.remaining -= count;
        if (!this.remaining) this.state = this.next;
        continue;
      }
      this.header.push(bytes[offset++]);
      const h = this.header;
      if (this.state === 'frame') {
        if (h.length < 5) continue;
        const magic = (h[0] | (h[1] << 8) | (h[2] << 16) | (h[3] << 24)) >>> 0;
        if (magic >= 0x184d2a50 && magic <= 0x184d2a5f) {
          if (h.length < 8) continue;
          this.remaining = (h[4] | (h[5] << 8) | (h[6] << 16) | (h[7] << 24)) >>> 0;
          this.state = this.remaining ? 'skip' : 'frame';
          this.next = 'frame';
          this.header = [];
          this.frames++;
          continue;
        }
        if (magic !== 0xfd2fb528) throw Error('ZSTD_INVALID_FRAME');
        const descriptor = h[4],
          single = Boolean(descriptor & 32),
          fcs = [single ? 1 : 0, 2, 4, 8][descriptor >>> 6];
        if (descriptor & 8) throw Error('ZSTD_RESERVED_HEADER');
        if (descriptor & 3) throw Error('ZSTD_DICTIONARY_UNSUPPORTED');
        const size = 5 + (single ? 0 : 1) + fcs;
        if (h.length < size) continue;
        let window;
        if (single) {
          let value = 0n;
          for (let i = 0; i < fcs; i++) value |= BigInt(h[5 + i]) << BigInt(i * 8);
          if (fcs === 2) value += 256n;
          if (value > BigInt(this.maxWindowBytes)) throw Error('ZSTD_WINDOW_LIMIT');
          window = Number(value);
        } else window = 2 ** (10 + (h[5] >>> 3)) * (1 + (h[5] & 7) / 8);
        if (window > this.maxWindowBytes) throw Error('ZSTD_WINDOW_LIMIT');
        this.checksum = Boolean(descriptor & 4);
        this.state = 'block';
        this.header = [];
        this.frames++;
      } else if (this.state === 'block') {
        if (h.length < 3) continue;
        const bits = h[0] | (h[1] << 8) | (h[2] << 16),
          type = (bits >>> 1) & 3,
          size = bits >>> 3,
          last = Boolean(bits & 1);
        if (type === 3 || size > 131072) throw Error('ZSTD_INVALID_BLOCK');
        this.remaining = type === 1 ? 1 : size;
        this.next = last ? (this.checksum ? 'checksum' : 'frame') : 'block';
        this.state = this.remaining ? 'payload' : this.next;
        this.header = [];
      } else if (this.state === 'checksum') {
        if (h.length === 4) {
          this.state = 'frame';
          this.header = [];
        }
      } else throw Error('ZSTD_INVALID_FRAMING');
    }
  }
  finish() {
    if (!this.frames || this.state !== 'frame' || this.header.length || this.remaining)
      throw Error('ZSTD_TRUNCATED_FRAME');
  }
}

export class TarSelection {
  constructor(observations, sink, { maxEntries = 100000, maxMemberBytes = 8 * 1024 ** 3 } = {}) {
    this.wanted = new Map(observations.map((o) => [safeMember(o.path), o]));
    if (this.wanted.size !== observations.length) throw Error('TAR_DUPLICATE_SELECTION');
    this.sink = sink;
    this.maxEntries = maxEntries;
    this.maxMemberBytes = maxMemberBytes;
    this.header = new Uint8Array(512);
    this.headerUsed = 0;
    this.remaining = 0;
    this.padding = 0;
    this.current = null;
    this.seen = new Set();
    this.found = new Set();
    this.zeroBlocks = 0;
    this.entries = 0;
  }
  async push(bytes) {
    let offset = 0;
    while (offset < bytes.length) {
      if (this.remaining) {
        const length = Math.min(this.remaining, bytes.length - offset);
        if (this.current) await this.sink.write(bytes.subarray(offset, offset + length));
        this.remaining -= length;
        offset += length;
        if (!this.remaining && this.current) {
          await this.sink.end(this.current);
          this.found.add(this.current.path);
          this.current = null;
        }
      } else if (this.padding) {
        const length = Math.min(this.padding, bytes.length - offset);
        if (bytes.subarray(offset, offset + length).some((b) => b !== 0))
          throw Error('TAR_NONZERO_PADDING');
        this.padding -= length;
        offset += length;
      } else {
        const length = Math.min(512 - this.headerUsed, bytes.length - offset);
        this.header.set(bytes.subarray(offset, offset + length), this.headerUsed);
        this.headerUsed += length;
        offset += length;
        if (this.headerUsed !== 512) continue;
        this.headerUsed = 0;
        const header = this.header;
        if (header.every((b) => b === 0)) {
          this.zeroBlocks++;
          continue;
        }
        if (this.zeroBlocks) throw Error('TAR_TRAILING_DATA');
        if (++this.entries > this.maxEntries) throw Error('TAR_ENTRY_LIMIT');
        let sum = 0;
        for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
        if (sum !== octal(header.subarray(148, 156))) throw Error('TAR_HEADER_CHECKSUM');
        const name = field(header.subarray(0, 100)),
          prefix = field(header.subarray(345, 500));
        const path = safeMember(prefix ? prefix + '/' + name : name);
        if (this.seen.has(path)) throw Error('TAR_DUPLICATE_MEMBER: ' + path);
        this.seen.add(path);
        const type = header[156];
        if (![0, 48, 53].includes(type))
          throw Error('TAR_UNSUPPORTED_MEMBER: links and extensions require audited support');
        const size = octal(header.subarray(124, 136));
        if (size > this.maxMemberBytes || (type === 53 && size !== 0))
          throw Error('TAR_SIZE_LIMIT');
        const selected = this.wanted.get(path);
        if (selected && (type === 53 || selected.size_bytes !== size))
          throw Error('TAR_MEMBER_MISMATCH: ' + path);
        this.remaining = size;
        this.padding = (512 - (size % 512)) % 512;
        if (selected) {
          this.current = selected;
          await this.sink.start(selected);
          if (!size) {
            await this.sink.end(selected);
            this.found.add(path);
            this.current = null;
          }
        }
      }
    }
  }
  finish() {
    if (this.remaining || this.padding || this.headerUsed || this.zeroBlocks < 2)
      throw Error('TAR_TRUNCATED');
    const missing = [...this.wanted.keys()].filter((path) => !this.found.has(path));
    if (missing.length) throw Error('COMMITTED_MODALITY_MISSING: ' + missing.join(', '));
    return { entries: this.entries, selected: this.found.size, tar_complete: true };
  }
}

export async function traverseZstd(
  stream,
  asset,
  observations,
  sink,
  hashers,
  progress = () => {},
  signal,
) {
  const tar = new TarSelection(observations, sink),
    reader = stream.getReader(),
    guard = new ZstdFrameGuard();
  const md5 = await hashers.md5();
  md5.init();
  const sha = await hashers.sha256();
  sha.init();
  let received = 0,
    expanded = 0,
    queue = [],
    queued = 0;
  const decompressor = new Decompress((chunk) => {
    queued += chunk.length;
    expanded += chunk.length;
    if (queued > 64 * 1024 ** 2) throw Error('ZSTD_MEMORY_BOUND');
    queue.push(chunk.slice());
  });
  async function drain() {
    for (const chunk of queue) {
      signal?.throwIfAborted();
      await tar.push(chunk);
    }
    queue = [];
    queued = 0;
  }
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > asset.size_bytes) throw Error('ARCHIVE_SIZE_MISMATCH');
      md5.update(value);
      sha.update(value);
      // Bound the number of decompressor callbacks before applying backpressure.
      for (let i = 0; i < value.length; i += 16384) {
        const piece = value.subarray(i, i + 16384);
        guard.push(piece);
        decompressor.push(piece, false);
        await drain();
      }
      progress(received, asset.size_bytes);
    }
    guard.finish();
    decompressor.push(new Uint8Array(), true);
    await drain();
    if (received !== asset.size_bytes) throw Error('ARCHIVE_TRUNCATED');
    const expected = asset.checksum.replace(/^md5:/, '');
    if (md5.digest() !== expected) throw Error('ARCHIVE_CHECKSUM_MISMATCH');
    const archiveSha = sha.digest();
    if (asset.sha256 && asset.sha256 !== archiveSha)
      throw Error(
        `ARCHIVE_SHA256_MISMATCH: ${asset.name}; expected ${asset.sha256}; received ${archiveSha}`,
      );
    const report = tar.finish();
    return {
      ...report,
      archive: asset.name,
      size_bytes: received,
      expanded_bytes: expanded,
      sha256: archiveSha,
      provider_checksum_verified: true,
      traversals: 1,
      zstd_window_limit_bytes: guard.maxWindowBytes,
    };
  } finally {
    await reader.cancel().catch(() => {});
    await sink.close?.();
  }
}
