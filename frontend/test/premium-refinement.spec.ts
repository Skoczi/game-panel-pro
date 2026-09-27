import { test, expect } from '@playwright/test';

test('mobile console puts connection above logs and expands history on demand', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/test/server-page.fixture.html?monitoring#/nodes/local/servers/7/console');
  const consolePanel = page.locator('.gp-console-panel');
  const status = page.locator('.gp-server-runtime-status');
  const address = page.locator('.gp-server-connection');
  await expect(status).toContainText('Game responding');
  expect((await address.boundingBox())!.y).toBeLessThan((await consolePanel.boundingBox())!.y);
  const history = page.locator('.gp-server-performance');
  await expect(history).not.toHaveAttribute('open', '');
  await history.locator('summary').click();
  await expect(page.getByRole('heading', { name: 'CPU usage' })).toBeVisible();
  await page.getByRole('button', { name: 'Search console logs' }).click();
  await expect(page.getByRole('textbox', { name: 'Search console logs' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Search console logs' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('rotation drag uses the same reviewed draft and keeps duplicate maps and comments', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/**', route => {
    if (!new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue();
    if (route.request().method() !== 'GET') writes++;
    return route.fulfill({ json: { content: 'de_dust2\n; keep comment\nde_dust2\ncs_office\n', available: ['de_dust2','cs_office'], version: 'v1', path: '/mapcycle.txt', root: 'data', history: [] } });
  });
  await page.goto('/test/rehlds.fixture.html');
  const grip = page.getByRole('button', { name: 'Reorder cs_office 4', exact: true });
  await grip.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.gp-map-sortable.is-dragging')).toHaveCount(1);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('status').filter({ hasText: 'Position 3 of 4.' })).toHaveCount(1);
  await page.keyboard.press('Space');
  const rows = page.locator('ol.gp-map-list > li > span');
  await expect(rows).toHaveText(['de_dust2', '; keep comment', 'cs_office', 'de_dust2']);
  await expect(page.getByRole('button', { name: 'Reorder cs_office 3' })).toBeFocused();
  const source = await page.getByRole('button', { name: 'Reorder cs_office 3' }).boundingBox();
  const target = await page.getByRole('button', { name: 'Reorder de_dust2 1' }).boundingBox();
  await page.mouse.move(source!.x + 10, source!.y + 10);
  await page.mouse.down();
  await page.mouse.move(target!.x + 10, target!.y + 10, { steps: 12 });
  await page.mouse.up();
  await expect(rows).toHaveText(['cs_office', 'de_dust2', '; keep comment', 'de_dust2']);
  expect(writes).toBe(0);
  // dnd-kit briefly suppresses clicks after a pointer drop, including keyboard clicks.
  await expect(async () => {
    await page.getByRole('button', { name: 'Discard', exact: true }).press('Enter');
    await expect(page.getByRole('dialog', { name: 'Replace draft?' })).toBeVisible({ timeout: 200 });
  }).toPass({ timeout: 2000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(rows).toHaveText(['de_dust2', '; keep comment', 'de_dust2', 'cs_office']);
  expect(writes).toBe(0);
});

test('backup row shows metadata and secondary actions preserve restore confirmation', async ({ page }) => {
  let mutations = 0;
  await page.route('**/backups', route => route.fulfill({ json: { path: '/', entries: [{ name: 'manual.tar.gz', size: 485490688, modifiedAt: '2026-09-27T12:00:00Z', verification: { mode: 'offline', createdAt: '2026-09-27T12:00:00Z', validatedAt: '2026-09-27T12:01:00Z' } }] } }));
  await page.route('**/backups/jobs', route => { if (route.request().method() !== 'GET') mutations++; return route.fulfill({ json: { jobs: [] } }); });
  await page.route('**/backups/compatibility', route => route.fulfill({ json: { native: true, capabilities: { backupJobs: 1, nativeRestoreRecovery: 1 }, layoutReady: true, legacy: [], recoveryCount: 0 } }));
  await page.goto('/test/server-page.fixture.html?status=stopped#/nodes/local/servers/7/backup');
  const row = page.locator('.gp-backup-row');
  await expect(page.locator('.gp-sidebar button').filter({ hasText: 'Game Panel PRO' }).first()).toBeVisible();
  await expect(page.locator('.gp-sidebar > div').first().locator('button > span')).toHaveCSS('color', 'rgb(23, 37, 59)');
  await expect(row).toContainText('Verified');
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(0);
  const actions = page.getByLabel('Actions for manual.tar.gz');
  await actions.click();
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(actions).toBeFocused();
  await actions.click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(mutations).toBe(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.screenshot({ path: 'test-results/premium-backup-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: 'test-results/premium-backup-dark.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await row.locator('.gp-backup-details summary').click();
  await expect(row).toContainText('Captured while stopped');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/premium-backup-mobile.png', fullPage: true });
});
