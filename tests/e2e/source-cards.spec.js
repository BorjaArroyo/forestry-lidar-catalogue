import { expect, test } from '@playwright/test';

const source = (page, id) => page.locator(`article[data-source="${id}"]`);

test('cards preserve partial reference coverage and separate preparation gates', async ({
  page,
}) => {
  await page.goto('./');
  await expect(source(page, '15913427')).toContainText('Only 2 of 20 plots labeled');
  await expect(source(page, '15193973')).toContainText('Rights review required');
  await expect(source(page, '15193973').locator('[data-task-prepare]')).toHaveCount(0);
  await expect(source(page, '8287792')).toContainText('Not produced: Multispectral reflectance.');
  await expect(source(page, '19351234')).not.toContainText('Not produced:');
  await expect(page.locator('.grid-divider')).toBeVisible();
  await page.locator('#variable-reflectance').selectOption('required');
  await expect(source(page, '8287792')).toHaveCount(0);
  await expect(source(page, '19351234').locator('[data-task-prepare]')).toBeVisible();
});

test('detail retains expanded evidence and returns focus after comparison changes', async ({
  page,
}) => {
  await page.goto('./');
  await source(page, '8287792').locator('[data-detail]').click();
  await page.locator('[data-section="evidence"] > summary').click();
  await page.locator('#detail-dialog [data-compare]').click();
  await expect(page.locator('[data-section="evidence"]')).toHaveAttribute('open', '');
  await expect(page.locator('#detail-dialog [data-compare]')).toBeFocused();
  await expect(page.locator('#detail-dialog [data-task-prepare]')).toHaveCount(1);
  await expect(page.locator('[data-section="history"]')).toContainText('historical workspace');
  await page.keyboard.press('Escape');
  await expect(source(page, '8287792').locator('[data-detail]')).toBeFocused();
  await expect(source(page, '8287792').locator('input[type="checkbox"]')).toBeChecked();
  await source(page, '19351234').locator('input[type="checkbox"]').check();
  await expect.poll(() => new URL(page.url()).searchParams.get('compare')).toBe('8287792,19351234');
  await page.reload();
  await expect(source(page, '8287792').locator('input[type="checkbox"]')).toBeChecked();
  await page.locator('#compare-open').click();
  await expect(page.locator('#compare-dialog')).toBeVisible();
});

test('preparation actions keep the existing source and request bridge', async ({ page }) => {
  await page.goto('./');
  await source(page, '19351234').locator('[data-task-prepare]').click();
  await expect(page.locator('#prepare-source')).toHaveValue('19351234');
  await expect(page.locator('#view-workbench')).toBeVisible();
  await expect(page.locator('#task-use')).toHaveValue('training');
});

for (const width of [375, 768, 1280, 1920]) {
  test(`cards and expanded detail remain readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./');
    const card = source(page, '8287792');
    await expect(card).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page
        .locator('.source-card')
        .evaluateAll((cards) => cards.every((card) => card.scrollWidth <= card.clientWidth)),
    ).toBe(true);
    await card.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: testInfo.outputPath(`sources-${width}.png`) });
    await card.locator('[data-detail]').click();
    await expect(page.locator('#detail-dialog')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`detail-${width}.png`) });
    await page.locator('[data-section="native"] > summary').click();
    await page.locator('[data-section="history"] > summary').click();
    expect(
      await page
        .locator('#detail-dialog')
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(card.locator('[data-detail]')).toBeFocused();
  });
}
