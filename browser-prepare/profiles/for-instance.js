/* Implementation details for the already audited FOR-instance adapter. */
export const forInstance = Object.freeze({
  recordId: '8287792',
  pipelineRef: 'pipeline:for-instance-plot-instances:1.0.0',
  sourceLock: 'scripts/for_instance/source-lock.json',
  archiveLabel: 'Downloaded FOR-instance ZIP',
  fileLabel: 'Complete FOR-instance LAS',
  downloadName: 'for-instance-selected-plot.zip',
  plotLabel: path => path.replace(/^.*FORinstance_dataset\//, ''),
  start(py) { py.runPython("prep = Preparation('/input/source.las', '/app/scripts/for_instance')"); },
  validate(py) {
    return JSON.parse(py.runPython("task_package = TaskPackage('/output', allow_selection=True); task_validation = validate_prepared(task_model, task_plan, task_package); json.dumps(task_validation)"));
  },
});
