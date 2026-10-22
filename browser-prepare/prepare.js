import { directory, mountBlocks } from './storage.js';
import { validateCheckpoint } from './checkpoints.js';
import { RUN_VERSION } from './run-store.js';
/** Prepare one reviewed LAS plot and mount its outputs for validation. */
import { write } from './storage.js';

async function preparePlot(
  py,
  root,
  file,
  profile,
  taskPlan,
  expectedPath,
  files,
  outputRoot,
  emitPhase,
) {
  py.FS.mount(
    py.FS.filesystems.WORKERFS,
    { blobs: [{ name: 'source.las', data: file }] },
    '/input',
  );
  try {
    emitPhase('Verifying the complete source LAS against the reviewed SHA256…');
    profile.start(py);
    const scene = JSON.parse(py.runPython('json.dumps(prep.scene)'));
    if (!taskPlan.allowed_partitions.includes(scene.published_split))
      throw Error('Source belongs to a published partition excluded from this task use');
    if (expectedPath && scene.path !== expectedPath)
      throw Error('Extracted LAS belongs to a different reviewed plot');
    const sceneFiles = [];
    for (;;) {
      const chunk = JSON.parse(py.runPython("json.dumps(prep.next_block('/chunk.npz'))"));
      if (!chunk) break;
      // One source and one output block at a time, regardless of dataset size.
      const handle = await write(root, chunk.path, py.FS.readFile('/chunk.npz'));
      py.FS.unlink('/chunk.npz');
      sceneFiles.push({ path: chunk.path, handle });
      emitPhase(
        `Prepared ${(chunk.offset + chunk.points).toLocaleString()} of ${scene.points.toLocaleString()} points in ${profile.plotLabel(scene.path)}…`,
      );
    }
    files.push(...sceneFiles);
    py.FS.mkdirTree(outputRoot + '/plots/' + scene.id);
    const mounted = await Promise.all(
      sceneFiles.map(async (f) => ({
        name: f.path.split('/').at(-1),
        data: await f.handle.getFile(),
      })),
    );
    py.FS.mount(py.FS.filesystems.WORKERFS, { blobs: mounted }, outputRoot + '/plots/' + scene.id);
    // Keep the authoritative JSON text: JavaScript otherwise turns 1.0 into 1 in native schema descriptors.
    const manifestText = py.runPython('json.dumps(prep.manifest)');
    return { manifest: JSON.parse(manifestText), manifestText };
  } finally {
    py.runPython("prep.reader.close() if 'prep' in globals() else None");
    py.FS.unmount('/input');
  }
}

export { preparePlot };

