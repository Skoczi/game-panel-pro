import { test, expect } from '@playwright/test';

test('backup history excludes addon and clone jobs without releasing their maintenance lock', async ({ page }) => {
  let jobs = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `addon-${i}`, kind: 'addon', status: i === 0 ? 'running' : 'completed' })),
    { id: 'clone', kind: 'clone', status: 'completed' },
    { id: 'backup', kind: 'backup', status: 'completed' },
    { id: 'restore', kind: 'restore', status: 'completed' },
    { id: 'import', kind: 'import', status: 'completed' },
  ];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path.endsWith('/backups/jobs')) return route.fulfill({ json: { jobs: jobs.map(job => ({ ...job, startedAt: '2026-09-27T12:00:00Z' })) } });
    if (path.endsWith('/backups/compatibility')) return route.fulfill({ json: { layoutReady: true, legacy: [], recoveryCount: 0, capabilities: { backupJobs: 1, nativeRestoreRecovery: 1 } } });
    if (path.endsWith('/backups')) return route.fulfill({ json: { path: '/', entries: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/test/native-settings.fixture.html');
  await page.getByRole('button', { name: 'Backups', exact: true }).click();
  const history = page.getByRole('region', { name: 'Backup operations' });
  await expect(history).toBeVisible();
  await expect(history).toContainText('Backup · completed');
  await expect(history).toContainText('Restore · completed');
  await expect(history).toContainText('Import external backup · completed');
  await expect(history).not.toContainText('addons');
  await expect(history).not.toContainText('Clone');
  await expect(page.getByRole('button', { name: 'Create backup now' })).toBeDisabled();
  jobs = jobs.filter(job => job.kind === 'addon' || job.kind === 'clone');
  await expect(history).toHaveCount(0, { timeout: 6000 });
  await expect(page.getByRole('button', { name: 'Create backup now' })).toBeDisabled();
  jobs = [];
  await expect(page.getByRole('button', { name: 'Create backup now' })).toBeEnabled({ timeout: 6000 });
});
