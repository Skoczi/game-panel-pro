import { test, expect } from '@playwright/test';

test('legacy browser credentials are erased, not accepted as new sessions', async ({ page, context }) => {
  await page.goto('/test/host-ip.fixture.html');
  await context.addCookies([{ name: 'auth_token', value: 'legacy-token', url: 'http://127.0.0.1:4178' }]);
  const result = await page.evaluate(async () => {
    localStorage.setItem('auth_token', 'legacy-token');
    // @ts-expect-error Browser module URL.
    const runtime = await import('/utils/api/runtime.ts');
    return { token: runtime.getStoredToken(), cookie: document.cookie, stored: localStorage.getItem('auth_token') };
  });
  expect(result).toEqual({ token: null, cookie: '', stored: null });
});

test('access tokens stay in memory and logout failure is not falsely reported as revoked', async ({ page, context }) => {
  await page.goto('/test/host-ip.fixture.html');
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser module URL.
    const { apiClient } = await import('/utils/api.ts');
    apiClient.setAuthToken('new-token');
    let failed = false;
    try { await apiClient.logout(); } catch { failed = true; }
    return { failed, token: apiClient.getAuthToken(), stored: localStorage.getItem('auth_token'), cookie: document.cookie };
  });
  expect(result).toEqual({ failed: true, token: 'new-token', stored: null, cookie: '' });
  await page.route('**/api/auth/logout', route => route.fulfill({ json: { success: true } }));
  const after = await page.evaluate(async () => {
    // @ts-expect-error Browser module URL.
    const { apiClient } = await import('/utils/api.ts');
    await apiClient.logout(); return apiClient.getAuthToken();
  });
  expect(after).toBeNull();
  expect((await context.cookies()).some(cookie => cookie.name === 'auth_token')).toBe(false);
});

test('session bootstrap stores no persistent bearer and a late refresh cannot undo logout', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { token: 'refreshed-token' } }));
  await page.goto('/test/host-ip.fixture.html');
  expect(await page.evaluate(async () => {
    // @ts-expect-error Browser module URL.
    const { apiClient } = await import('/utils/api.ts');
    const token = await apiClient.restoreSession();
    return { token, stored: localStorage.getItem('auth_token') };
  })).toEqual({ token: 'refreshed-token', stored: null });
  expect(await page.evaluate(async () => {
    // @ts-expect-error Browser module URL.
    const { apiClient } = await import('/utils/api.ts');
    const refreshing = apiClient.restoreSession(); apiClient.clearAuth(); await refreshing;
    return apiClient.getAuthToken();
  })).toBeNull();
});
