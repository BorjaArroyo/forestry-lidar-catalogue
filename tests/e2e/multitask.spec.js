import { test, expect } from '@playwright/test';

const section = (page, value) =>
  page.locator('#workspace-navigation [data-workspace-section="' + value + '"]');

test('shared objectives, source and coverage persist in application navigation and history', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#experiment/objectives');
  await page.locator('[data-workspace-task="task:species"]').check();
  await expect(page.locator('[data-workspace-task]:checked')).toHaveCount(2);
  await section(page, 'data').click();
  await expect(page.locator('#workspace-source-list')).toContainText('TreeScan');
  await expect(page.locator('#workspace-source-list')).not.toContainText('FOR-instance');
  await page.locator('#workspace-source-list [data-experiment-add="19127709"]').click();
  await expect(page.locator('[data-joint-plot]')).toHaveCount(6);
  for (const input of await page.locator('[data-joint-plot]').all()) await input.check();
  await section(page, 'preparation').click();
  await page.locator('[name="experiment-coverage"][value="partial"]').check();
  await expect(page.locator('#experiment-coverage-counts')).toContainText('238');
  await page.locator('[name="experiment-coverage"][value="joint"]').check();
  await expect(page.locator('#experiment-coverage-counts')).toContainText('153');
  await section(page, 'review').click();
  await expect(page.locator('#experiment-run')).toBeDisabled();
  await expect(page.locator('#workspace-single-task-routes')).toBeHidden();
  await page.reload();
  await expect(page.locator('#workspace-review-summary')).toContainText(
    'All selected references required',
  );
  await expect(page.locator('#workspace-review-summary')).toContainText('6 complete audited plots');
  await page.locator('#workspace-consumer-description summary').click();
  await expect(page.locator('#workspace-consumer-fields')).toContainText('validity.taxonomy');
  await expect(page.locator('#workspace-consumer-fields')).toContainText('relations.point_to_tree');
  await page.goBack();
  await expect(page).toHaveURL(/#experiment\/preparation$/);
  await expect(page.locator('[name="experiment-coverage"][value="joint"]')).toBeChecked();
  await page.locator('.sidebar [data-view="datasets"]').click();
  await expect(page.locator('#dataset-grid')).toContainText('TreeScan');
  await expect(page.locator('#dataset-grid')).not.toContainText('FOR-instance');
  expect(errors).toEqual([]);
});

test('rank and crown filters affect candidates while joint drafts cannot trigger native controls', async ({
  page,
}) => {
  await page.goto(
    './?task=instances&tasks=instances,species&sources=19127709&coverage=joint#experiment/objectives',
  );
  await page.locator('#experiment-rank').selectOption('genus');
  await section(page, 'data').click();
  await page.locator('#experiment-source-evidence summary').click();
  await page.locator('#experiment-complete-crowns').check();
  await section(page, 'preparation').click();
  await expect(page.locator('#experiment-coverage-counts')).toContainText('Genus');
  await section(page, 'review').click();
  await page.evaluate(() => {
    document.getElementById('prepare-run').click();
    document.getElementById('classification-run').click();
  });
  await expect(page.locator('#prepare-download')).toBeHidden();
  await expect(page.locator('#classification-download')).toBeHidden();
  await page.locator('.sidebar [data-workspace-section="runs"]').click();
  await expect(page.locator('#experiment-runs-info')).toBeVisible();
  await expect(page.locator('#workspace-review-summary')).toBeHidden();
  await page.getByRole('button', { name: 'Edit objectives' }).click();
  await page.locator('[data-workspace-task="task:species"]').uncheck();
  await section(page, 'data').click();
  await expect(page.locator('[data-workspace-source="8287792"]')).toBeVisible();
});

for (const width of [1280, 1440])
  test('shared workspace stays usable at ' + width + 'px', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./?tasks=instances,species&sources=19127709&coverage=partial#experiment/data');
    for (const view of ['data', 'preparation', 'splits', 'review']) {
      await section(page, view).click();
      await expect(page.locator('#workspace-context-text')).toContainText(
        'Instances + tree classification',
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath('shared-' + view + '-' + width + '.png'),
        fullPage: true,
      });
    }
  });
