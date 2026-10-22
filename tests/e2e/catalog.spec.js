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
