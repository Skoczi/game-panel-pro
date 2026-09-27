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
