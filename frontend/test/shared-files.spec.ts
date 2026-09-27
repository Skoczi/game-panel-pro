import { test, expect } from '@playwright/test';
test('shared packages show version, capacity, bindings and mobile layout without wrapping the toolbar', async ({page}) => {
  await page.route('**/api/system/shared-files',r=>r.fulfill({json:{available:true,packages:[{id:'classic-offensive-1_0_2',name:'Classic Offensive',version:'1.0.2',bytes:13092195064,files:6436,sha256:'a'.repeat(64),servers:[{id:107,name:'Classic test'}]}],uploads:[]}}));
  await page.goto('/test/nodes.fixture.html');
  await page.getByRole('button',{name:'Node settings',exact:true}).first().click();
  await page.getByRole('button',{name:'Shared files',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Classic Offensive',exact:true})).toBeVisible();
  await expect(page.getByText('Read only',{exact:true})).toBeVisible();
  await expect(page.getByText('#107 Classic test')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Upload ZIP',exact:true}).click();
  await expect(page.getByLabel('Folder inside ZIP')).toHaveValue('.');
  await page.screenshot({path:'test-results/shared-files-mobile.png',fullPage:true});
});
