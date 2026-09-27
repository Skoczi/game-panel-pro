import { test, expect } from '@playwright/test';
const ip = { name: 'macvlan5', parent: 'enp6s0', ip: '51.83.150.145', mac: '02:00:00:24:4c:11', status: 'active', persistent: true };
test('saved host addresses feed allocation selection immediately without losing port drafts', async ({ page }) => {
  let hosts: any[] = [], allocations: any[] = [], saved: any;
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.route('**/api/system/host-network**', route => {
    if (route.request().url().endsWith('/preview')) return route.fulfill({ json: { add: [ip], keep: [], remove: [] } });
    if (route.request().method() === 'PUT') hosts = [ip];
    return route.fulfill({ json: { available: true, revision: 1, entries: hosts, discovered: hosts.length ? [] : [ip], parents: ['enp6s0'], autostart: true } });
  });
  await page.route('**/api/nodes/local/allocations', route => {
    if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); allocations = saved.network.allocations; }
    return route.fulfill({ json: { revision: 1, network: { restrictPorts: true, allocations }, assignments: [], pending: false } });
  });
  await page.goto('/test/node-network.fixture.html');
  const select = page.getByLabel('IP address', { exact: true });
  await expect(select.locator('option')).toHaveCount(1);
  await page.getByLabel('TCP ports', { exact: true }).fill('27015-27030');
  await page.getByRole('button', { name: 'Import existing interfaces' }).click();
  await expect(select.locator('option')).toHaveCount(1); // Unsaved imports aren't selectable.
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await page.getByRole('button', { name: 'Save on machine', exact: true }).click();
  await expect(select.locator(`option[value="${ip.ip}"]`)).toHaveCount(1);
  await expect(page.getByLabel('TCP ports', { exact: true })).toHaveValue('27015-27030');
  await select.selectOption(ip.ip); await page.getByRole('button', { name: 'Add to list', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Settings saved. Changes are active.', { exact: true })).toBeVisible();
  expect(saved.network.allocations).toEqual([{ ip: ip.ip, tcp: '27015-27030', udp: '', alias: '' }]);
  await page.screenshot({ path: 'test-results/node-network-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/node-network-mobile.png', fullPage: true });
});
test('unavailable host inventory preserves existing allocations for editing without accepting arbitrary new IPs', async ({ page }) => {
  await page.route('**/api/system/host-network', route => route.fulfill({ json: { available: false, entries: [], discovered: [], parents: [], reason: 'Host manager unavailable.' } }));
  await page.route('**/api/nodes/local/allocations', route => route.fulfill({ json: { revision: 1, network: { restrictPorts: true, allocations: [{ ip: ip.ip, tcp: '27015', udp: '', alias: 'Existing' }] }, assignments: [], pending: false } }));
  await page.goto('/test/node-network.fixture.html');
  await page.getByRole('button', { name: `Edit ${ip.ip}`, exact: true }).click();
  await expect(page.getByLabel('IP address', { exact: true })).toHaveValue(ip.ip);
  await expect(page.getByLabel('IP address', { exact: true }).locator('option')).toHaveCount(2);
  await page.getByLabel('TCP ports', { exact: true }).fill('27015-27020');
  await page.getByRole('button', { name: 'Update entry', exact: true }).click();
  await expect(page.getByText('27015-27020', { exact: true })).toBeVisible();
  await expect(page.getByLabel('IP address', { exact: true }).locator('option')).toHaveCount(1);
});
