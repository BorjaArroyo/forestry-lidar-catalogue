import { expect, test } from '@playwright/test';

/*
 * Full-kernel coverage without the 1.6 GB provider archive: the test boots the
 * pinned Pyodide runtime exactly like the production worker, mounts a synthetic
 * self-contained "reviewed release" fixture (see fixtures/for-instance/), and
 * drives the real audited preparation kernel end to end - plan request, source
 * SHA256 admission, chunk conversion, manifest combination, independent package
 * validation and task-block consumption.
 */
test('the pinned Pyodide kernel prepares and independently validates a synthetic reviewed plot', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('./');

  const result = await page.evaluate(async () => {
    const nativeFetch = window.fetch.bind(window);
    const digest = async (bytes) => {
      const buffer = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    const read = async (path) =>
      new Uint8Array(await (await nativeFetch(new URL(path, document.baseURI))).arrayBuffer());
    const { createRuntime } = await import(new URL('browser-prepare/runtime.js', document.baseURI));
    const runtimeLock = JSON.parse(
      await (
        await nativeFetch(new URL('browser-prepare/runtime-lock.json', document.baseURI), {
          cache: 'no-store',
        })
      ).text(),
    );
    const fixtureLock = JSON.parse(
      new TextDecoder().decode(await read('tests/e2e/fixtures/for-instance/source-lock.json')),
    );
    const runtime = createRuntime({
      scope: window,
      base: document.baseURI,
      nativeFetch,
      digest,
      profileForSource: () => null,
      phase: () => {},
    });
    const py = await runtime.boot(runtimeLock);
    const fixtureRoot = '/app/tests-e2e/for-instance';
    py.FS.mkdirTree(fixtureRoot);
    for (const name of ['prepare.py', 'requirements.txt'])
      py.FS.writeFile(`${fixtureRoot}/${name}`, await read(`scripts/for_instance/${name}`));
    for (const name of ['source-lock.json', 'policy.json', 'package-lock.json'])
      py.FS.writeFile(
        `${fixtureRoot}/${name}`,
        await read(`tests/e2e/fixtures/for-instance/${name}`),
      );
    py.FS.mkdir('/input');
    py.FS.writeFile('/input/source.las', await read('tests/e2e/fixtures/for-instance/plot.las'));
    py.runPython("task_model = load_model('/app/data/knowledge-model.json')");
    py.runPython(`
fixture = '/app/tests-e2e/for-instance'
package_root = '/output/package'
import json, os, shutil
shutil.rmtree(package_root, ignore_errors=True)
os.makedirs(package_root, exist_ok=True)
task_plan = plan_request(task_model, 8287792, 'training')
prep = Preparation('/input/source.las', fixture)
scene = prep.scene
chunks = []
while True:
    chunk = prep.next_block('/chunk.npz')
    if chunk is None:
        break
    dest = os.path.join(package_root, chunk['path'])
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    os.replace('/chunk.npz', dest)
    chunks.append(chunk)
manifest = combine_manifests([prep.manifest])
with open(os.path.join(package_root, 'task-package.json'), 'w') as stream:
    json.dump(manifest, stream, indent=2)
package = TaskPackage(package_root, allow_selection=True, profile=fixture)
report = validate_prepared(task_model, task_plan, package)
blocks = list(iter_task_blocks(task_model, task_plan, package))
kernel_result = dict(
    versions=dict(python=platform.python_version(), numpy=numpy.__version__, laspy=laspy.__version__),
    scene={key: scene[key] for key in [
        'id', 'points', 'published_split', 'class_counts',
        'unknown_points', 'background_points', 'tree_points']},
    chunks=[{key: chunk[key] for key in ['path', 'points', 'offset']} for chunk in chunks],
    validation=dict(status=report['status'], eligible_scenes=report['eligible_scenes'],
                    eligible_points=report['eligible_points'], use=report['use']),
    blocks=[dict(scene_id=block['scene_id'], published_split=block['published_split'],
                 row_offset=block['row_offset'],
                 arrays={name: [list(array.shape), str(array.dtype)]
                         for name, array in block['arrays'].items()},
                 instance_valid=int(block['arrays']['instance_valid'].sum()))
            for block in blocks],
)
`);
    return {
      runtimeLock,
      fixtureLock,
      result: JSON.parse(py.runPython('json.dumps(kernel_result)')),
    };
  });

  const plot = result.fixtureLock.plots[0];
  expect(result.runtimeLock.python).toBe('3.14.2');
  expect(result.result.versions).toEqual({
    python: '3.14.2',
    numpy: result.runtimeLock.numpy,
    laspy: result.runtimeLock.laspy,
  });
  expect(result.result.scene).toMatchObject({
    points: plot.points,
    published_split: plot.published_split,
    class_counts: plot.class_counts,
    unknown_points: 900,
    background_points: 1000,
    tree_points: 1100,
  });
  expect(result.result.chunks).toEqual([
    { path: expect.stringMatching(/^plots\//), points: plot.points, offset: 0 },
  ]);
  expect(result.result.validation).toEqual({
    status: 'validated',
    eligible_scenes: [result.result.scene.id],
    eligible_points: plot.points,
    use: 'training',
  });
  expect(result.result.blocks).toEqual([
    {
      scene_id: result.result.scene.id,
      published_split: 'dev',
      row_offset: 0,
      arrays: {
        xyz: [[plot.points, 3], 'float64'],
        instance: [[plot.points], 'int64'],
        instance_valid: [[plot.points], 'bool'],
      },
      instance_valid: 2100,
    },
  ]);
  expect(pageErrors).toEqual([]);
});
