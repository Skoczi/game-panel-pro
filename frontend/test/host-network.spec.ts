import { test, expect } from '@playwright/test';
const ip = { name: 'macvlan5', parent: 'enp6s0', ip: '51.83.150.145', mac: '02:00:00:24:4c:11' };
test('imports live addresses only after preview and save, restores saved state and fits mobile', async ({ page }) => {
  let entries: any[] = [], revision = 0, writes = 0;
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.route('**/api/system/host-network**', route => {
    const request = route.request();
    if (request.url().endsWith('/preview')) return route.fulfill({ json: { add: request.postDataJSON().entries, remove: [], keep: [] } });
    if (request.method() === 'PUT') { writes++; expect(request.postDataJSON().revision).toBe(revision); revision++; entries = request.postDataJSON().entries.map((e: any) => ({ ...e, status: 'active', persistent: true })); }
    return route.fulfill({ json: { available: true, revision, parents: ['enp6s0'], entries, discovered: entries.length ? [] : [ip], autostart: true } });
  });
  await page.goto('/test/host-network.fixture.html');
  await page.getByRole('button', { name: 'Import existing interfaces' }).click();
  expect(writes).toBe(0); await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.getByRole('region', { name: 'Network changes preview' })).toContainText(ip.ip);
  expect(writes).toBe(0); await page.getByRole('button', { name: 'Save on machine', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved on the machine'); expect(writes).toBe(1);
  await page.reload(); await expect(page.getByText('Active · saved for boot', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/host-network-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/host-network-mobile.png', fullPage: true });
});
test('in-use removal is blocked and stale edits can be discarded without writing', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/system/host-network**', route => {
    if (route.request().url().endsWith('/preview')) return route.fulfill({ status: 409, json: { error: 'IP is in use by eserv-sftp.' } });
    if (route.request().method() === 'PUT') writes++;
    return route.fulfill({ json: { available: true, revision: 1, parents: ['enp6s0'], entries: [{ ...ip, status: 'active', persistent: true }], discovered: [], autostart: true } });
  });
  await page.goto('/test/host-network.fixture.html');
  await page.getByRole('button', { name: `Remove ${ip.ip}` }).click();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.getByRole('alert')).toContainText('IP is in use');
  await expect(page.getByRole('button', { name: 'Save on machine', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Discard changes and reload' }).click();
  await expect(page.getByText(ip.ip, { exact: true })).toBeVisible(); expect(writes).toBe(0);
});
