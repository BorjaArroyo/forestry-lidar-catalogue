import { expect, test } from '@playwright/test';
import { openSubset, chooseTask, openRequirements } from './workspace-helpers.js';

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
  await expect(page.locator('.page-heading h1')).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(/#experiment\/splits$/);
  await expect(page.locator('.page-heading h1')).toBeFocused();
  await page.reload();
  await expect(page.locator('#workspace-partitions')).toHaveText('dev, train');
  await section(page, 'data').click();
  await expect(page.locator('#dataset-draft-list li')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('canopy-dataset-draft-v1'))).toBe(draft);
  await page.locator('.sidebar [data-view="datasets"]').click();
  await expect(page.locator('#search')).toHaveValue('FOR-instance');
  expect(errors).toEqual([]);
});

test('skip to content keeps the current workspace route and keyboard context', async ({ page }) => {
  await page.goto('./#experiment/data');
  const route = page.url();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(route);
  await expect(page.locator('.page-heading h1')).toBeFocused();
  await expect(page.locator('#workspace-navigation')).toBeVisible();
});

test('objectives persist independently for both tasks without starting preparation', async ({
  page,
}) => {
  await page.goto('./#experiment/objectives');
  await openRequirements(page);
  await page.locator('#variable-reflectance').selectOption('required');
  await chooseTask(page, 'species');
  await page.locator('#task-rank').selectOption('genus');
  await page.locator('#task-use').selectOption('inference');
  await page.reload();
  await expect(page.locator('#preparation-task')).toHaveValue('task:species');
  await expect(page.locator('#task-rank')).toHaveValue('genus');
  await expect(page.locator('#task-use')).toHaveValue('inference');
  await chooseTask(page, 'instances');
  await expect(page.locator('#variable-reflectance')).toHaveValue('required');
  await section(page, 'review').click();
  await expect(page.locator('#prepare-run')).toBeDisabled();
  await expect(page.locator('#prepare-download')).toBeHidden();
  await expect(page.locator('#dataset-plan')).toBeHidden();
});

test('history restores the task and its exact requirements across sections', async ({ page }) => {
  await page.goto('./#experiment/objectives');
  await openRequirements(page);
  await page.locator('#variable-reflectance').selectOption('required');
  await section(page, 'preparation').click();
  await section(page, 'objectives').click();
  await chooseTask(page, 'species');
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
  await openSubset(page, 'zenodo:8287792');
  await expect(page.locator('#prepare-add')).toBeEnabled();
  const cancel = page.locator('#prepare-subset-dialog .workspace-dialog-actions .close-dialog');
  await expect(cancel).toBeInViewport();
  expect(await cancel.evaluate((button) => button.scrollWidth <= button.clientWidth)).toBe(true);
  await page.locator('#prepare-add').click();
  const draft = await page.evaluate(() => localStorage.getItem('canopy-dataset-draft-v1'));
  await page.goto('./?task=instances&use=inference#experiment/objectives');
  await expect(page.locator('#task-use')).toHaveValue('inference');
  await section(page, 'data').click();
  await expect(page.locator('#dataset-draft-restore')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('canopy-dataset-draft-v1'))).toBe(draft);
});

test('subset selection is contextual, keyboard dismissible and reports duplicate errors in place', async ({
  page,
}, info) => {
  await page.goto('./#experiment/data');
  await expect(page.locator('#prepare-source')).toBeHidden();
  await openSubset(page, 'zenodo:8287792');
  await page.keyboard.press('Escape');
  await expect(page.locator('#prepare-subset-dialog')).toBeHidden();
  await expect(page.locator('[data-workspace-source="8287792"]')).toBeFocused();
  await openSubset(page, 'zenodo:8287792');
  await expect(page.locator('#prepare-add')).toBeEnabled();
  await page.screenshot({ path: info.outputPath('subset-dialog.png'), fullPage: true });
  await page.locator('#prepare-add').click();
  await expect(page.locator('#prepare-subset-dialog')).toBeHidden();
  await openSubset(page, 'zenodo:8287792');
  await expect(page.locator('#prepare-add')).toBeEnabled();
  await page.locator('#prepare-add').click();
  await expect(page.locator('#prepare-subset-dialog')).toBeVisible();
  await expect(page.locator('#prepare-subset-message')).not.toBeEmpty();
  await expect(page.locator('#prepare-subset-message')).toBeInViewport();
  await expect(page.locator('#dataset-draft-list li')).toHaveCount(1);
});

