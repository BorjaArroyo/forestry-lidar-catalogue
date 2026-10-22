/* Closed implementation of the source-specific, independently validated FGI-EMIT profile. */
export const fgiEmit = Object.freeze({
  recordId: '19351234',
  sourceRef: 'zenodo:19351234',
  taskRef: 'task:instances',
  pipelineRef: 'pipeline:fgi-emit-plot-instances:1.0.0',
  sourceLock: 'scripts/fgi_emit/source-lock.json',
  derivedBytesPerPoint: 49,
  archiveLabel: 'FGI-EMIT training or test ZIP (select its matching partition)',
  fileLabel: 'Complete FGI-EMIT LAS',
  downloadName: 'fgi-emit-task-dataset.zip',
  collectionOf: () => 'Espoonlahti',
  plotLabel: path => path.split('/').at(-1),
  archiveForPlot(lock, plot) {
    const asset = lock.provider_archives?.['19351234']?.[plot.archive];
    if (!asset || !['training.zip', 'test.zip'].includes(plot.archive)) throw Error('No pinned FGI-EMIT archive for this plot');
    return asset;
  },
  start(py) { py.runPython("from fgi_emit.prepare import Preparation as FgiPreparation; prep = FgiPreparation('/input/source.las', '/app/scripts/fgi_emit')"); },
  validate(py, root) {
    py.globals.set('package_root', root);
    return JSON.parse(py.runPython("task_package = TaskPackage(package_root, allow_selection=True); task_validation = validate_prepared(task_model, task_plan, task_package); json.dumps(task_validation)"));
  },
});
