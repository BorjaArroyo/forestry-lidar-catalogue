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
