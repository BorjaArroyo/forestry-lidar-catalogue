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
    if (use === 'inference') {
      await page.reload();
      const saved = page.locator('#classification-saved-runs li');
      await expect(saved).toHaveCount(1);
      await expect(saved).toContainText('Validated ZIP');
      await expect(saved.getByRole('link', { name: 'Download ZIP' })).toBeVisible();
      await page.setViewportSize({ width: 1280, height: 1000 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath('saved-classification-desktop.png'),
        fullPage: true,
      });
      await saved.getByRole('button', { name: 'Delete temporary files' }).click();
      await expect(saved).toHaveCount(0);
      expect(
        await page.evaluate(async () => {
          const root = await navigator.storage.getDirectory();
          const jobs = await root.getDirectoryHandle('canopy-classification');
          return Array.fromAsync(jobs.keys());
        }),
      ).toEqual([]);
    }
  });
}
test('classification shares responsive source cards, details and the graph', async ({ page }) => {
  await page.goto('./?task=species');
  await expect(page.locator('.source-card')).toHaveCount(3);
  await expect(page.locator('[data-source="19127709"]')).toContainText(
    'No admitted classification pipeline',
  );
  await expect(page.locator('[data-source="19127709"] [data-task-prepare]')).toHaveCount(0);
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

test('interrupted classification storage survives reload and protects active tabs', async ({
  page,
  context,
}) => {
  const id = '12345678-1234-1234-1234-123456789abc';
  await classification(page);
  await page.evaluate(async (id) => {
    const origin = await navigator.storage.getDirectory();
    const jobs = await origin.getDirectoryHandle('canopy-classification', { create: true });
    const job = await jobs.getDirectoryHandle(id, { create: true });
    await job.getFileHandle('prepared.zip', { create: true });
    let acquired;
    const ready = new Promise((resolve) => {
      acquired = resolve;
    });
    navigator.locks.request('canopy-classification:' + id, async () => {
      acquired();
      await new Promise((resolve) => {
        window.releaseClassificationLock = resolve;
      });
    });
    await ready;
  }, id);
  const other = await context.newPage();
  await classification(other);
  await other.locator('.sidebar [data-workspace-section="runs"]').click();
  const row = other.locator('#classification-saved-runs li');
  await expect(row).toContainText('Active in another tab');
  await expect(row.getByRole('button')).toBeDisabled();
  await page.evaluate(() => window.releaseClassificationLock());
  await other.reload();
  await expect(row).toContainText('Interrupted; restart from Review');
  await row.getByRole('button', { name: 'Delete temporary files' }).click();
  await expect(row).toHaveCount(0);
});

test('slow ZIP writes keep the classification watchdog alive', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const schedule = window.setTimeout;
    let exporting = false;
    window.setTimeout = (fn, delay, ...args) =>
      schedule(fn, exporting && delay === 180000 ? 2000 : delay, ...args);
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        if (!String(url).includes('classification-worker.js')) {
          super(url, options);
          return;
        }
        const bootstrap = `import ${JSON.stringify(String(url))};
          const open = FileSystemFileHandle.prototype.createSyncAccessHandle;
          FileSystemFileHandle.prototype.createSyncAccessHandle = async function () {
            const access = await open.call(this);
            if (this.name !== 'prepared.zip') return access;
            return {
              truncate: (...args) => access.truncate(...args),
              flush: () => access.flush(), close: () => access.close(),
              write: (...args) => {
                const until = performance.now() + 100;
                while (performance.now() < until) {}
                return access.write(...args);
              },
            };
          };`;
        const blob = URL.createObjectURL(new Blob([bootstrap], { type: 'text/javascript' }));
        super(blob, options);
        URL.revokeObjectURL(blob);
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'phase' && data.text.includes('Writing one dataset ZIP'))
            exporting = true;
        });
      }
    };
  });
  await classification(page);
  await page.selectOption('#task-use', 'inference');
  await page.locator('#workspace-navigation [data-workspace-section="data"]').click();
  await openSubset(page, 'zenodo:13255198');
  await page.click('#classification-add');
  await page.locator('#workspace-navigation [data-workspace-section="review"]').click();
  await page.click('#classification-review');
  await expect(page.locator('#classification-plan')).toBeVisible();
  const plan = JSON.parse(await page.locator('#classification-plan-text').textContent());
  await page.setInputFiles(
    '#classification-files',
    plan.archives.map((a) => path.join(directory, a.name)),
  );
  await page.click('#classification-run');
  await expect(page.locator('#classification-status')).toContainText('Writing dataset ZIP:', {
    timeout: 60000,
  });
  await expect(page.locator('#classification-download')).toBeVisible({ timeout: 60000 });
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
