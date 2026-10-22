import { extractPlot, localReader, providerReader } from './intake.js';
import { profileForSource } from './profiles.js';

export function createIntake({ loadZip, nativeFetch, phase }) {
return async function stagePlot(root, request, plot, lock) {
  const zip = await loadZip(lock);
  const profile = profileForSource(request.record_id);
  const asset = profile.archiveForPlot ? profile.archiveForPlot(lock, plot) : lock.provider_archive;
  const remote = request.mode === 'zenodo' ? providerReader(zip, asset, plot, nativeFetch) : null;
  const reader = remote?.reader || localReader(zip, request.file);
  const staged = await root.getFileHandle('source.las', { create: true });
  const access = await staged.createSyncAccessHandle();
  let intake;
  try {
    access.truncate(0);
    intake = await extractPlot(
      zip,
      reader,
      plot,
      (bytes, offset) => {
        let written = 0;
        while (written < bytes.length) {
          const count = access.write(bytes.subarray(written), { at: offset + written });
          if (!count) throw Error('Staged LAS write stopped');
          written += count;
        }
      },
      (received, total) =>
        phase(
          `Extracted ${Math.round(received / 1048576)} of ${Math.ceil(total / 1048576)} MiB for the selected plot…`,
        ),
    );
    access.flush();
  } finally {
    access.close();
  }
  return {
    file: await staged.getFile(),
    intake: {
      kind: request.mode === 'zenodo' ? 'zenodo-ranges' : 'local-zip',
      ...intake,
      ...(remote ? remote.stats : {}),
    },
  };
}
;
}
