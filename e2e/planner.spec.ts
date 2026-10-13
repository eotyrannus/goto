import { expect, test, type Page } from '@playwright/test';

// Helpers reach into the dev-only window.__pod handle to translate plan millimetres to screen pixels.

type Pt = { x: number; y: number };

async function toScreen(page: Page, p: Pt): Promise<Pt> {
  return page.evaluate(({ x, y }) => {
    const stage = (window as any).__pod.canvas.stage;
    const box = stage.container().getBoundingClientRect();
    const t = stage.getAbsoluteTransform().point({ x, y });
    return { x: box.left + t.x, y: box.top + t.y };
  }, p);
}

const design = (page: Page) => page.evaluate(() => (window as any).__pod.store.getState().design);
const selection = (page: Page) => page.evaluate(() => (window as any).__pod.store.getState().selection);

async function fresh(page: Page, template = 'Empty room') {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => (window as any).__pod?.canvas.stage);
  await page.getByTestId('designs-button').click();
  await page.getByTestId(`template-${template}`).click();
  await page.waitForTimeout(100);
}

test('drag furniture from the catalog onto the plan', async ({ page }) => {
  await fresh(page);
  const target = await toScreen(page, { x: 1500, y: 1200 });
  await page.getByTestId('catalog-item:desk').dragTo(page.getByTestId('canvas'), {
    targetPosition: { x: target.x - (await page.getByTestId('canvas').boundingBox())!.x, y: target.y - (await page.getByTestId('canvas').boundingBox())!.y },
  });
  const d = await design(page);
  expect(d.items).toHaveLength(1);
  expect(d.items[0]).toMatchObject({ type: 'desk' });
  expect(Math.abs(d.items[0].x - 1500)).toBeLessThan(30);
  await expect(page.getByTestId('properties')).toContainText('Desk');
});

test('select, move with snapping, and edit dimensions', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('catalog-item:desk').click(); // adds at room centre (1500, 1250)
  await page.mouse.click(10, 10); // blur
  await page.keyboard.press('Escape');
  expect(await selection(page)).toBeNull();

  const from = await toScreen(page, { x: 1500, y: 1250 });
  const to = await toScreen(page, { x: 720, y: 360 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();

  let it = (await design(page)).items[0];
  // 1400×700 desk dropped near the top-left corner snaps flush to both walls.
  expect(it.x).toBe(700);
  expect(it.y).toBe(350);

  await page.getByTestId('item-width').fill('160');
  await page.getByTestId('item-width').press('Enter');
  it = (await design(page)).items[0];
  expect(it.width).toBe(1600);

  await page.keyboard.press('r');
  expect((await design(page)).items[0].rotation).toBe(90);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await design(page)).items[0]).toMatchObject({ width: 1400, rotation: 0 });
});

test('resize furniture with the transformer handle', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('catalog-item:table-rect').click(); // 1800×900 at (1500, 1250)
  const handle = await toScreen(page, { x: 2400, y: 1250 }); // middle-right anchor
  const to = await toScreen(page, { x: 2700, y: 1250 });
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  const it = (await design(page)).items[0];
  expect(Math.abs(it.width - 2100)).toBeLessThanOrEqual(20);
  expect(it.depth).toBe(900);
  expect(Math.abs(it.x - 1650)).toBeLessThanOrEqual(15);
});

test('doors slide along walls and jump to another wall', async ({ page }) => {
  await fresh(page);
  const before = (await design(page)).openings[0]; // bottom wall, 300..1200
  expect(before.wall).toBe('bottom');
  const grab = await toScreen(page, { x: 750, y: 2550 });
  const along = await toScreen(page, { x: 1750, y: 2550 });
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(along.x, along.y, { steps: 6 });
  await page.mouse.up();
  let o = (await design(page)).openings[0];
  expect(o.wall).toBe('bottom');
  expect(Math.abs(o.offset - 1300)).toBeLessThanOrEqual(50);

  const g2 = await toScreen(page, { x: o.offset + 450, y: 2550 });
  const right = await toScreen(page, { x: 3050, y: 1000 });
  await page.mouse.move(g2.x, g2.y);
  await page.mouse.down();
  await page.mouse.move(right.x, right.y, { steps: 8 });
  await page.mouse.up();
  o = (await design(page)).openings[0];
  expect(o.wall).toBe('right');
});

test('room resizes from the properties panel and the wall handle', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('room-width').fill('420');
  await page.getByTestId('room-width').press('Enter');
  expect((await design(page)).room.width).toBe(4200);

  const handle = await toScreen(page, { x: 2100, y: 2550 }); // bottom wall midpoint (room is now 4.2 m wide)
  const to = await toScreen(page, { x: 2100, y: 3050 });
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  expect(Math.abs((await design(page)).room.depth - 3000)).toBeLessThanOrEqual(50);
});

test('designs persist across reloads', async ({ page }) => {
  await fresh(page, 'Meeting pod');
  await page.getByLabel('Design name').fill('Board room');
  await page.getByLabel('Design name').press('Enter');
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => (window as any).__pod?.canvas.stage);
  const d = await design(page);
  expect(d.name).toBe('Board room');
  expect(d.items.length).toBeGreaterThan(5);
  await page.getByTestId('designs-button').click();
  await expect(page.locator('.design-list li')).toContainText(['Board room']);
});

test('exports PNG and JPEG', async ({ page }) => {
  await fresh(page, 'Lounge');
  for (const [fmt, ext] of [
    ['png', '.png'],
    ['jpeg', '.jpg'],
  ]) {
    await page.getByTestId('export-menu').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId(`export-${fmt}`).click()]);
    expect(dl.suggestedFilename()).toBe(`lounge${ext}`);
    await dl.saveAs(`test-results/export${ext}`);
  }
});
