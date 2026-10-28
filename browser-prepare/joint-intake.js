/* TreeScan archives may include redundant ZIP64 end records. */
import { extractPlot, providerReader } from './intake.js';

async function hasRedundantZip64End(reader) {
  if (reader.size < 98) return false;
  const bytes = await reader.readUint8Array(reader.size - 98, 98);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (i) => v.getUint16(i, true);
  const u32 = (i) => v.getUint32(i, true);
  const u64 = (i) => v.getBigUint64(i, true);
  return (
    u32(0) === 0x06064b50 &&
    u64(4) === 44n &&
    u32(16) === 0 &&
    u32(20) === 0 &&
    u32(56) === 0x07064b50 &&
    u32(60) === 0 &&
    u64(64) === BigInt(reader.size - 98) &&
    u32(72) === 1 &&
    u32(76) === 0x06054b50 &&
    u16(80) === 0 &&
    u16(82) === 0 &&
    u16(96) === 0 &&
    u16(84) === u16(86) &&
    u64(24) === BigInt(u16(84)) &&
    u64(32) === BigInt(u16(86)) &&
    u64(40) === BigInt(u32(88)) &&
    u64(48) === BigInt(u32(92)) &&
    u32(92) + u32(88) === reader.size - 98
  );
}

export function jointProviderReader(zip, asset, plot, fetcher, progress) {
  return providerReader(
    zip,
    asset,
    plot,
    async (...args) => {
      let response;
      for (let attempt = 0; attempt < 7; attempt++) {
        response = await fetcher(...args);
        if (![429, 503].includes(response.status) || attempt === 6) return response;
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
      return response;
    },
    progress,
  );
}

export async function extractJointPlot(zip, reader, plot, output) {
  if (!(await hasRedundantZip64End(reader))) return extractPlot(zip, reader, plot, output);
  class RedundantZip64Reader extends zip.ZipReader {
    constructor(source, options) {
      super(source, { ...options, strictness: 'balanced' });
    }
    async *getEntriesGenerator(...args) {
      for await (const entry of super.getEntriesGenerator(...args)) {
        const getData = entry.getData.bind(entry);
        entry.getData = (writer, options) => getData(writer, { ...options, strictness: 'strict' });
        yield entry;
      }
      if (this.warnings.some((warning) => warning.reason !== 'trailing central directory data'))
        throw Error('Ambiguous archive metadata');
    }
  }
  return extractPlot({ ...zip, ZipReader: RedundantZip64Reader }, reader, plot, output);
}
