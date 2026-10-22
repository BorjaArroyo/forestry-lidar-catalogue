/* Lossless native point records. LASZip is pinned laz-perf, one cloud at a time. */
export async function decodeObservation(file, observation, laz, onBlock, hashers, signal) {
  if (file.size !== observation.size_bytes) throw Error('MEMBER_SIZE_MISMATCH');
  const sha = await hashers.sha256();
  sha.init();
  const inputReader = file.stream().getReader();
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await inputReader.read();
      if (done) break;
      sha.update(value);
    }
  } finally {
    await inputReader.cancel().catch(() => {});
  }
  if (sha.digest() !== observation.sha256)
    throw Error('MEMBER_CHECKSUM_MISMATCH: ' + observation.path);
  const headerBytes = new Uint8Array(await file.slice(0, 375).arrayBuffer());
  if (new TextDecoder().decode(headerBytes.subarray(0, 4)) !== 'LASF' || headerBytes.length < 227)
    throw Error('INVALID_LAS_HEADER');
  const view = new DataView(headerBytes.buffer),
    versionMinor = view.getUint8(25),
    format = view.getUint8(104) & 63;
  const pointSize = view.getUint16(105, true),
    pointOffset = view.getUint32(96, true),
    headerSize = view.getUint16(94, true);
  const count =
    versionMinor >= 4 ? Number(view.getBigUint64(247, true)) : view.getUint32(107, true);
  if (
    headerSize < 227 ||
    pointOffset < headerSize ||
    pointOffset > file.size ||
    !Number.isSafeInteger(count) ||
    count !== observation.points ||
    pointSize !== observation.point_record_length
  )
    throw Error('LAS_SCHEMA_MISMATCH');
  const compressed = Boolean(view.getUint8(104) & 128),
    scales = [],
    offsets = [];
  for (let i = 0; i < 3; i++) {
    scales.push(view.getFloat64(131 + i * 8, true));
    offsets.push(view.getFloat64(155 + i * 8, true));
  }
  if (scales.some((x) => !Number.isFinite(x) || x <= 0) || offsets.some((x) => !Number.isFinite(x)))
    throw Error('LAS_INVALID_COORDINATES');
  const recordsHash = await hashers.sha256();
  recordsHash.init();
  let decoder, inputPointer, pointPointer;
  try {
    if (compressed) {
      const input = new Uint8Array(await file.arrayBuffer());
      inputPointer = laz._malloc(input.length);
      if (!inputPointer) throw Error('LAZ_MEMORY_ALLOCATION');
      laz.HEAPU8.set(input, inputPointer);
      decoder = new laz.LASZip();
      decoder.open(inputPointer, input.length);
      if (
        decoder.getCount() !== count ||
        decoder.getPointLength() !== pointSize ||
        decoder.getPointFormat() !== format
      )
        throw Error('LAZ_SCHEMA_MISMATCH');
      pointPointer = laz._malloc(pointSize);
      if (!pointPointer) throw Error('LAZ_MEMORY_ALLOCATION');
    } else if (pointOffset + pointSize * count > file.size) throw Error('LAS_TRUNCATED');
    for (let offset = 0; offset < count; offset += 250000) {
      signal?.throwIfAborted();
      const points = Math.min(250000, count - offset);
      let bytes;
      if (compressed) {
        bytes = new Uint8Array(points * pointSize);
        for (let i = 0; i < points; i++) {
          decoder.getPoint(pointPointer);
          bytes.set(laz.HEAPU8.subarray(pointPointer, pointPointer + pointSize), i * pointSize);
        }
      } else
        bytes = new Uint8Array(
          await file
            .slice(pointOffset + offset * pointSize, pointOffset + (offset + points) * pointSize)
            .arrayBuffer(),
        );
      recordsHash.update(bytes);
      await onBlock({ offset, points, bytes, scales, offsets, pointSize, format });
    }
    if (recordsHash.digest() !== observation.native_records_sha256)
      throw Error('NATIVE_EQUIVALENCE_FAILED');
    return {
      status: 'validated',
      points: count,
      format,
      scales,
      offsets,
      native_records_sha256: observation.native_records_sha256,
    };
  } finally {
    decoder?.delete();
    if (pointPointer) laz._free(pointPointer);
    if (inputPointer) laz._free(inputPointer);
  }
}
