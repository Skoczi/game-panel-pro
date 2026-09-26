import { test, expect } from '@playwright/test';
test('clone requires stopped source and review, retains submitted ports, and fits mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let stopped = false, body: any;
  await page.route('**/api/**', async route => {
    if (!new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue();
    if (route.request().method() === 'POST') { body = route.request().postDataJSON(); return route.fulfill({ status: 409, json: { error: 'Public port overlaps another server' } }); }
    return route.fulfill({ json: { name: 'Source', stopped, fingerprint: 'reviewed', ports: { tcp: [], udp: [{ host: 27015, container: 27015, hostIp: '127.0.0.1', label: 'Game' }] }, changes: ['Both servers stay stopped'] } });
  });
  await page.goto('/test/clone.fixture.html');
  await expect(page.getByRole('button', { name: 'Review clone', exact: true })).toBeDisabled();
  stopped = true; await page.getByRole('button', { name: 'Refresh clone preview' }).click();
  await expect(page.getByRole('button', { name: 'Review clone', exact: true })).toBeEnabled();
  await page.getByLabel('udp 0 public port').fill('27025');
  await page.getByRole('button', { name: 'Review clone', exact: true }).click();
  expect(body).toBeUndefined();
  await page.getByRole('button', { name: 'Create backup and clone' }).click();
  await expect(page.getByRole('alert')).toContainText('Public port overlaps');
  expect(body.ports.udp[0].host).toBe(27025); expect(body.fingerprint).toBe('reviewed');
  await expect(page.getByLabel('udp 0 public port')).toHaveValue('27025');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