test('review requires explicit data and runs has its own empty view', async ({ page }) => {
  await page.goto('./#experiment/review');
  await expect(page.locator('#prepare-review')).toBeDisabled();
  await expect(page.locator('#workspace-review-state')).toContainText('Add a source subset');
  await page.locator('#workspace-consumer-description summary').click();
  await expect(page.locator('#workspace-consumer-fields')).toBeVisible();
  await expect(page.locator('#workspace-consumer-fields')).toContainText('instance_valid');
  await page.locator('.sidebar [data-workspace-section="runs"]').click();
  await expect(page.locator('#workspace-runs-empty')).toBeVisible();
  await expect(page.locator('#workspace-navigation')).toBeHidden();
  await expect(page.locator('.task-request')).toBeHidden();
  await expect(page.locator('#workspace-source-list')).toBeHidden();
  await expect(page.locator('#workspace-review-summary')).toBeHidden();
  await page.getByRole('button', { name: 'Return to experiment' }).click();
  await expect(page.locator('#workspace-review-summary')).toBeVisible();
});

for (const width of [375, 1280]) {
  test('workspace sections remain readable at ' + width + 'px', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./#experiment/objectives');
    for (const task of ['instances', 'species']) {
      await section(page, 'objectives').click();
      await chooseTask(page, task);
      for (const name of ['objectives', 'data', 'preparation', 'splits', 'review']) {
        await section(page, name).click();
        await expect(page.locator('#workspace-navigation')).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        for (const input of await page.locator('input:visible, select:visible').all()) {
          const bounds = await input.boundingBox();
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        }
        if (width === 1280) {
          expect(
            await page.evaluate(() => document.documentElement.scrollHeight),
          ).toBeLessThanOrEqual(1050);
          const navigation = await page.locator('#workspace-navigation').boundingBox();
          const content = await page.locator('.page-heading').boundingBox();
          expect(navigation.x + navigation.width).toBeLessThanOrEqual(content.x);
        }
        if (width === 375 && name === 'data') {
          // Source readiness can replace rows; measure the current table in one browser turn.
          await expect
            .poll(() =>
              page
                .locator('#workspace-source-list tr')
                .evaluateAll(
                  (rows) =>
                    rows.length > 0 && rows.every((row) => row.getBoundingClientRect().width > 280),
                ),
            )
            .toBe(true);
        }
        if (width === 1280 && name === 'data') {
          await openSubset(page, task === 'species' ? 'zenodo:13255198' : 'zenodo:8287792');
          const dialog = page.locator('.workspace-subset-dialog[open]');
          for (const input of await dialog.locator('select:visible').all()) {
            const bounds = await input.boundingBox();
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
          }
          expect(
            await dialog
              .locator('.notice')
              .first()
              .evaluate((node) =>
                parseFloat(node.ownerDocument.defaultView.getComputedStyle(node).fontSize),
              ),
          ).toBeGreaterThanOrEqual(13);
          await page.screenshot({
            path: info.outputPath(task + '-fields-' + width + '.png'),
            fullPage: true,
          });
          await page.keyboard.press('Escape');
        }
        await page.screenshot({
          path: info.outputPath(task + '-' + name + '-' + width + '.png'),
          fullPage: true,
        });
      }
    }
    await page.locator('.sidebar [data-workspace-section="runs"]').click();
    await page.screenshot({ path: info.outputPath('runs-' + width + '.png'), fullPage: true });
  });
}
