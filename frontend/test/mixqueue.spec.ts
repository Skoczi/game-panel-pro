import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const state = () => ({
  supported: true,
  configured: true,
  enabled: false,
  serverId: 'waw1-cs-mm-test',
  node: { installed: true, installation: 'idle', version: '0.2.3' },
  pluginInstalled: true,
  process: 'stopped',
  rcon: false,
  journal: false,
  heartbeat: false,
  ready: false,
  logs: [],
});
test('operator can import private JSON and explicitly enable one server', async ({ page }) => {
  let current = state();
  const mutations: any[] = [];
  await page.route('http://127.0.0.1:4178/api/**', async (route) => {
    if (route.request().url().includes('/mixqueue')) {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        mutations.push(body);
        if (body.action === 'enable') current = { ...current, enabled: true };
        if (body.action === 'import') current = { ...current, enabled: false };
      }
      return route.fulfill({ json: current });
    }
    return route.fulfill({ json: { content: '', available: [], version: '1', history: [] } });
  });
  await page.goto('/test/mixqueue.fixture.html');
  await page.getByRole('button', { name: 'MixQueue', exact: true }).click();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'MixQueue' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Replace configuration' }).click();
  const secret = 'test-only-key-not-a-production-secret';
  await page
    .getByLabel('Private JSON from csco.gg')
    .setInputFiles({
      name: 'setup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          agent: { server_id: 'waw1-cs-mm-test' },
          environment: { MQ2_AGENT_KEY: secret, MQ2_RCON_PASSWORD: null },
        })
      ),
    });
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Configuration imported');
  await expect(page.getByRole('switch', { name: 'MixQueue' })).not.toBeChecked();
  expect(await page.content()).not.toContain(secret);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
  ).not.toContain(secret);
  await page.getByRole('switch', { name: 'MixQueue' }).click();
  await expect(page.getByRole('switch', { name: 'MixQueue' })).toBeChecked();
  expect(mutations.map((m) => m.action)).toEqual(['import', 'enable']);
});
test('MixQueue tab is absent for a regular member', async ({ page }) => {
  await page.route('http://127.0.0.1:4178/api/**', (route) =>
    route.fulfill({ json: { content: '', available: [], version: '1', history: [] } })
  );
  await page.goto('/test/mixqueue.fixture.html?member');
  await expect(page.getByRole('button', { name: 'MixQueue', exact: true })).toHaveCount(0);
});
for (const width of [1280, 390])
  test(`MixQueue ${width}px has no overflow and supports PL/EN`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('http://127.0.0.1:4178/api/**', (route) =>
      route.fulfill({
        json: route.request().url().includes('/mixqueue')
          ? {
              ...state(),
              enabled: true,
              process: 'running',
              rcon: true,
              journal: true,
              heartbeat: true,
              ready: true,
              lastCheck: 1790580300000,
              logs: [{ time: 1790580300000, event: 'ready' }],
            }
          : { content: '', available: [], history: [], version: '1' },
      })
    );
    await page.goto('/test/mixqueue.fixture.html');
    await page.getByRole('button', { name: 'MixQueue', exact: true }).click();
    await page.getByRole('button', { name: 'PL', exact: true }).click();
    await expect(page.getByText('Dziennik pluginu', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await fs.mkdir('../artifacts/mixqueue', { recursive: true });
    await page.screenshot({ path: `../artifacts/mixqueue/server-${width}.png`, fullPage: true });
  });
test('node installation is independent from server enablement', async ({ page }) => {
  let installed = false;
  const requests: any[] = [];
  await page.route('http://127.0.0.1:4178/api/**', async (route) => {
    if (route.request().method() === 'POST') {
      requests.push(route.request().postDataJSON());
      installed = true;
    }
    await route.fulfill({ json: { installed, installation: 'idle', version: '0.2.3' } });
  });
  await page.goto('/test/mixqueue.fixture.html?node');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('button', { name: 'Install runtime' }).click();
  await expect(page.getByRole('button', { name: 'Installed on this node' })).toBeDisabled();
  expect(requests).toEqual([{ action: 'install' }]);
  await page.screenshot({ path: '../artifacts/mixqueue/node-desktop.png', fullPage: true });
});
