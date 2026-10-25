import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { openSubset, chooseTask } from './workspace-helpers.js';

const native = (code) =>
  execFileSync('uv', ['run', '--no-sync', 'python', '-c', code], { encoding: 'utf8' });
let directory;
test.beforeAll(async ({ browserName }, workerInfo) => {
  directory = path.resolve('temp/classification/e2e-' + browserName + '-' + workerInfo.workerIndex);
  native(
    `import sys;sys.path.insert(0,'tests');from classification_fixtures import build;build(${JSON.stringify(directory)})`,
  );
});
async function classification(page) {
  await page.route('**/browser-prepare/classification-runtime-lock.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: readFileSync(path.join(directory, 'runtime-lock.json')),
    }),
  );
  await page.goto('./?task=species#experiment/objectives');
  await expect(page.locator('#classification-source option')).toHaveCount(2);
}
for (const [use, rank, trees, observations] of [
  ['training', 'genus', 5, 7],
  ['validation', 'species', 1, 2],
  ['evaluation', 'species', 1, 2],
  ['inference', 'species', 9, 14],
]) {
  test(`classification ${use} exports native-equivalent data with ${rank} reference`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await classification(page);
    await page.selectOption('#task-use', use);
    await page.selectOption('#task-rank', rank);
    await page.locator('#workspace-navigation [data-workspace-section="data"]').click();
    for (const source of use === 'training' || use === 'inference'
      ? ['zenodo:13255198', 'grodata:128035:1.0']
      : ['grodata:128035:1.0']) {
      await openSubset(page, source);
      await page.click('#classification-add');
    }
    await page.locator('#workspace-navigation [data-workspace-section="review"]').click();
    await page.click('#classification-review');
    await expect(page.locator('#classification-plan')).toBeVisible();
    const plan = JSON.parse(await page.locator('#classification-plan-text').textContent());
    expect(plan.totals.trees).toBe(trees);
    expect(plan.totals.observations).toBe(observations);
    expect(plan.spatial_audit.independence).toBe('not-demonstrated');
    await page.setInputFiles(
      '#classification-files',
      plan.archives.map((a) => path.join(directory, a.name)),
    );
    await page.click('#classification-run');
    await expect(page).toHaveURL(/#experiment\/runs$/);
    if (use === 'training') {
      await page.locator('.sidebar [data-workspace-section="objectives"]').click();
      await page.locator('#workspace-navigation [data-workspace-section="preparation"]').click();
      await expect(page.locator('#workspace-lineage-output')).toContainText('classification');
      await page.locator('.sidebar [data-workspace-section="runs"]').click();
    }
    await expect(page.locator('#classification-download')).toBeVisible({ timeout: 60000 });
    const downloadEvent = page.waitForEvent('download');
    await page.click('#classification-download');
    const download = await downloadEvent;
    const zip = info.outputPath('classification.zip');
    await download.saveAs(zip);
    const output = info.outputPath('dataset');
    mkdirSync(output, { recursive: true });
    const report = JSON.parse(
      native(
        `import zipfile,json;from canopy.classification.package import TreeDataset;zipfile.ZipFile(${JSON.stringify(zip)}).extractall(${JSON.stringify(output)});print(json.dumps(TreeDataset(${JSON.stringify(output)}).validate()))`,
      ),
    );
    expect(report.trees).toBe(trees);
    expect(report.observations).toBe(observations);
    expect(errors).toEqual([]);
  });
}
test('classification shares responsive source cards, details and the graph', async ({ page }) => {
  await page.goto('./?task=species');
  await expect(page.locator('.source-card')).toHaveCount(2);
  for (const width of [375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.source-card').first()).toContainText('FOR-species20K');
    await page.locator('#dataset-grid [data-detail="13255198"]').click();
    await expect(page.locator('#detail-dialog')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.locator('#detail-dialog .close-dialog').click();
  }
  await page.locator('[data-view="model"]').click();
  await expect(page.locator('#model-task-nav')).toBeVisible();
  await expect(page.locator('#model-graph-title')).toContainText('Species');
  await page.locator('[data-model-task="task:instances"]').click();
  await page.locator('[data-view="datasets"]').click();
  await expect(page.locator('#preparation-task')).toHaveValue('task:instances');
});
test('classification retains its draft across task changes and rejects corrupt later input', async ({
  page,
}) => {
  await classification(page);
  await page.selectOption('#task-use', 'inference');
  await page.locator('#workspace-navigation [data-workspace-section="data"]').click();
  for (const ref of ['zenodo:13255198', 'grodata:128035:1.0']) {
    await openSubset(page, ref);
    await page.click('#classification-add');
  }
  await page.locator('#workspace-navigation [data-workspace-section="objectives"]').click();
  await chooseTask(page, 'instances');
  await chooseTask(page, 'species');
  await page.locator('#workspace-navigation [data-workspace-section="data"]').click();
  await expect(page.locator('#classification-draft-list li')).toHaveCount(2);
  await page.locator('#workspace-navigation [data-workspace-section="review"]').click();
  await page.click('#classification-review');
  await expect(page.locator('#classification-plan')).toBeVisible();
  const plan = JSON.parse(await page.locator('#classification-plan-text').textContent());
  await page.setInputFiles(
    '#classification-files',
    plan.archives.map((a) => {
      const buffer = readFileSync(path.join(directory, a.name));
      if (a.name === 'ULS.tar.zst') buffer[buffer.length - 1] ^= 1;
      return { name: a.name, mimeType: 'application/octet-stream', buffer };
    }),
  );
  await page.click('#classification-run');
  await expect(page.locator('#classification-status')).toContainText('Preparation failed:', {
    timeout: 60000,
  });
  await expect(page.locator('#classification-download')).toBeHidden();
});
