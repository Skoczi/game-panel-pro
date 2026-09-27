import { test, expect } from '@playwright/test';
const state = { available: true, enabled: false, host: '51.83.150.145', port: 2023, username: '5877db8830525a45caaff780c2bd40da', directory: '/serverfiles', fingerprint: 'ssh-ed25519 · SHA256:example' };
test('SFTP lifecycle keeps credentials one-time, confirms revocation and fits mobile', async ({ page }) => {
  let enabled = false; const actions: string[] = [];
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.route('**/api/servers/8/sftp', route => {
    if (route.request().method() === 'POST') {
      const { action } = route.request().postDataJSON(); actions.push(action); enabled = action !== 'disable';
      return route.fulfill({ json: { ...state, enabled, ...(enabled ? { password: 'one-time-test-password' } : {}) } });
    }
    return route.fulfill({ json: { ...state, enabled } });
  });
  await page.goto('/test/sftp.fixture.html');
  const toggle = page.getByRole('switch', { name: 'Enable SFTP access' });
  await expect(toggle).toBeEnabled(); await toggle.click();
  await expect(page.getByLabel('SFTP password', { exact: true })).toHaveAttribute('type', 'password');
  await expect(page.getByText('51.83.150.145', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show SFTP password', exact: true }).click();
  await expect(page.getByLabel('SFTP password', { exact: true })).toHaveValue('one-time-test-password');
  await page.screenshot({ path: 'test-results/sftp-desktop.png', fullPage: true });
  await page.reload(); await expect(page.getByRole('button', { name: 'Generate new password', exact: true })).toBeVisible();
  await expect(page.getByLabel('SFTP password', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('one-time-test-password');
  await page.getByRole('button', { name: 'Generate new password', exact: true }).click();
  expect(actions).toEqual(['enable']);
  await page.getByRole('button', { name: 'Generate password', exact: true }).click();
  await expect(page.getByLabel('SFTP password', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/sftp-mobile.png', fullPage: true });
  await toggle.click(); expect(actions).toEqual(['enable', 'rotate']);
  await page.getByRole('button', { name: 'Disable SFTP', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByLabel('SFTP password', { exact: true })).toHaveCount(0);
  expect(actions).toEqual(['enable', 'rotate', 'disable']);
});
test('file readers cannot issue credentials and missing game IP disables activation', async ({ page }) => {
  let available = true;
  await page.route('**/api/servers/8/sftp', route => route.fulfill({ json: { ...state, available, reason: 'Dedicated game IP required.' } }));
  await page.goto('/test/sftp.fixture.html?readonly');
  await expect(page.getByRole('switch')).toBeDisabled();
  available = false; await page.goto('/test/sftp.fixture.html');
  await expect(page.getByRole('switch')).toBeDisabled();
  await expect(page.getByText('Dedicated game IP required.', { exact: true })).toBeVisible();
});
