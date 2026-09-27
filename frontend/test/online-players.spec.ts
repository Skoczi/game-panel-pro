import { test, expect, type Page } from '@playwright/test';
const nodeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const serverId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

async function setup(page: Page, options: { permission?: boolean; stale?: boolean; stopped?: boolean } = {}) {
  let permission = options.permission !== false;
  let response: any = { state:'online', checkedAt:new Date().toISOString(), players:[
    {name:'Skoczi',score:12,connectedSeconds:3665},
    {name:'<img src=x onerror=alert(1)>',score:-1,connectedSeconds:65},
  ] };
  let requests = 0;
  await page.route('**/api/branding', r => r.fulfill({json:{siteName:'Game Panel PRO'}}));
  await page.route('**/api/system/update/check', r => r.fulfill({json:{}}));
  await page.route('**/api/fleet', r => r.fulfill({json:{servers:[{
    id:serverId,displayId:'SRV-100',name:'Dust II',provider:'external',status:options.stopped ? 'stopped' : 'running',available:true,observedAt:Date.now(),node:{name:'EU West',location:'Europe'},
  }]}}));
  await page.route(`**/api/fleet/${serverId}/context`, r => r.fulfill({json:{id:serverId,nodeId,runtimeId:100,name:'Dust II',nodeName:'EU West',location:'Europe',placementRevision:1,permissions:permission?['server.players.read']:[]}}));
  await page.route(`**/api/nodes/${nodeId}/runtime/api/servers/100`, r => r.fulfill({json:{server:{id:100,name:'Dust II',status:options.stopped?'stopped':'running',provider:'external',monitoring:{
    enabled:true,state:'online',checkedAt:new Date(Date.now()-(options.stale?200000:0)).toISOString(),staleAfterSeconds:100,latencyMs:3,info:{name:'Dust II',map:'de_dust2',players:2,maxPlayers:32,bots:0},
  }}}}));
  await page.route('**/metrics?limit=1', r => r.fulfill({json:{metrics:[]}}));
  await page.route(`**/api/nodes/${nodeId}/runtime/api/servers/100/players`, r => {
    expect(r.request().headers()['x-gamepanel-server']).toBe(serverId);
    requests++; return r.fulfill({json:response});
  });
  return { requests:()=>requests, revoke:()=>{permission=false;}, respond:(value:any)=>{response=value;} };
}

for (const theme of ['light','dark']) test(`online players opens from cards and table in ${theme}`, async ({page}) => {
  await page.addInitScript(theme => localStorage.setItem('theme',theme),theme);
  await setup(page);
  await page.goto('/test/fleet.fixture.html');
  for (const view of ['cards','table']) {
    if (view==='table') await page.getByRole('button',{name:'List view',exact:true}).click();
    await page.getByRole('button',{name:'Online players for Dust II: 2 / 32'}).click();
    const dialog = page.getByRole('dialog',{name:'Online players'});
    await expect(dialog).toHaveCSS('background-color',theme==='dark'?'rgb(16, 28, 46)':'rgb(255, 255, 255)');
    await expect(dialog.getByText('Skoczi',{exact:true})).toBeVisible();
    await expect(dialog.getByText('1h 1m',{exact:true})).toBeVisible();
    await expect(dialog.getByText('<img src=x onerror=alert(1)>',{exact:true})).toBeVisible();
    await expect(dialog.locator('img')).toHaveCount(0);
    await dialog.getByRole('textbox',{name:'Search players'}).fill('skoc');
    await expect(dialog.locator('tbody tr')).toHaveCount(1);
    await page.screenshot({path:`/tmp/online-players-${theme}-${view}.png`,animations:'disabled'});
    await dialog.getByRole('button',{name:'Close online players'}).click();
    await expect(dialog).toHaveCount(0);
  }
});
test('mobile player dialog fits the viewport and remains keyboard dismissible', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(() => localStorage.setItem('theme','dark'));
  await setup(page); await page.goto('/test/fleet.fixture.html');
  await page.getByRole('button',{name:'Online players for Dust II: 2 / 32'}).click();
  const dialog = page.getByRole('dialog',{name:'Online players'});
  await expect(dialog.getByText('Skoczi',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const bounds=await dialog.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({path:'/tmp/online-players-mobile.png',animations:'disabled'});
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});
test('count remains visible without roster permission; stale/stopped data never appears live', async ({page}) => {
  const fixture=await setup(page,{permission:false}); await page.goto('/test/fleet.fixture.html');
  await expect(page.getByText('2 / 32',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Online players for/})).toHaveCount(0); expect(fixture.requests()).toBe(0);
  for (const state of [{stale:true},{stopped:true}]) {
    await setup(page,state); await page.reload();
    await expect(page.locator('.gp-players-count')).toHaveText('—');
    await expect(page.getByRole('button',{name:/Online players for/})).toHaveCount(0);
  }
});
test('revocation clears displayed names before any further node query', async ({page}) => {
  const fixture=await setup(page); await page.goto('/test/fleet.fixture.html');
  await page.getByRole('button',{name:'Online players for Dust II: 2 / 32'}).click();
  const dialog=page.getByRole('dialog',{name:'Online players'});
  await expect(dialog.getByText('Skoczi',{exact:true})).toBeVisible();
  fixture.revoke(); await dialog.getByRole('button',{name:'Refresh players'}).click();
  await expect(dialog.getByText('Player list unavailable.')).toBeVisible();
  await expect(dialog.getByText('Skoczi',{exact:true})).toHaveCount(0); expect(fixture.requests()).toBe(1);
});
test('empty and unavailable rosters are explicit and closing stops roster polling', async ({page}) => {
  await page.clock.install(); const fixture=await setup(page); await page.goto('/test/fleet.fixture.html');
  await page.getByRole('button',{name:'Online players for Dust II: 2 / 32'}).click();
  const dialog=page.getByRole('dialog',{name:'Online players'});
  await expect(dialog.getByText('Skoczi',{exact:true})).toBeVisible();
  fixture.respond({state:'online',checkedAt:new Date().toISOString(),players:[]});
  await dialog.getByRole('button',{name:'Refresh players'}).click();
  await expect(dialog.getByText('The game did not return player names.')).toBeVisible();
  fixture.respond({state:'unavailable',checkedAt:new Date().toISOString(),players:null});
  await dialog.getByRole('button',{name:'Refresh players'}).click();
  await expect(dialog.getByText('The game did not return a player list.')).toBeVisible();
  await dialog.getByRole('button',{name:'Close online players'}).click();
  const before=fixture.requests(); await page.clock.fastForward(20000); expect(fixture.requests()).toBe(before);
});
