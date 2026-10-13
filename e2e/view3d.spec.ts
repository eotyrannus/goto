import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Drives the 3D view through the dev-only window.__pod handle (store + 3D api).

const design = (page: Page) => page.evaluate(() => (window as any).__pod.store.getState().design);

async function open3d(page: Page, template: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => (window as any).__pod?.canvas.stage);
  await page.getByTestId('designs-button').click();
  await page.getByTestId(`template-${template}`).click();
  await page.getByTestId('view-3d').click();
  await page.waitForFunction(() => (window as any).__pod.three?.ready, null, { timeout: 20_000 });
  await page.waitForTimeout(500);
  return errors;
}

test('3D view renders and clicking furniture selects it', async ({ page }) => {
  const errors = await open3d(page, 'Meeting pod');
  const table = (await design(page)).items.find((it: any) => it.type === 'table-rect');
  const at = await page.evaluate((id) => (window as any).__pod.three.project(id), table.id);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId('properties')).toContainText('Meeting table');

  // Edits in the panel show up in 3D; the TV comes with its mounting height.
  const tv = (await design(page)).items.find((it: any) => it.type === 'tv');
  expect(tv.elevation).toBe(1000);
  await page.getByTestId('item-height').fill('90');
  await page.getByTestId('item-height').press('Enter');
  expect((await design(page)).items.find((it: any) => it.id === table.id).height).toBe(900);

  // Clicking empty space clears the selection.
  const box = (await page.getByTestId('scene3d').boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 20);
  expect(await page.evaluate(() => (window as any).__pod.store.getState().selection)).toBeNull();
  expect(errors).toEqual([]);
});

test('drag furniture from the catalog onto the 3D floor', async ({ page }) => {
  await open3d(page, 'Empty room');
  const box = (await page.getByTestId('scene3d').boundingBox())!;
  await page.getByTestId('catalog-item:plant').dragTo(page.getByTestId('scene3d'), { targetPosition: { x: box.width / 2, y: box.height / 2 } });
  const d = await design(page);
  expect(d.items).toHaveLength(1);
  const it = d.items[0];
  expect(it.x).toBeGreaterThan(0);
  expect(it.x).toBeLessThan(d.room.width);
  expect(it.y).toBeGreaterThan(0);
  expect(it.y).toBeLessThan(d.room.depth);
});

test('walk mode moves at eye height, stays inside, and Esc returns to orbit', async ({ page }) => {
  await open3d(page, 'Focus pod');
  await page.getByTestId('walk-button').click();
  await page.waitForTimeout(300);
  const cam = () => page.evaluate(() => (window as any).__pod.three.camera());
  const start = await cam();
  expect(Math.round(start.z)).toBe(1600);

  // Arrow keys move the walker, not the selection.
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowUp');
  const moved = await cam();
  expect(Math.hypot(moved.x - start.x, moved.y - start.y)).toBeGreaterThan(100);

  // Hold forward for a long time: walls stop you.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(4000);
  await page.keyboard.up('KeyW');
  const d = await design(page);
  const end = await cam();
  for (const [v, max] of [
    [end.x, d.room.width],
    [end.y, d.room.depth],
  ]) {
    expect(v).toBeGreaterThan(200);
    expect(v).toBeLessThan(max - 200);
  }

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('walk-button')).toBeVisible();
});

test('exports the 3D view as PNG and as a glTF model', async ({ page }) => {
  await open3d(page, 'Duo pod');
  await page.getByTestId('export-menu').click();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-3d-png').click()]);
  expect(png.suggestedFilename()).toBe('duo-pod-3d.png');
  await png.saveAs('test-results/view3d.png');
  expect(readFileSync('test-results/view3d.png').subarray(1, 4).toString()).toBe('PNG');

  await page.getByTestId('export-menu').click();
  const [glb] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-glb').click()]);
  expect(glb.suggestedFilename()).toBe('duo-pod.glb');
  await glb.saveAs('test-results/duo-pod.glb');
  const bytes = readFileSync('test-results/duo-pod.glb');
  expect(bytes.subarray(0, 4).toString()).toBe('glTF');
  expect(bytes.length).toBeGreaterThan(10_000);
});
