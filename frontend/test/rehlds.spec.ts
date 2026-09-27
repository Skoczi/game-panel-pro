import { test, expect, type Page } from '@playwright/test';
async function mock(page: Page, conflict = false, stopped = false) {
  const writes: any[] = [];
  let content = 'de_dust2\n';
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (request.method() === 'PUT') {
      writes.push(request.postDataJSON());
      if (conflict) return route.fulfill({ status: 409, json: { error: 'Configuration changed; reload before saving.' } });
      content = request.postDataJSON().content;
      return route.fulfill({ json: { version: 'next' } });
    }
    if (url.pathname.endsWith('/addons')) {
      const modules = ['metamod', 'amxx', 'reapi'].map(id => ({ id, name: id, version: 'test' }));
      return route.fulfill({ json: { fingerprint: 'reviewed-version', catalogue: modules, modules, installed: {}, stopped, changes: ['Verified backup'], sources: [] } });
    }
    return route.fulfill({ json: { content, version: 'original', path: '/serverfiles/cstrike/mapcycle.txt', root: 'data', available: ['de_dust2', 'de_inferno'], history: [] } });
  });
  return writes;
}
test('configuration conflict retains draft and sends reviewed file version', async ({ page }) => {
  const writes = await mock(page, true);
  await page.goto('/test/rehlds.fixture.html');
  await page.getByText('Advanced text editor', { exact: true }).click();
  await page.getByLabel('ReHLDS configuration').fill('de_inferno\n');
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Configuration changed');
  await expect(page.getByLabel('ReHLDS configuration')).toHaveValue('de_inferno\n');
  expect(writes).toEqual([{ content: 'de_inferno\n', version: 'original' }]);
});
test('running game cannot install addons and readonly configuration cannot save', async ({ page }) => {
  await mock(page);
  await page.goto('/test/rehlds.fixture.html?readonly');
  await expect(page.getByLabel('ReHLDS configuration')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toHaveCount(0);
  await page.goto('/test/rehlds.fixture.html');
  await page.getByRole('button', { name: 'Install addons', exact: true }).click();
  await page.getByRole('region', { name: 'metamod', exact: true }).getByRole('button', { name: 'Install', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back up and install' })).toBeDisabled();
  await expect(page.getByText('Stop the game before changing addons.')).toBeVisible();
});
for (const width of [390, 1280]) test(`addon catalogue and empty selection recover at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 }); await mock(page, false, true);
  await page.goto('/test/rehlds.fixture.html');
  await page.getByRole('button', { name: 'Install addons', exact: true }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Review addon operation' })).toHaveCount(0);
  await page.getByRole('region', { name: 'reapi', exact: true }).getByRole('button', { name: 'Install', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back up and install' })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Review addon operation' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
