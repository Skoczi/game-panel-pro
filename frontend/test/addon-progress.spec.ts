import { test, expect } from '@playwright/test';
test('addon installation progress reconnects after reload and reaches a visible result', async ({ page }) => {
  let phase = 0;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path.endsWith('/addons/jobs')) return route.fulfill({ json: { jobs: [{ id: 'job', kind: 'addon', status: phase === 2 ? 'completed' : 'running', startedAt: '2026-09-27T00:00:00Z', progress: phase === 0 ? { stage: 'backup', message: 'Backup: archiving entries', percent: 35 } : phase === 1 ? { stage: 'install-amxx', message: 'Installing AMX Mod X', percent: 60 } : { stage: 'completed', message: 'Installation completed. Server remains stopped.', percent: 100 } }] } });
    if (path.endsWith('/addons')) return route.fulfill({ json: { catalogue: [], modules: [], installed: {}, stopped: true, sources: [], changes: [] } });
    return route.fulfill({ json: { content: '', available: [], path: '/mapcycle.txt', root: 'data', version: 'v1', history: [] } });
  });
  await page.goto('/test/rehlds.fixture.html');
  await page.getByRole('button', { name: 'Install addons', exact: true }).click();
  const progress = page.getByRole('region', { name: 'Addon installation progress' });
  await expect(progress).toContainText('Backup: archiving entries');
  await expect(progress.getByRole('progressbar')).toHaveAttribute('value', '35');
  await page.reload();
  await page.getByRole('button', { name: 'Install addons', exact: true }).click();
  await expect(progress).toContainText('35%');
  phase = 1;
  await expect(progress).toContainText('Installing AMX Mod X');
  await expect(progress.getByRole('progressbar')).toHaveAttribute('value', '60');
  phase = 2;
  await expect(progress).toContainText('Installation completed');
  await expect(progress.getByRole('progressbar')).toHaveCount(0);
});
test('installed Reunion is visible independently of the installation selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path.endsWith('/addons/jobs')) return route.fulfill({ json: { jobs: [{ id: 'done', status: 'completed', startedAt: '2026-09-27', progress: { message: 'Installation completed. Server remains stopped.', percent: 100 } }] } });
    if (path.endsWith('/addons')) return route.fulfill({ json: { catalogue: [{ id: 'reunion', name: 'Reunion', version: '0.2.0.25' }], modules: [], installed: { reunion: '0.2.0.25' }, stopped: false, sources: [], changes: [] } });
    return route.fulfill({ json: { content: '', available: [], path: '/mapcycle.txt', root: 'data', version: 'v1', history: [] } });
  });
  await page.goto('/test/rehlds.fixture.html');
  await page.getByRole('button', { name: 'Install addons', exact: true }).click();
  const card = page.locator('.gp-addon-card').filter({ hasText: 'Reunion' });
  await expect(card).toContainText('Installed 0.2.0.25');
  await expect(card.getByRole('checkbox')).not.toBeChecked();
  await card.getByRole('checkbox').check();
  await expect(card).toContainText('Reinstall');
  await expect(card).toContainText('Installed 0.2.0.25');
  await expect(page.getByRole('region', { name: 'Addon installation progress' })).not.toContainText('Server remains stopped');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/addon-installed-mobile.png', fullPage: true });
});
