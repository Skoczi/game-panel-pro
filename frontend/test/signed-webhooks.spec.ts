import { test, expect } from '@playwright/test';
test('signed webhook is separate from Discord and shows the signing secret only after saving', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let saved = false, tests = 0;
    const config = { revision: 0, url: '', enabled: false, secretConfigured: false, recent: [] };
    await page.route('**/api/signed-webhooks**', async route => {
        if (route.request().method() === 'PUT') { saved = true; expect(route.request().postDataJSON()).toMatchObject({ enabled: true, url: 'https://example.com/events', revision: 0 }); return route.fulfill({ json: { ...config, revision: 1, enabled: true, url: 'https://example.com/events', secret: 'once-only-fixture' } }); }
        if (route.request().method() === 'POST') { tests++; return route.fulfill({ status: 202, json: { queued: true } }); }
        return route.fulfill({ json: config });
    });
    await page.goto('/test/signed-webhooks.fixture.html');
    await expect(page.getByRole('button', { name: 'Send signed test' })).toBeDisabled();
    await page.getByRole('switch', { name: 'Enable signed webhook' }).check();
    await page.getByLabel('Signed webhook receiver URL').fill('https://example.com/events');
    expect(saved).toBe(false);
    await page.getByRole('button', { name: 'Save signed webhook' }).click();
    await expect(page.getByLabel('New webhook signing secret')).toHaveValue('once-only-fixture');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('once-only-fixture');
    await page.getByRole('button', { name: 'I have saved the signing secret' }).click();
    await expect(page.getByLabel('New webhook signing secret')).toHaveCount(0);
    await page.getByRole('button', { name: 'Send signed test' }).click();
    await expect(page.getByRole('status')).toContainText('Test queued'); expect(tests).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
