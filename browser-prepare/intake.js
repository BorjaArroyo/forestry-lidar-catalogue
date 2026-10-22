/* Select one reviewed LAS; never unpack an archive's arbitrary filesystem paths. */
const PREFIXES = [
  'sources/8287792/originals/FORinstance_dataset/',
  'sources/19351234/originals/training/',
  'sources/19351234/originals/test/',
];
export const MAX_RANGE_BYTES = 2 * 1024 ** 2;
export const MAX_ENTRIES = 1024;

export function memberName(plot) {
  if (plot.archive_member !== undefined) {
    if (!safeName(plot.archive_member)) throw Error('Unsafe reviewed member path');
    return plot.archive_member;
  }
  const prefix = PREFIXES.find((prefix) => plot.path.startsWith(prefix));
  if (!prefix) throw Error('Unsupported source profile');
  const member = plot.path.slice(prefix.length);
  if (!safeName(member)) throw Error('Unsafe reviewed member path');
  return member;
}

function safeName(name) {
  const parts = name.replace(/\/$/, '').split('/');
  return (
    name &&
    !name.includes('\\') &&
    !name.includes(':') &&
    !parts.some((p) => !p || p === '.' || p === '..') &&
    !/[\x00-\x1f]/.test(name)
  );
}

function boundedRange(size, index, length) {
  if (
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(length) ||
    index < 0 ||
    length < 0 ||
    index > size
  )
    throw Error('Invalid archive byte range');
  length = Math.min(length, size - index);
  if (length > MAX_RANGE_BYTES) throw Error('Archive metadata exceeds the bounded range limit');
  return length;
}

export function localReader(zip, file) {
  return new (class extends zip.Reader {
    constructor() {
      super();
      this.size = file.size;
    }
    async readUint8Array(index, length) {
      length = boundedRange(this.size, index, length);
      return new Uint8Array(await file.slice(index, index + length).arrayBuffer());
    }
  })();
}

export function providerReader(zip, asset, plot, fetcher, progress = () => {}) {
  const stats = { requests: 0, bytes_received: 0 };
  const budget = plot.size_bytes + 8 * 1024 ** 2;
  class PinnedRangeReader extends zip.Reader {
    constructor() {
      super();
      this.size = asset.size_bytes;
    }
    async readUint8Array(index, length) {
      length = boundedRange(this.size, index, length);
      if (!length) return new Uint8Array();
      const response = await fetcher(asset.download_url, {
        headers: { Range: `bytes=${index}-${index + length - 1}` },
        signal: AbortSignal.timeout(120000),
        credentials: 'omit',
      });
      stats.requests++;
      if (response.status !== 206) {
        await response.body?.cancel();
        throw Error(
          `Provider range download unavailable (HTTP ${response.status}); select a downloaded ZIP instead`,
        );
      }
      // Zenodo exposes Content-Length but not Content-Range to browser JavaScript.
      // Validate the latter when available; the final LAS SHA256 is mandatory.
      const range = response.headers.get('Content-Range');
      const declared = response.headers.get('Content-Length');
      if (
        (range && range !== `bytes ${index}-${index + length - 1}/${this.size}`) ||
        (declared !== null && Number(declared) !== length)
      ) {
        await response.body?.cancel();
        throw Error('Provider returned an inconsistent byte range');
      }
      const reader = response.body.getReader();
      const bytes = new Uint8Array(length);
      let offset = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          stats.bytes_received += value.length;
          if (offset + value.length > length || stats.bytes_received > budget)
            throw Error('Provider transfer exceeded its selected-plot bound');
          bytes.set(value, offset);
          offset += value.length;
          progress(stats);
        }
        if (offset !== length) throw Error('Truncated provider byte range');
      } finally {
        await reader.cancel().catch(() => {});
      }
      return bytes;
    }
  }
  return { reader: new PinnedRangeReader(), stats };
}

export async function extractPlot(
  zip,
  reader,
  plot,
  output,
  progress = () => {},
  { maxEntries = MAX_ENTRIES } = {},
) {
  const archive = new zip.ZipReader(reader, { strictness: 'strict', checkCrc32: true });
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 25000)
    throw Error('Invalid archive entry limit');
  const wanted = memberName(plot);
  const seen = new Set();
  let selected,
    count = 0,
    received = 0;
  try {
    for await (const entry of archive.getEntriesGenerator()) {
      if (++count > maxEntries)
        throw Error('Archive entry count exceeds the reviewed intake bound');
      if (!safeName(entry.filename) || seen.has(entry.filename))
        throw Error('Unsafe or duplicate archive member');
      seen.add(entry.filename);
      if (entry.filename === wanted) {
        if (
          entry.directory ||
          entry.symlink ||
          entry.encrypted ||
          entry.uncompressedSize !== plot.size_bytes ||
          ![0, 8, 9].includes(entry.compressionMethod)
        )
          throw Error('Selected archive member differs from the reviewed LAS contract');
        selected = entry;
      }
    }
    if (!selected) throw Error('Selected reviewed LAS is absent from this ZIP');
    const sink = new WritableStream({
      async write(bytes) {
        if (received + bytes.length > plot.size_bytes)
          throw Error('Extracted LAS exceeded its reviewed size');
        await output(bytes, received);
        received += bytes.length;
        progress(received, plot.size_bytes);
      },
    });
    await selected.getData(sink, { checkCrc32: true });
    if (received !== plot.size_bytes) throw Error('Extracted LAS is incomplete');
    return {
      archive_member: wanted,
      compression_method: selected.compressionMethod,
      extracted_size_bytes: received,
      archive_entries: count,
      crc32_checked: true,
      archive_verification: 'Selected LAS only; whole-archive checksum not checked',
    };
  } finally {
    await archive.close();
  }
}
