import { test, expect } from '@playwright/test';

test('migrates a legacy cookie without sending it on subsequent requests', async ({ page, context }) => {
  await page.goto('/test/host-ip.fixture.html');
  await context.addCookies([{ name: 'auth_token', value: 'legacy-fixture-token', url: 'http://127.0.0.1:4178' }]);
  const result = await page.evaluate(async () => {
    localStorage.removeItem('auth_token');
    // @ts-expect-error Vite resolves the browser module URL.
    const runtime = await import('/utils/api/runtime.ts');
    return { token: runtime.getStoredToken(), cookie: document.cookie, stored: localStorage.getItem('auth_token') };
  });
  expect(result.token).toBe('legacy-fixture-token');
  expect(result.stored).toBe('legacy-fixture-token');
  expect(result.cookie).not.toContain('auth_token=');
  expect((await context.cookies()).some(cookie => cookie.name === 'auth_token')).toBe(false);
});

test('login storage does not recreate the legacy cookie and clearAuth removes credentials', async ({ page, context }) => {
  await page.goto('/test/host-ip.fixture.html');
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite resolves the browser module URL.
    const { apiClient } = await import('/utils/api.ts');
    apiClient.setAuthToken('new-fixture-token');
    const cookie = document.cookie;
    const token = apiClient.getAuthToken();
    apiClient.clearAuth();
    return { cookie, token, after: apiClient.getAuthToken(), stored: localStorage.getItem('auth_token') };
  });
  expect(result.cookie).not.toContain('auth_token=');
  expect(result.token).toBe('new-fixture-token');
  expect(result.after).toBeNull();
  expect(result.stored).toBeNull();
  expect((await context.cookies()).some(cookie => cookie.name === 'auth_token')).toBe(false);
});
