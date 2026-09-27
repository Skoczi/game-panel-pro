import { test, expect } from '@playwright/test';
const first = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const second = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
test('user permissions list every node and save by fleet identity, never by runtime ID', async ({ page }) => {
 const writes: Array<{ path: string; body: any }> = [];
 await page.route('**/api/users**', route => route.fulfill({ json: { users: [{ id: 2, username: 'Player', isRoot: false, isEnabled: true, globalPermissions: [] }] } }));
 await page.route('**/api/fleet', route => route.fulfill({ json: { servers: [
  { id: first, name: 'Arena', provider: 'native', node: { name: 'WAW1' } },
  { id: second, name: 'Arena', provider: 'native', node: { name: 'WAW2' } },
 ] } }));
 await page.route('**/api/fleet/*/members**', async route => {
  if (route.request().method() === 'PUT') { writes.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() }); return route.fulfill({ json: { ok: true } }); }
  return route.fulfill({ json: { members: [] } });
 });
 await page.route('**/api/servers/**', () => { throw new Error('User grants must use fleet identity'); });
 await page.goto('/test/user-fleet.fixture.html');
 await page.getByRole('button', { name: 'Edit', exact: true }).click();
 const choose = page.getByRole('combobox', { name: 'Select server', exact: true });
 await choose.click();
 await expect(page.getByRole('option', { name: 'Arena · WAW1' })).toBeVisible();
 await page.getByRole('option', { name: 'Arena · WAW2' }).click();
 await expect(page.getByText('Loading permissions…')).toHaveCount(0);
 await page.getByRole('button', { name: 'Server administrator', exact: true }).click();
 await page.getByRole('button', { name: 'Save changes', exact: true }).click();
 await expect.poll(() => writes.length).toBe(1);
 expect(writes[0].path).toBe(`/api/fleet/${second}/members/2`);
 expect(writes[0].body.permissions).toContain('server.power');
 expect(writes[0].body.permissions).toEqual(expect.arrayContaining(['fs.read', 'fs.write', 'container.logs.read', 'server.command.send']));
 for (const denied of ['server.edit', 'server.env', 'container.terminal', 'server.delete', '*']) expect(writes[0].body.permissions).not.toContain(denied);
});

test('failed permission reads cannot overwrite grants with an empty selection', async ({ page }) => {
 let writes = 0;
 await page.route('**/api/users**', route => { if (route.request().method() !== 'GET') writes++; return route.fulfill({ json: { users: [{ id: 2, username: 'Player', isRoot: false, isEnabled: true, globalPermissions: [] }] } }); });
 await page.route('**/api/fleet', route => route.fulfill({ json: { servers: [{ id: first, name: 'Arena', provider: 'native', node: { name: 'WAW1' } }] } }));
 await page.route('**/api/fleet/*/members', route => route.fulfill({ status: 503, json: { error: 'Grant storage unavailable' } }));
 await page.goto('/test/user-fleet.fixture.html');
 await page.getByRole('button', { name: 'Edit', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('Grant storage unavailable');
 await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
 expect(writes).toBe(0);
});


test('account level grants Operator globally while keeping Super Admin protected', async ({ page }) => {
 const owner = { id: 1, username: 'Owner', isRoot: true, isEnabled: true, globalPermissions: ['*'] };
 const player = { id: 2, username: 'Player', isRoot: false, isEnabled: true, globalPermissions: [] as string[] };
 let saved: any;
 await page.route('**/api/users**', route => {
  if (route.request().method() === 'PATCH') { saved = route.request().postDataJSON(); player.globalPermissions = saved.globalPermissions; }
  return route.fulfill({ json: { users: [owner, player], success: true } });
 });
 await page.route('**/api/fleet', route => route.fulfill({ json: { servers: [{ id: first, name: 'Arena', provider: 'native', node: { name: 'WAW1' } }] } }));
 await page.route('**/api/fleet/*/members', route => route.fulfill({ json: { members: [] } }));
 await page.goto('/test/user-fleet.fixture.html');
 await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(1);
 await page.getByRole('button', { name: 'Edit', exact: true }).click();
 await page.getByRole('group', { name: 'Account level' }).getByRole('button', { name: 'Operator', exact: true }).click();
 await expect(page.getByText('Operator has access to all servers', { exact: false })).toBeVisible();
 if (process.env.PLAYWRIGHT_SCREENSHOTS) {
  await page.screenshot({ path: '../docs/pro/visual-premium-2026-09-26/account-levels-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '../docs/pro/visual-premium-2026-09-26/account-levels-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }
 await page.getByRole('button', { name: 'Save changes', exact: true }).click();
 await expect.poll(() => saved?.globalPermissions).toEqual(['panel.operator']);
 await page.getByRole('button', { name: 'Edit', exact: true }).click();
 await page.getByRole('group', { name: 'Account level' }).getByRole('button', { name: 'User', exact: true }).click();
 await page.getByRole('button', { name: 'Save changes', exact: true }).click();
 await expect.poll(() => saved?.globalPermissions).toEqual([]);
});

test('creating a user continues to account level and server assignment without automatic grants', async ({ page }) => {
 let users: any[] = []; let grants = 0;
 await page.route('**/api/users**', route => route.fulfill({ json: { users } }));
 await page.route('**/api/auth/register', route => {
  const user = { id: 3, username: 'NewUser', isRoot: false, isEnabled: true, globalPermissions: [] };
  users = [user]; return route.fulfill({ json: { user } });
 });
 await page.route('**/api/fleet', route => route.fulfill({ json: { servers: [{ id: first, name: 'Arena', provider: 'native', node: { name: 'WAW1' } }] } }));
 await page.route('**/api/fleet/*/members**', route => { if (route.request().method() !== 'GET') grants++; return route.fulfill({ json: { members: [] } }); });
 await page.goto('/test/user-fleet.fixture.html');
 await page.getByRole('button', { name: 'Create user', exact: true }).click();
 await page.getByPlaceholder('Username', { exact: true }).fill('NewUser');
 await page.getByPlaceholder('Password', { exact: true }).fill('test-password');
 await page.getByPlaceholder('Confirm password', { exact: true }).fill('test-password');
 await page.getByRole('dialog').getByRole('button', { name: 'Create user', exact: true }).click();
 await expect(page.getByRole('group', { name: 'Account level' })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Server administrator', exact: true })).toBeVisible();
 expect(grants).toBe(0);
});
