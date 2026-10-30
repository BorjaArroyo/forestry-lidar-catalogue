import { expect } from '@playwright/test';
import { test } from './fixtures.js';
import { openSubset } from './workspace-helpers.js';

test('desktop discovery shows source cards in the first viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  await expect(page.locator('#dataset-grid article').first()).toBeInViewport();
  await page.screenshot({ path: info.outputPath('compact-sources-desktop.png'), fullPage: true });
});

test('a small first selection keeps the full selection available', async ({ page }) => {
  await page.goto('./#experiment/data');
  await openSubset(page, 'zenodo:8287792');
  await page.locator('#prepare-smallest').click();
  await expect(page.locator('#prepare-plot option:checked')).toHaveCount(1);
  await expect(page.locator('#prepare-selection-summary')).toContainText('1 complete plots');
  await page.locator('#prepare-select-all').click();
  expect(await page.locator('#prepare-plot option:checked').count()).toBeGreaterThan(1);
});

test('both validated task formats expose executable NumPy loading guidance', async ({
  page,
}, info) => {
  for (const task of ['instances', 'species']) {
    await page.goto('./?task=' + task + '#experiment/review');
    await page.locator('#workspace-loading-guide summary').click();
    await expect(page.locator('#loading-code')).toContainText('from canopy.loader import');
    await expect(page.locator('#loading-code')).toContainText('dataset.validate()');
    if (task === 'species')
      await expect(page.locator('#loading-code')).toContainText('reference_valid');
    await expect(page.getByRole('link', { name: 'Download configurable example' })).toHaveAttribute(
      'href',
      'examples/load_dataset.py',
    );
    await page.screenshot({
      path: info.outputPath(task + '-numpy-loader-desktop.png'),
      fullPage: true,
    });
  }
});
