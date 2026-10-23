import { expect, test } from '@playwright/test';

const section = (page, name) =>
  page.locator('#workspace-navigation [data-workspace-section="' + name + '"]');

test('workspace routes retain draft, filters and focus across navigation and reload', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await page.locator('#search').fill('FOR-instance');
  await page.locator('[data-task-prepare="8287792"]').click();
  await expect(page).toHaveURL(/#experiment\/data$/);
  await expect(page.locator('#prepare-add')).toBeEnabled();
  await page.locator('#prepare-add').click();
  const draft = await page.evaluate(() => localStorage.getItem('canopy-dataset-draft-v1'));
  await section(page, 'preparation').click();
  await expect(page.locator('#prepare-source')).toBeHidden();
  await expect(page.locator('#workspace-consumer-fields')).toContainText('instance_valid');
  await expect(page.locator('.page-heading h1')).toBeFocused();
  await section(page, 'splits').click();
  await expect(page.locator('#workspace-partitions')).toHaveText('dev, train');
  await page.goBack();
  await expect(page).toHaveURL(/#experiment\/preparation$/);
  await page.goForward();
  await expect(page).toHaveURL(/#experiment\/splits$/);
  await page.reload();
  await expect(page.locator('#workspace-partitions')).toHaveText('dev, train');
  await section(page, 'data').click();
  await expect(page.locator('#dataset-draft-list li')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('canopy-dataset-draft-v1'))).toBe(draft);
  await page.locator('.sidebar [data-view="datasets"]').click();
  await expect(page.locator('#search')).toHaveValue('FOR-instance');
  expect(errors).toEqual([]);
});

test('objectives persist independently for both tasks without starting preparation', async ({
  page,
}) => {
  await page.goto('./#experiment/objectives');
  await page.locator('#variable-reflectance').selectOption('required');
  await page.locator('#preparation-task').selectOption('task:species');
  await page.locator('#task-rank').selectOption('genus');
  await page.locator('#task-use').selectOption('inference');
  await page.reload();
  await expect(page.locator('#preparation-task')).toHaveValue('task:species');
  await expect(page.locator('#task-rank')).toHaveValue('genus');
  await expect(page.locator('#task-use')).toHaveValue('inference');
  await page.locator('#preparation-task').selectOption('task:instances');
  await expect(page.locator('#variable-reflectance')).toHaveValue('required');
  await section(page, 'review').click();
  await expect(page.locator('#prepare-run')).toBeDisabled();
  await expect(page.locator('#prepare-download')).toBeHidden();
  await expect(page.locator('#dataset-plan')).toBeHidden();
});

test('history restores the task and its exact requirements across sections', async ({ page }) => {
  await page.goto('./#experiment/objectives');
  await page.locator('#variable-reflectance').selectOption('required');
  await section(page, 'preparation').click();
  await section(page, 'objectives').click();
  await page.locator('#preparation-task').selectOption('task:species');
  await page.locator('#task-rank').selectOption('genus');
  await page.locator('#task-use').selectOption('inference');
  await section(page, 'data').click();
  await page.goBack();
  await expect(page.locator('#task-rank')).toHaveValue('genus');
  await page.goBack();
  await expect(page).toHaveURL(/task=instances.*#experiment\/preparation$/);
  await expect(page.locator('#workspace-context-text')).toContainText('segmentation');
  await expect(page.locator('#workspace-consumer-fields')).toContainText('required');
  await page.goForward();
  await expect(page.locator('#preparation-task')).toHaveValue('task:species');
  await expect(page.locator('#task-rank')).toHaveValue('genus');
  await expect(page.locator('#task-use')).toHaveValue('inference');
});

test('an explicit route keeps its requirements when a different segmentation draft is saved', async ({
  page,
}) => {
  await page.goto('./#experiment/data');
  await expect(page.locator('#prepare-add')).toBeEnabled();
  await page.locator('#prepare-add').click();
  const draft = await page.evaluate(() => localStorage.getItem('canopy-dataset-draft-v1'));
  await page.goto('./?task=instances&use=inference#experiment/objectives');
  await expect(page.locator('#task-use')).toHaveValue('inference');
  await section(page, 'data').click();
  await expect(page.locator('#dataset-draft-restore')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('canopy-dataset-draft-v1'))).toBe(draft);
});

for (const width of [375, 1280]) {
  test('workspace sections remain readable at ' + width + 'px', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./#experiment/objectives');
    for (const name of ['objectives', 'data', 'preparation', 'splits', 'review']) {
      await section(page, name).click();
      await expect(page.locator('#workspace-navigation')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    await section(page, 'preparation').click();
    await page.screenshot({ path: info.outputPath('workspace-' + width + '.png'), fullPage: true });
  });
}
