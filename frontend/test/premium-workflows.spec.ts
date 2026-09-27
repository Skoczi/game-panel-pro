import { test, expect } from '@playwright/test';

for (const theme of ['dark', 'light'])
  for (const width of [390, 1440, 1920]) {
    test(`workflow visual acceptance ${theme} ${width}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
      await page.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        if (path.includes('clone'))
          return route.fulfill({
            json: {
              name: 'Counter-Strike • Warsaw',
              stopped: false,
              fingerprint: 'v1',
              ports: {
                tcp: [],
                udp: [{ host: 27050, container: 27015, hostIp: '51.83.150.145', label: 'Game' }],
              },
              targets: [{ id: 'fr1', name: 'FR1', location: 'France' }],
              changes: ['Verified offline backup', 'Unique identity and public ports'],
            },
          });
        if (path.endsWith('/security')) return route.fulfill({ json: { mfaEnabled: false } });
        if (path.endsWith('/sessions'))
          return route.fulfill({
            json: {
              sessions: [
                {
                  id: 'current',
                  current: true,
                  label:
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36',
                  createdAt: 1790438400000,
                  expiresAt: 1790481600000,
                },
              ],
            },
          });
        return route.fulfill({
          json: {
            content: 'de_dust2\nde_inferno\ncs_office\n',
            available: ['de_dust2', 'de_inferno', 'cs_office', 'de_nuke', 'de_train'],
            path: '/serverfiles/cstrike/mapcycle.txt',
            root: 'data',
            version: 'v1',
            history: [],
          },
        });
      });
      for (const fixture of ['rehlds', 'clone', 'account-security']) {
        await page.goto(`/test/${fixture}.fixture.html`);
        await expect(page.locator('.gp-workflow').first()).toBeVisible();
        if (fixture === 'rehlds')
          await expect(
            page.getByRole('region', { name: 'Map rotation', exact: true })
          ).toBeVisible();
        if (fixture === 'clone')
          await expect(page.getByRole('complementary', { name: 'Clone summary' })).toBeVisible();
        if (fixture === 'account-security')
          await expect(page.getByText('Chrome · Windows')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
        });
        await page.screenshot({
          animations: 'disabled',
          path: `test-results/premium-${fixture}-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    });
  }

test('map library edits a draft with keyboard and preserves snapshot review', async ({ page }) => {
  let submitted: any;
  await page.route('**/api/**', (route) => {
    if (!new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue();
    if (route.request().method() === 'PUT') {
      submitted = route.request().postDataJSON();
      return route.fulfill({ status: 409, json: { error: 'Configuration changed' } });
    }
    return route.fulfill({
      json: {
        content: 'de_dust2\n',
        available: ['de_dust2', 'de_inferno'],
        version: 'v1',
        path: '/mapcycle.txt',
        root: 'data',
        history: [],
      },
    });
  });
  await page.goto('/test/rehlds.fixture.html');
  await page.getByRole('button', { name: 'Add de_inferno', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Move de_inferno up 2', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  expect(submitted).toBeUndefined();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('Configuration changed');
  expect(submitted).toEqual({ content: 'de_inferno\nde_dust2\n', version: 'v1' });
});

test('plugin toggles and Steam administrators preserve other configuration lines', async ({
  page,
}) => {
  const requests: any[] = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (route.request().method() === 'PUT') {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 409, json: { error: 'Review fixture keeps draft' } });
    }
    const content = path.endsWith('/plugins')
      ? '; keep this comment\n; admin.amxx debug\nother.amxx\n'
      : path.endsWith('/admins')
        ? '; keep legacy entries\n"name" "password" "b" "a"\n'
        : '';
    return route.fulfill({
      json: {
        content,
        available: [],
        version: 'v1',
        path: '/config.ini',
        root: 'data',
        history: [],
      },
    });
  });
  await page.goto('/test/rehlds.fixture.html');
  await page.getByRole('button', { name: 'AMXX plugins', exact: true }).click();
  await page.getByRole('checkbox', { name: /admin.amxx/ }).check();
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(requests[0].content).toBe('; keep this comment\nadmin.amxx debug\nother.amxx\n');
  await page.getByRole('button', { name: 'Administrators', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Steam ID', { exact: true }).fill('STEAM_0:1:123456');
  await page.getByRole('button', { name: 'Add administrator to draft' }).click();
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].content).toBe(
    '; keep legacy entries\n"name" "password" "b" "a"\n"STEAM_0:1:123456" "" "bcdefiju" "ce"\n'
  );
});
