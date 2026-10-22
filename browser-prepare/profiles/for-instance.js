/* Implementation details for the already audited FOR-instance adapter. */
export const forInstance = Object.freeze({
  recordId: '8287792',
  pipelineRef: 'pipeline:for-instance-plot-instances:1.0.0',
  sourceLock: 'scripts/for_instance/source-lock.json',
  archiveLabel: 'Downloaded FOR-instance ZIP',
  fileLabel: 'Complete FOR-instance LAS',
  downloadName: 'tree-instance-dataset.zip',
  collectionOf: (plot) => plot.path.replace(/^.*FORinstance_dataset\//, '').split('/')[0],
  plotLabel: (path) => path.replace(/^.*FORinstance_dataset\//, ''),
  start(py) {
    py.runPython("prep = Preparation('/input/source.las', '/app/scripts/for_instance')");
  },
  validate(py, root) {
    py.globals.set('package_root', root);
    return JSON.parse(
      py.runPython(
        'task_package = TaskPackage(package_root, allow_selection=True); task_validation = validate_prepared(task_model, task_plan, task_package); json.dumps(task_validation)',
      ),
    );
  },
});
