import { expect } from '@playwright/test';

export async function openSubset(page, source) {
  const row = page.locator('#workspace-source-list tr').filter({ hasText: source });
  await row.getByRole('button', { name: 'Configure subset' }).click();
  await expect(page.locator('.workspace-subset-dialog[open]')).toBeVisible();
}

export async function closeSubset(page) {
  await page
    .locator('.workspace-subset-dialog[open]')
    .getByRole('button', { name: 'Close subset selection' })
    .click();
}

export async function chooseTask(page, task) {
  await page.locator('[data-workspace-task="task:' + task + '"]').check();
  await page
    .locator('[data-workspace-task="task:' + (task === 'species' ? 'instances' : 'species') + '"]')
    .uncheck();
}

export async function openRequirements(page) {
  const details = page.locator('#workspace-requirements');
  if (!(await details.evaluate((node) => node.open))) await details.locator('summary').click();
}