export async function prepareSources({
  groups,
  mode,
  root,
  py,
  request,
  lock,
  reusable,
  digest,
  executionPlan,
  runtimeHash,
  phase,
  scope,
  job,
  stagePlot,
  prepare: preparePlot,
}) {
  const prepared = [],
    provenance = [],
    allManifests = [];
  let completedPlots = 0;
  const totalPlots = groups.reduce((n, g) => n + (mode === 'las' ? 1 : g.candidates.length), 0);
  for (const group of groups) {
    const { record, profile, sourcePlan, taskPlan, candidates } = group;
    const sourceRoot = await directory(root, 'sources/zenodo-' + record),
      outputRoot = '/output/zenodo-' + record;
    const files = [],
      manifestTexts = [],
      intakes = [];
    py.FS.mkdirTree(outputRoot);
    try {
      py.globals.set('current_task_plan_json', JSON.stringify(taskPlan));
      py.runPython('task_plan = json.loads(current_task_plan_json)');
      for (const plot of mode === 'las' ? [null] : candidates) {
        phase(
          `zenodo:${record}: reading plot ${completedPlots + 1} of ${totalPlots}${plot ? ': ' + profile.plotLabel(plot.path) : ''}…`,
        );
        let result,
          intake,
          sceneFiles = [];
        const cached = plot && reusable.get(record + ':' + plot.path);
        if (cached) {
          result = {
            manifest: JSON.parse(cached.manifestText),
            manifestText: cached.manifestText,
          };
          intake = cached.intake;
          sceneFiles = cached.files;
          phase('Reusing independently validated plot: ' + profile.plotLabel(plot.path));
        } else {
          let file = request.file;
          intake = {
            kind: 'local-las',
            archive_verification: 'Selected LAS SHA256 verified; provider ZIP not checked',
          };
          let plotRoot = sourceRoot,
            plotOutput = outputRoot;
          if (mode === 'zenodo') {
            const key = await digest(new TextEncoder().encode(plot.path));
            plotRoot = await directory(sourceRoot, 'checkpoints/' + key);
            plotOutput = '/new-checkpoints/' + record + '/' + key;
          }
          if (plot)
            ({ file, intake } = await stagePlot(
              sourceRoot,
              { ...request, record_id: record, mode },
              plot,
              lock,
            ));
          result = await preparePlot(
            py,
            plotRoot,
            file,
            profile,
            taskPlan,
            plot?.path,
            sceneFiles,
            plotOutput,
            phase,
          );
          if (mode === 'zenodo') {
            phase('Independently validating plot before saving its checkpoint…');
            const validation = validateCheckpoint(
              py,
              profile,
              plotOutput,
              result.manifestText,
              plot,
            );
            await write(
              plotRoot,
              'checkpoint.json',
              new TextEncoder().encode(
                JSON.stringify({
                  schema_version: RUN_VERSION,
                  runtime_lock_sha256: runtimeHash,
                  plan_sha256: executionPlan.plan_sha256,
                  manifestText: result.manifestText,
                  intake,
                  validation,
                }),
              ),
            );
            scope.postMessage({ type: 'checkpoint', job, record, path: plot.path });
          }
          if (plot) await sourceRoot.removeEntry('source.las');
        }
        if (mode === 'zenodo') await mountBlocks(py, sceneFiles, outputRoot);
        files.push(...sceneFiles);
        manifestTexts.push(result.manifestText);
        intakes.push({ path: result.manifest.scenes[0].path, ...intake });
        completedPlots++;
      }
      py.globals.set('manifests_json', JSON.stringify(manifestTexts));
      const manifestText =
        py.runPython(
          'json.dumps(combine_manifests([json.loads(text) for text in json.loads(manifests_json)]), indent=2)',
        ) + '\n';
      const manifest = JSON.parse(manifestText);
      allManifests.push(manifestText);
      py.FS.writeFile(outputRoot + '/task-package.json', manifestText);
      phase(`zenodo:${record}: independently validating every prepared array…`);
      const taskValidation = profile.validate(py, outputRoot);
      const sourceEvidence = {
        task_plan: taskPlan,
        task_validation: taskValidation,
        prepared_scenes: manifest.scenes,
        selection: manifest.selection,
        intake: intakes.length === 1 ? intakes[0] : { kind: 'selected-dataset', plots: intakes },
      };
      prepared.push({ record, manifestText, taskPlan, files, evidence: sourceEvidence });
      const documents = {
        'selection-task-package.json': manifestText,
        'task-plan.json': JSON.stringify(taskPlan, null, 2),
        'task-validation.json': JSON.stringify(taskValidation, null, 2),
      };
      if (sourcePlan) {
        py.globals.set('source_plan_json', JSON.stringify(sourcePlan));
        py.globals.set('source_manifest_json', manifestText);
        sourceEvidence.plan_validation = JSON.parse(
          py.runPython(
            'json.dumps(dataset_plan.check_manifest(json.loads(source_plan_json), json.loads(source_manifest_json)))',
          ),
        );
        documents['dataset-plan.json'] = JSON.stringify(sourcePlan, null, 2);
        documents['dataset-plan-validation.json'] = JSON.stringify(
          sourceEvidence.plan_validation,
          null,
          2,
        );
      }
      for (const [name, text] of Object.entries(documents))
        provenance.push({
          path: `provenance/zenodo-${record}/${name}`,
          handle: await write(sourceRoot, name, new TextEncoder().encode(text)),
        });
    } catch (error) {
      error.message = `zenodo:${record}: ${error.message}`;
      throw error;
    }
  }

  return { prepared, provenance, allManifests };
}
