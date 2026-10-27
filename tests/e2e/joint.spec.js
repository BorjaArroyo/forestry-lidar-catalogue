import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const native = (code) =>
  execFileSync('uv', ['run', '--no-sync', 'python', '-c', code], { encoding: 'utf8' });
let directory;
test.beforeAll(async ({ browserName }, info) => {
  directory = path.resolve(`temp/joint-e2e-${browserName}-${info.workerIndex}`);
  native(`import sys,json,hashlib;from pathlib import Path;sys.path.insert(0,'tests');from test_joint import fixture
root=Path(${JSON.stringify(directory)});source=fixture(root/'input');raw=(json.dumps(source)+'\\n').encode();(root/'source.json').write_bytes(raw)
lock=json.loads(Path('browser-prepare/joint-runtime-lock.json').read_text());lock['files']['data/joint/source-lock.json']=dict(path=(root/'source.json').relative_to(Path.cwd()).as_posix(),size_bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest());(root/'runtime.json').write_text(json.dumps(lock))`);
});

test('same-observation preparation exports point instances and independent tree labels', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/browser-prepare/joint-runtime-lock.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: readFileSync(path.join(directory, 'runtime.json')),
    }),
  );
  await page.goto('./?tasks=instances,species&sources=19127709#experiment/data');
  await page.locator('[data-joint-plot="synthetic.laz"]').check();
  await page.locator('#workspace-navigation [data-workspace-section="objectives"]').click();
  await page.selectOption('#experiment-rank', 'leaf_group');
  await page.locator('#workspace-navigation [data-workspace-section="preparation"]').click();
  await page.check('[name="experiment-coverage"][value="joint"]');
  await expect(page.locator('#experiment-coverage-counts')).toContainText('Conifer / broadleaf');
  await page.locator('#workspace-navigation [data-workspace-section="review"]').click();
  await page.click('#joint-review');
  await expect(page.locator('#joint-plan')).toBeVisible({ timeout: 120000 });
  const plan = JSON.parse(await page.locator('#joint-plan-text').textContent());
  expect(plan.request.target).toBe('leaf_group');
  expect(plan.totals).toMatchObject({ points: 12, trees: 4, taxonomy_eligible: 3 });
  await page.selectOption('#joint-input-mode', 'local');
  await page.setInputFiles('#joint-inputs', path.join(directory, 'input/synthetic.laz'));
  await expect(page.locator('#experiment-run')).toBeEnabled();
  await page.click('#experiment-run');
  await expect(page).toHaveURL(/#experiment\/runs$/);
  await expect(page.locator('#joint-download')).toBeVisible({ timeout: 120000 });
  const downloadEvent = page.waitForEvent('download');
  await page.click('#joint-download');
  const zip = info.outputPath('joint.zip');
  await (await downloadEvent).saveAs(zip);
  const output = info.outputPath('dataset');
  const report = JSON.parse(
    native(`import zipfile,json;from canopy.loader import open_dataset,LoaderConfig
zipfile.ZipFile(${JSON.stringify(zip)}).extractall(${JSON.stringify(output)})
dataset=open_dataset(${JSON.stringify(output)},LoaderConfig(block_points=2));report=dataset.validate();blocks=list(dataset)
print(json.dumps(dict(report=report,points=sum(len(b['arrays']['xyz']) for b in blocks),tree_axis=len(blocks[0]['tree_arrays']['species']),species_valid=blocks[0]['tree_arrays']['species_valid'].tolist(),group_valid=blocks[0]['tree_arrays']['leaf_group_valid'].tolist())))`),
  );
  expect(report).toMatchObject({
    points: 12,
    tree_axis: 4,
    species_valid: [true, false, false, true],
    group_valid: [true, true, false, true],
  });
  await page.reload();
  const saved = page.locator('#joint-saved-runs li');
  await expect(saved).toHaveCount(1);
  await expect(saved).toContainText('checksum checked before download');
  await saved.getByRole('button', { name: 'Delete temporary files' }).click();
  await expect(saved).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('joint-runs-desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
});
