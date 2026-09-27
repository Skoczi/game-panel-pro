import { test, expect } from '@playwright/test';
for (const width of [390, 1440])
  test(`configuration editors and drafts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    let submitted: any;
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (!path.startsWith('/api/')) return route.continue();
      if (route.request().method() === 'PUT') {
        submitted = route.request().postDataJSON();
        return route.fulfill({ status: 409, json: { error: 'Version conflict' } });
      }
      if (path.endsWith('/file'))
        return route.fulfill({ body: 'hostname "Test"\n', headers: { ETag: 'v1' } });
      return route.fulfill({
        json: {
          content: path.endsWith('/admins')
            ? '; keep\n"STEAM_0:1:123" "" "bc" "ce" ; owner\n"legacy" "secret" "b" "a"\n'
            : 'de_dust2\n',
          version: 'v1',
          available: ['de_dust2', 'de_inferno'],
          path: '/config.txt',
          root: 'data',
          history: [],
        },
      });
    });
    await page.goto('/test/native-game-config.fixture.html');
    await page.getByRole('button', { name: 'Configuration files 2' }).click();
    await page.getByRole('button', { name: 'Maps and rotation', exact: true }).click();
    await page.getByRole('button', { name: 'Add de_inferno', exact: true }).click();
    await page.getByRole('button', { name: 'Addons', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Administrators', exact: true })
    ).not.toBeVisible();
    await page.getByRole('button', { name: 'Configuration files 2' }).click();
    await expect(page.getByRole('region', { name: 'Map rotation', exact: true })).toContainText(
      'de_inferno'
    );
    await page.getByRole('button', { name: 'Administrators', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Edit STEAM_0:1:123', exact: true }).click();
    await page.getByRole('checkbox', { name: /Ban/ }).check();
    await page.getByRole('button', { name: 'Update administrator in draft' }).click();
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save with snapshot' }).click();
    await expect(page.getByRole('alert')).toContainText('Version conflict');
    expect(submitted).toEqual({
      content: '; keep\n"STEAM_0:1:123" "" "bcd" "ce" ; owner\n"legacy" "secret" "b" "a"\n',
      version: 'v1',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({
      path: `test-results/configuration-admins-${width}.png`,
      fullPage: true,
    });
  });
