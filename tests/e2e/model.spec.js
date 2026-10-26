import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const model = JSON.parse(
  fs.readFileSync(new URL('../../data/knowledge-model.json', import.meta.url)),
);

async function openModel(page) {
  await page.goto('./#model');
  await expect(page.locator('#model-status')).toHaveText('Reviewed knowledge model');
  await expect(page.locator('.graph-node')).toHaveCount(12);
}

async function fitted(page) {
  return page.locator('#model-graph').evaluate((svg) => {
    const canvas = svg.getBoundingClientRect();
    return [...svg.querySelectorAll('.graph-node rect')].every((node) => {
      const box = node.getBoundingClientRect();
      return (
        box.left >= canvas.left &&
        box.right <= canvas.right &&
        box.top >= canvas.top &&
        box.bottom <= canvas.bottom
      );
    });
  });
}

test('model navigation respects visibility and inspects requirements separately from preparation', async ({
  page,
}) => {
  await openModel(page);
  await expect(page.locator('[data-view="model"]')).toBeVisible();
  await expect(page.locator('.task-request')).toBeHidden();
  await expect(page.locator('#model-task-nav')).toBeVisible();
  await expect(page.locator('#model-graph-count')).toHaveText(
    '2 of 12 sources · 2 admitted routes',
  );
  const requirement = page.locator('[data-edge="task:instances:requires:xyz"]');
  await requirement.focus();
  await requirement.press('Enter');
  await expect(page.locator('#model-inspector')).toContainText('TASK REQUIREMENT');
  await expect(page.locator('#model-inspector')).not.toContainText('PREPARATION RELATIONSHIP');
  const camera = await page.locator('#model-content').getAttribute('transform');
  const source = page.locator('[data-node="zenodo:8287792"]');
  await source.focus();
  await source.press('Space');
  await expect(page.locator('#model-inspector h3')).toHaveText('FOR-instance');
  await expect(source).toBeFocused();
  expect(await page.locator('#model-content').getAttribute('transform')).toBe(camera);
  await page.locator('[data-edge="flow:for-instance-prepare-input"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#model-inspector h3')).toHaveText(
    'Preparation consumes input contract',
  );
});

test('reported sources, pan, zoom, and reopening preserve usable navigation', async ({ page }) => {
  await openModel(page);
  await page.locator('#model-show-reported').check();
  await expect(page.locator('.graph-node')).toHaveCount(22);
  await expect(page.locator('#model-graph-count')).toHaveText(
    '12 of 12 sources · 2 admitted routes',
  );
  expect(await fitted(page)).toBe(true);
  await page.locator('#model-show-reported').uncheck();
  const initial = await page.locator('#model-content').getAttribute('transform');
  await page.locator('#model-zoom-in').click();
  expect(await page.locator('#model-content').getAttribute('transform')).not.toBe(initial);
  await page.locator('#model-graph').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('0');
  expect(await fitted(page)).toBe(true);
  const box = await page.locator('#model-graph').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30);
  await page.mouse.up();
  await page.locator('[data-view="datasets"]').click();
  await expect(page.locator('.task-request')).toBeVisible();
  await page.locator('[data-view="model"]').click();
  expect(await fitted(page)).toBe(true);
});

test('failed model loads have a working retry', async ({ page }) => {
  let healthy = false;
  await page.route('**/data/knowledge-model.json', (route) =>
    healthy ? route.fulfill({ json: model }) : route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('./#model');
  await expect(page.locator('#model-status')).toHaveText('Knowledge model unavailable');
  healthy = true;
  await page.locator('#model-retry').click();
  await expect(page.locator('.graph-node')).toHaveCount(12);
  await expect(page.locator('#model-retry')).toBeHidden();
});

test('a model without admitted routes explains its empty state', async ({ page }) => {
  const changed = structuredClone(model);
  for (const node of Object.values(changed.nodes))
    if (node.type === 'pipeline_spec') node.data.execution_enabled = false;
  await page.route('**/data/knowledge-model.json', (route) => route.fulfill({ json: changed }));
  await page.goto('./#model');
  await expect(page.locator('#model-empty')).toBeVisible();
  await expect(page.locator('#model-graph-count')).toHaveText(
    '0 of 12 sources · 0 admitted routes',
  );
  await page.locator('#model-show-reported').check();
  await expect(page.locator('.graph-node.reported')).toHaveCount(12);
});

for (const width of [1024, 1280, 1440, 1920]) {
  test(`model fits without page overflow or text collisions at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await openModel(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(await fitted(page)).toBe(true);
    expect(
      await page.locator('.graph-node').evaluateAll((nodes) =>
        nodes.every((node) => {
          const rect = node.querySelector('rect').getBBox();
          return [...node.querySelectorAll('text')].every((text) => {
            const box = text.getBBox();
            return (
              box.x >= 0 &&
              box.x + box.width <= rect.width &&
              box.y >= 0 &&
              box.y + box.height <= rect.height
            );
          });
        }),
      ),
    ).toBe(true);
    await page
      .locator('#view-model')
      .screenshot({ path: testInfo.outputPath(`model-${width}.png`) });
    await page.locator('#model-show-reported').check();
    expect(await fitted(page)).toBe(true);
    await page.setViewportSize({ width: width === 1024 ? 1440 : 1024, height: 1000 });
    await expect.poll(() => fitted(page)).toBe(true);
  });
}
