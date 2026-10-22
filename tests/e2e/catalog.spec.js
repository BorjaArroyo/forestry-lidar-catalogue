import { expect, test } from '@playwright/test';

test('catalog modules load below the published project path', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('./');
  await expect(page.locator('#dataset-count')).toHaveText('10');
  await expect(page.locator('#dataset-grid article')).toHaveCount(8);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => 'CanopyHub' in window || 'CanopyTaskSelection' in window)).toBe(
    false,
  );
});

test('catalog filters and comparison keep their interactive behavior', async ({ page }) => {
  await page.goto('./');
  await page.locator('#platform').selectOption('Airborne');
  const cards = page.locator('#dataset-grid article');
  await expect(cards).not.toHaveCount(8);
  await page.locator('#platform').selectOption('all');
  await page.locator('#dataset-grid input[type="checkbox"]').nth(0).check();
  await page.locator('#dataset-grid input[type="checkbox"]').nth(1).check();
  await page.locator('#compare-open').click();
  await expect(page.locator('#compare-dialog[open]')).toBeVisible();
});

test('task variables and partitions follow the selected use and source', async ({ page }) => {
  await page.goto('./#workbench');
  await page.locator('#prepare-source').selectOption('8287792');
  await expect(page.locator('#prepare-add')).toBeEnabled();
  await expect(page.locator('#prepare-partitions option[value="test"]')).toHaveCount(0);
  await page.locator('#variable-reflectance').selectOption('required');
  await expect(page.locator('#prepare-add')).toBeDisabled();
  await page.locator('#prepare-source').selectOption('19351234');
  await expect(page.locator('#prepare-add')).toBeEnabled();
  await page.locator('#task-use').selectOption('evaluation');
  await expect(page.locator('#prepare-partitions option[value="train"]')).toHaveCount(0);
  await expect(page.locator('#prepare-partitions option[value="test"]')).toHaveCount(1);
});

test('a saved draft survives reload with its requirements and selected plots', async ({ page }) => {
  await page.goto('./#workbench');
  await expect(page.locator('#prepare-add')).toBeEnabled();
  await page.locator('#prepare-plot-label summary').click();
  await page.locator('#prepare-plot').selectOption({index: 0});
  await page.locator('#prepare-add').click();
  const saved = await page.evaluate(() => localStorage.getItem('canopy-dataset-draft-v1'));
  expect(JSON.parse(saved).subsets).toHaveLength(1);
  await page.reload();
  await expect(page.locator('#dataset-draft-list li')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('canopy-dataset-draft-v1'))).toBe(saved);
});

test('the production module worker can inspect saved runs below the project prefix', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(() => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('browser-prepare/worker.js', document.baseURI), {type: 'module'});
    const timer = setTimeout(() => {worker.terminate(); reject(Error('Inspection timed out'));}, 10000);
    worker.onerror = (error) => {clearTimeout(timer); worker.terminate(); reject(Error(error.message));};
    worker.onmessage = ({data}) => {clearTimeout(timer); worker.terminate(); resolve(data);};
    worker.postMessage({operation: 'inspect'});
  }));
  expect(result).toEqual({type: 'result', operation: 'inspect', runs: []});
});

async function localServicePage(page, respond) {
  await page.route('**/forestry-lidar-catalogue/', async (route) => {
    const response = await route.fetch();
    await route.fulfill({response, body: (await response.text()).replace('window.CANOPY_PUBLIC = true;', 'window.CANOPY_PUBLIC = false;')});
  });
  await page.route('**/api/state', respond);
  await page.goto('./#workbench');
}

test('HTTP 500 remains visible and submissions stay disabled until a valid service state returns', async ({ page }) => {
  let healthy = false;
  await localServicePage(page, (route) => route.fulfill({status: healthy ? 200 : 500,
    json: healthy ? {token: 'fixture', jobs: [], records: [], preparation: {available: false}} : {error: 'Fixture internal failure'}}));
  await expect(page.locator('#service-status')).toHaveText('Local service returned an error');
  await expect(page.locator('#workbench-message')).toHaveText('Fixture internal failure');
  await expect(page.locator('#inspect-form button')).toBeDisabled();
  healthy = true;
  await expect(page.locator('#service-status')).toHaveText('Local data service connected', {timeout: 10000});
  await expect(page.locator('#inspect-form button')).toBeEnabled();
});

test('connection failures have a distinct offline diagnosis', async ({ page }) => {
  await localServicePage(page, (route) => route.abort('connectionrefused'));
  await expect(page.locator('#service-status')).toHaveText('Whole-archive service offline');
  await expect(page.locator('#inspect-form button')).toBeDisabled();
});

test('a service render failure disables submissions and remains visible', async ({ page }) => {
  await localServicePage(page, (route) => route.fulfill({json: {token: 'fixture', jobs: null, preparation: {available: false}}}));
  await expect(page.locator('#service-status')).toHaveText('Local service returned an error');
  await expect(page.locator('#inspect-form button')).toBeDisabled();
  await expect(page.locator('#workbench-message')).not.toBeEmpty();
});
