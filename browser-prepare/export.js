export async function writeArchive(zip, root, entries) {
  const archive = await root.getFileHandle('prepared.zip', { create: true });
  const access = await archive.createSyncAccessHandle();
  let position = 0;
  try {
    access.truncate(0);
    const output = new WritableStream({
      write(bytes) {
        let offset = 0;
        while (offset < bytes.length) {
          const count = access.write(bytes.subarray(offset), { at: position });
          if (!count) throw Error('ZIP write stopped');
          offset += count;
          position += count;
        }
      },
    });
    const writer = new zip.ZipWriter(output, { level: 0, zip64: true });
    for (const entry of entries)
      await writer.add(entry.path, new zip.BlobReader(await entry.handle.getFile()));
    await writer.close();
    access.flush();
  } finally {
    access.close();
  }
  return archive.getFile();
}
