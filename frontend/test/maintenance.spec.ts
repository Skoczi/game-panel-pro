import { test, expect } from '@playwright/test';
test('maintenance form saves the explicit plan and displays durable step results on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let body: any; let tasks: any[] = [];
  await page.route('**/api/**', async route => {
    if (!new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue();
    if (route.request().method() === 'POST') {
      body = route.request().postDataJSON(); tasks = [{ ...body, id: 3, lastStatus: 'failed', lastError: 'Backup failed', enabled: false }];
      return route.fulfill({ json: { task: tasks[0] } });
    }
    return route.fulfill({ json: { tasks, maintenanceWorkflow: true, maintenanceRuns: tasks.length ? [{ taskId: 3, status: 'failed', steps: [{ name: 'Verified backup', status: 'failed', detail: 'Storage unavailable' }, { name: 'Update game', status: 'pending' }] }] : [] } });
  });
  await page.goto('/test/maintenance.fixture.html');
  await page.getByRole('button', { name: 'Add Task' }).click();
  await page.getByRole('checkbox', { name: 'Maintenance workflow', exact: true }).check();
  await page.getByLabel('Optional game save command', { exact: true }).fill('save-all');
  await page.getByRole('checkbox', { name: 'Run the template update recipe' }).check();
  await page.getByRole('button', { name: /Create Task|Save Task/i }).click();
  await expect.poll(() => body?.payload?.maintenance?.update).toBe(true);
  expect(body.type).toBe('restart'); expect(body.payload.maintenance.saveCommand).toBe('save-all');
  await page.getByText('Workflow steps · failed').click();
  await expect(page.getByText('Storage unavailable')).toBeVisible();
  await expect(page.getByText('Update game: pending')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
