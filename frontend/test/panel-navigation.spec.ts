import { test, expect } from '@playwright/test';

test('sidebar links restore the selected page on reload and browser history', async ({ page }) => {
  await page.route(/\/(nodes|templates|settings|users|host-status)$/, async route => {
    if (!route.request().isNavigationRequest()) return route.continue();
    const response = await route.fetch({ url: 'http://127.0.0.1:4178/test/server-page.fixture.html' });
    await route.fulfill({ response, body: (await response.text()).replace('./server-page.fixture.tsx', '/test/server-page.fixture.tsx') });
  });
  await page.goto('/test/server-page.fixture.html#/nodes/local/servers/7/console');
  await expect(page.locator('.gp-server-heading')).toBeVisible();
  const sidebar = page.locator('aside nav');
  await sidebar.getByRole('link', { name: 'Nodes', exact: true }).click();
  await expect(page).toHaveURL(/\/nodes$/);
  await expect(page.locator('.gp-server-heading')).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Nodes', exact: true })).toHaveAttribute('aria-current', 'page');
  await sidebar.getByRole('link', { name: 'Game Templates', exact: true }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await page.goBack();
  await expect(sidebar.getByRole('link', { name: 'Nodes', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page.locator('.gp-server-heading')).toBeVisible();
  await page.goForward();
  await page.reload();
  await expect(sidebar.getByRole('link', { name: 'Nodes', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.gp-server-heading')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/panel-navigation-desktop.png', fullPage: true });
});
