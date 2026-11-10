import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test } from './fixtures.js';

test('source discovery and public exports are independent of experiment requirements', async ({
  page,
}) => {
  await page.goto('./?task=species&var_xyz=required');
  await expect(page.locator('.source-card')).toHaveCount(12);
  await expect(page.locator('.task-request')).toBeHidden();
  await expect(page.locator('#catalog-count')).toContainText('5 with a validated preparation');
  await page.locator('#source-task').selectOption('species');
  await expect(page.locator('.source-card')).toHaveCount(3);
  const downloading = page.waitForEvent('download');
  await page.locator('#sources-export-json').click();
  const download = await downloading;
  const value = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(value.sources).toHaveLength(3);
  expect(value.sources.some((source) => source.source_ref === 'zenodo:19127709')).toBe(true);
  expect(
    value.sources.every((source) => !('cloud_count' in source) && !('example_paths' in source)),
  ).toBe(true);
  const csvDownloading = page.waitForEvent('download');
  await page.locator('#sources-export-csv').click();
  const csv = await csvDownloading;
  expect(csv.suggestedFilename()).toBe('canopy-sources.csv');
  expect(await readFile(await csv.path(), 'utf8')).toContain(
    'Joint instances + taxonomy: 6 admitted plots',
  );
  await page.locator('#reset').click();
  await expect(page.locator('.source-card')).toHaveCount(12);
});

test('the generated preparation index does not require a separate browser scope request', async ({
  page,
}) => {
  await page.route('**/data/joint/source-lock.json', (route) => route.fulfill({ status: 503 }));
  await page.goto('./');
  await expect(page.locator('.source-card')).toHaveCount(12);
  await expect(page.locator('[data-source="19127709"]')).toContainText('6 admitted plots');
});

test('consolidated sources fit the desktop viewport', async ({ page }, info) => {
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./');
    await expect(page.locator('.source-card').first()).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (width === 1280)
      await page.screenshot({ path: info.outputPath('consolidated-sources.png'), fullPage: true });
  }
});
