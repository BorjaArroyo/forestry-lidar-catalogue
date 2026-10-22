import { directory, checkpointFiles, mountBlocks } from './storage.js';
import { RUN_VERSION, readJSON, removeEntry } from './run-store.js';

/** Independently verify a single-plot checkpoint before reuse. */
function validateCheckpoint(py, profile, outputRoot, manifestText, plot) {
  py.globals.set('checkpoint_manifest_text', manifestText);
  py.globals.set('checkpoint_plot_json', JSON.stringify(plot));
  py.runPython(
    "checkpoint_manifest = json.loads(checkpoint_manifest_text); checkpoint_plot = json.loads(checkpoint_plot_json)\nif len(checkpoint_manifest['scenes']) != 1: raise ValueError('Checkpoint must contain exactly one plot')\ncheckpoint_scene = checkpoint_manifest['scenes'][0]\nif any(checkpoint_scene[k] != checkpoint_plot[k] for k in ['path', 'sha256', 'points', 'published_split']): raise ValueError('Checkpoint differs from reviewed plot')",
  );
  py.FS.writeFile(outputRoot + '/task-package.json', manifestText);
  return profile.validate(py, outputRoot);
}

export { validateCheckpoint };

export async function restoreCheckpoints({
  mode,
  groups,
  root,
  py,
  runtimeHash,
  executionPlan,
  digest,
  phase,
}) {
  const reusable = new Map();
  if (mode === 'zenodo')
    for (const group of groups) {
      const sourceRoot = await directory(root, 'sources/zenodo-' + group.record);
      await removeEntry(sourceRoot, 'source.las');
      const checkpoints = await directory(sourceRoot, 'checkpoints');
      py.globals.set('current_task_plan_json', JSON.stringify(group.taskPlan));
      py.runPython('task_plan = json.loads(current_task_plan_json)');
      for (const plot of group.candidates) {
        const key = await digest(new TextEncoder().encode(plot.path));
        const outputRoot = '/checkpoints/' + group.record + '/' + key;
        let checkpointRoot;
        try {
          checkpointRoot = await checkpoints.getDirectoryHandle(key);
          const saved = await readJSON(checkpointRoot, 'checkpoint.json');
          if (
            saved.schema_version !== RUN_VERSION ||
            saved.runtime_lock_sha256 !== runtimeHash ||
            saved.plan_sha256 !== executionPlan.plan_sha256
          )
            throw Error('Checkpoint dependency mismatch');
          const files = await checkpointFiles(checkpointRoot, JSON.parse(saved.manifestText));
          await mountBlocks(py, files, outputRoot);
          phase('Revalidating saved plot: ' + group.profile.plotLabel(plot.path));
          validateCheckpoint(py, group.profile, outputRoot, saved.manifestText, plot);
          reusable.set(group.record + ':' + plot.path, { ...saved, files });
        } catch (error) {
          // Unmount invalid files before replacing their storage; never reuse partial arrays.
          try {
            const manifest = await readJSON(checkpointRoot, 'checkpoint.json');
            for (const scene of JSON.parse(manifest.manifestText).scenes) {
              if (/^[a-zA-Z0-9_-]+$/.test(scene.id)) {
                try {
                  py.FS.unmount(outputRoot + '/plots/' + scene.id);
                } catch {
                  /* Not mounted. */
                }
              }
            }
          } catch {
            /* A partial checkpoint has no valid manifest. */
          }
          await removeEntry(checkpoints, key);
          if (error.name !== 'NotFoundError')
            phase(
              'Discarding incomplete or invalid checkpoint: ' + group.profile.plotLabel(plot.path),
            );
        }
      }
    }

  return reusable;
}
