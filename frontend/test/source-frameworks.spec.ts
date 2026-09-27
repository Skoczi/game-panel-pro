import { test, expect, type Page } from '@playwright/test';
import { SOURCE_MODULES, sourceModuleVersion } from '../../backend/src/services/sourcePackages';
import type { SourceGame } from '../../backend/src/templates/sourceProfile';
async function mock(page: Page, game = 'cs2', stopped = true) {
  let posted: any;
  let jobs: any[] = [{ id: 'old', kind: 'addon', status: 'completed', startedAt: '2026-01-01' }];
  const catalogue = SOURCE_MODULES.filter((m) => m.games.includes(game)).map((m) => ({
    ...m,
    version: sourceModuleVersion(game as SourceGame,m.id),
    installed: m.id === 'metamod',
    installedVersion: m.id === 'metamod' ? sourceModuleVersion(game as SourceGame,m.id) : null,
    managed: m.id === 'metamod',
    pluginsDirectory: '/serverfiles/game/csgo/addons/metamod',
    configurationFiles:
      m.id === 'metamod' ? ['/serverfiles/game/csgo/addons/metamod/metaplugins.ini'] : [],
  }));
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname.endsWith('/jobs')) return route.fulfill({ json: { jobs } });
    if (url.pathname.endsWith('/source-addons')) {
      if (route.request().method() === 'POST') {
        posted = route.request().postDataJSON();
        jobs = [
          {
            id: 'new',
            kind: 'addon',
            status: 'running',
            startedAt: '2026-09-27',
            progress: { stage: 'backup', message: 'Creating recovery backup', percent: 42 },
          },
        ];
        return route.fulfill({ status: 202, json: { job: jobs[0] } });
      }
      return route.fulfill({
        json: {
          catalogue,
          stopped,
          fingerprint: 'verified',
          modules: url.searchParams.has('module')
            ? ['metamod', url.searchParams.get('module')]
            : [],
        },
      });
    }
    return route.fulfill({ json: { files: [], entries: [] } });
  });
  return {
    post: () => posted,
    finish: () => {
      jobs = [{ ...jobs[0], status: 'completed' }];
    },
  };
}
for (const width of [390, 1440])
  for (const theme of ['dark', 'light'])
    test(`Source framework cards ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      const m = await mock(page);
      await page.goto('/test/source-frameworks.fixture.html');
      await page.getByRole('button', { name: 'Addons', exact: true }).click();
      await expect(page.locator('.gp-source-card')).toHaveCount(4);
      await expect(page.getByText('Changes applied')).not.toBeVisible();
      await expect(page.locator('.gp-source-card').filter({has:page.getByRole('heading',{name:'ModSharp',exact:true})}).getByRole('button',{name:'Install',exact:true})).toBeDisabled();
      await page.getByRole('button',{name:'Framework files',exact:true}).click();
      await expect(page.getByLabel('Opened file')).toHaveText('directory:/serverfiles/game/csgo/addons/metamod');
      const css = page
        .locator('.gp-source-card')
        .filter({ has: page.getByRole('heading', { name: 'CounterStrikeSharp', exact: true }) });
      await css.getByRole('button', { name: 'Install', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('Metamod:Source + CounterStrikeSharp');
      await page.getByRole('dialog').getByRole('button', { name: 'Install', exact: true }).click();
      expect(m.post()).toEqual({
        module: 'counterstrikesharp',
        action: 'install',
        fingerprint: 'verified',
      });
      await expect(page.getByRole('progressbar')).toHaveAttribute('value', '42');
      await expect(css.getByRole('button', { name: 'Install', exact: true })).toBeDisabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await page.screenshot({
        path: `test-results/source-frameworks-${width}-${theme}.png`,
        fullPage: true,
      });
      m.finish();
      await expect(page.getByText('Changes applied')).toBeVisible({ timeout: 6000 });
      await page.getByRole('button', { name: 'Dismiss operation' }).click();
      await expect(page.getByText('Changes applied')).not.toBeVisible();
    });
test('Source is not classified as GoldSrc and permission blocks mutations', async ({ page }) => {
  await mock(page, 'css');
  await page.goto('/test/source-frameworks.fixture.html?game=css&readonly');
  await page.getByRole('button', { name: 'Addons', exact: true }).click();
  await expect(page.locator('.gp-source-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'SourceMod', exact: true })).toBeVisible();
  await expect(page.getByText('AMX plugins', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Install', exact: true })).toBeDisabled();
  await page.getByText('Configuration files', { exact: true }).last().click();
  await page.getByRole('button', { name: 'metaplugins.ini' }).click();
  await expect(page.getByLabel('Opened file')).toHaveText(
    '/serverfiles/game/csgo/addons/metamod/metaplugins.ini'
  );
});
test('running server cannot install frameworks', async ({ page }) => {
  await mock(page, 'cs2', false);
  await page.goto('/test/source-frameworks.fixture.html');
  await page.getByRole('button', { name: 'Addons', exact: true }).click();
  await expect(page.getByText('Stop the server to change frameworks.')).toBeVisible();
  for (const button of await page.locator('.gp-source-card footer button').all())
    await expect(button).toBeDisabled();
});
