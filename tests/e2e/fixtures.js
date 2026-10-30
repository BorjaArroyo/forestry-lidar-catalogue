import { expect, test as base } from '@playwright/test';

/* Native control events dispatched before the deferred module graph finishes
   mounting the application are silently lost, which raced in slower engines.
   Every navigation waits for the bootstrap completion marker before returning,
   so a test cannot interact with a partially mounted page. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const root = page.locator('html');
    const booted = async () => {
      await expect(root).toHaveAttribute('data-canopy-ready', 'true', { timeout: 15_000 });
    };
    const goto = page.goto.bind(page);
    page.goto = async (...args) => {
      const navigation = await goto(...args);
      await booted();
      return navigation;
    };
    const reload = page.reload.bind(page);
    page.reload = async (...args) => {
      const navigation = await reload(...args);
      await booted();
      return navigation;
    };
    await use(page);
  },
});
