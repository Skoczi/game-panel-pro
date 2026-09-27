import { test, expect } from '@playwright/test';
import { compareFleetAddresses, defaultFleetLayout } from '../utils/fleetLayout';

test('fleet defaults to numeric IP and port order, with unknown addresses last', () => {
  expect(defaultFleetLayout().sort).toBe('address');
  const addresses = ['51.83.150.145:27056', undefined, '51.83.150.9:27099', '51.83.150.145:27052', '51.83.150.145:9999'];
  expect(addresses.sort(compareFleetAddresses)).toEqual(['51.83.150.9:27099', '51.83.150.145:9999', '51.83.150.145:27052', '51.83.150.145:27056', undefined]);
});

test('old empty default becomes IP:Port while an explicit sorting choice is preserved', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('gamepanel_fleet_layout_v1:2')) localStorage.setItem('gamepanel_fleet_layout_v1:2', JSON.stringify({ sort: 'custom', order: [] }));
  });
  await page.goto('/test/fleet.fixture.html');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('combobox', { name: 'Sort servers' })).toContainText('IP:Port');
  await page.getByRole('combobox', { name: 'Sort servers' }).click();
  await page.getByRole('option', { name: 'Name A–Z', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Sort servers' })).toContainText('Name A–Z');
  await page.reload();
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('combobox', { name: 'Sort servers' })).toContainText('Name A–Z');
});
