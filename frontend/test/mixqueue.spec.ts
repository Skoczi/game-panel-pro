import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const state = () => ({
  supported: true,
  configured: true,
  enabled: false,
  serverId: 'waw1-cs-mm-test',
  node: { installed: true, installation: 'idle', version: '0.6.1', installedVersion: '0.6.1', updateAvailable: false },
  plugin: { name: 'MatchBot CSCO', version: '0.6.2' },
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
test('existing node can upgrade without changing any server assignment', async ({ page }) => {
  const requests: any[] = [];
  let updated = false;
  await page.route('http://127.0.0.1:4178/api/**', async route => {
    if (route.request().method() === 'POST') { requests.push(route.request().postDataJSON()); updated = true; }
    await route.fulfill({ json: { installed: true, installation: 'idle', version: '0.6.1', installedVersion: updated ? '0.6.1' : '0.6.0', updateAvailable: !updated } });
  });
  await page.goto('/test/mixqueue.fixture.html?node');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('button', { name: 'Update runtime', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Installed on this node' })).toBeDisabled();
  expect(requests).toEqual([{ action: 'install' }]);
});
for (const width of [1280, 390]) test(`MatchBot review ${width}px upgrades an installed controller without reinstalling the agent`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1050 });
  const mutations: any[] = [];
  let installing = false;
  await page.route('http://127.0.0.1:4178/api/**', async route => {
    if (!route.request().url().includes('/mixqueue')) return route.fulfill({ json: { content: '', available: [], history: [], version: '1' } });
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); mutations.push(body);
      if (body.action === 'plugin-preview') return route.fulfill({ json: { stopped: true, fingerprint: 'reviewed-fixture', version: '0.6.2', minimumWebVersion: '0.7.2', ai: { botEnable: 'enable', filesToAdd: 494, filesPreserved: 0, navigation: [{ map: 'de_dust2', status: 'install', bspMatches: true }, { map: 'de_nuke', status: 'preserved', bspMatches: false }, { map: 'de_train', status: 'bsp_mismatch', bspMatches: false }] }, dependencies: [{ name: 'ReHLDS', version: '3.15.0.896' }, { name: 'ReGameDLL', version: '5.30.0.814' }, { name: 'Metamod-R', version: '1.3.0.149' }], conflicts: [{ file: 'addons/amxmodx/configs/plugins.ini', plugin: 'mq2_match.amxx' }] } });
      if (body.action === 'plugin') installing = true;
    }
    await route.fulfill({ json: { ...state(), plugin: { name: 'MatchBot CSCO', version: '0.6.2', installedVersion: '0.6.1', updateAvailable: true }, pluginInstalled: true, pluginOperation: installing ? { status: 'running', progress: { stage: 'backup', percent: 47 } } : null } });
  });
  await page.goto('/test/mixqueue.fixture.html');
  await page.getByRole('button', { name: 'MixQueue', exact: true }).click();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByText('MatchBot CSCO 0.6.1', { exact: true })).toBeVisible();
  await expect(page.getByText('Available: 0.6.2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review update', exact: true }).click();
  await expect(page.getByText('Requires CSCO 0.7.2+', { exact: true })).toBeVisible();
  await expect(page.getByText('mq2_match.amxx', { exact: true })).toBeVisible();
  await expect(page.getByText('Enable on restart', { exact: true })).toBeVisible();
  await page.locator('.mq-ai-preview summary').click();
  await expect(page.getByText('Add NAV', { exact: true })).toBeVisible();
  await expect(page.getByText('Keep existing NAV', { exact: true })).toBeVisible();
  await expect(page.getByText('Different BSP — NAV required', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install MatchBot CSCO', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await fs.mkdir('../artifacts/mixqueue-062', { recursive: true });
  await page.screenshot({ path: `../artifacts/mixqueue-062/matchbot-review-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'PL', exact: true }).click();
  await expect(page.getByText('Wymaga CSCO 0.7.2+', { exact: true })).toBeVisible();
  await expect(page.getByText('Włącz po restarcie', { exact: true })).toBeVisible();
  await expect(page.getByText('Zachowaj obecny NAV', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Przejrzyj aktualizację', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('button', { name: 'Install MatchBot CSCO', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '47');
  expect(mutations).toEqual([{ action: 'plugin-preview' }, { action: 'plugin', fingerprint: 'reviewed-fixture' }]);
});
