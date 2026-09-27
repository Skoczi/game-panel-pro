// Game Panel PRO documentation captures: actual UI, synthetic non-secret data.
// Start Vite on 127.0.0.1:4178 before running this script from any directory.
import { chromium, expect } from '../frontend/node_modules/@playwright/test/index.mjs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  const nodeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const names = ['Dust II Classic', 'Community Arena', 'Source Scrims', 'CS2 Practice'];
  const catalog = ['cs16', 'cs16', 'css', 'cs2'];
  const servers = names.map((name, i) => ({
    id: `bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb${i}`, displayId: `SRV-${101+i}`,
    name, provider: 'native', catalogId: catalog[i], status: i === 3 ? 'stopped' : 'running', available: true,
    observedAt: Date.now(), node: { id: nodeId, name: 'EU West', location: 'Europe' },
    ports: { udp: [{ hostIp: '192.0.2.10', host: 27015 + i }] },
  }));
  await page.addInitScript(() => {
    sessionStorage.setItem('test-admin', '1');
    localStorage.setItem('theme', 'dark');
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    let data = {};
    if (path === '/api/branding') data = { siteName: 'Game Panel PRO', subtitle: '', showFollowUs: false, showTrustpilot: false };
    else if (path === '/api/nodes') data = { nodes: [{ id: nodeId, name: 'EU West', location: 'Europe', status: 'online', enabled: true, agent_version: '2.1.0', last_seen: Date.now() }], local: { id: 'local', name: 'Control plane', location: 'Europe', status: 'online', agent_version: '2.1.0' } };
    else if (path === '/api/fleet') data = { servers };
    else if (/\/api\/fleet\/[^/]+\/context$/.test(path)) {
      const s = servers.find(s => path.includes(s.id));
      data = { ...s, nodeId, runtimeId: Number(s.displayId.slice(4)), permissions: ['*'], placementRevision: 1 };
    } else if (/\/api\/servers\/\d+/.test(path)) {
      const id = Number(path.match(/\/servers\/(\d+)/)[1]);
      const i = Math.max(0, id - 101); const s = servers[i] || servers[0];
      const resources = { cpuCores: .24 + i*.06, cpuLimitCores: 2, cpuLimitPercent: 12+i*3, memoryBytes: (320+i*80)*1024**2, memoryLimitBytes: 2048*1024**2, memoryLimitPercent: 16+i*4, diskBytes: 1024**3 };
      data = path.endsWith('/metrics') ? { metrics: [{ timestamp: new Date().toISOString(), resources, cpuUsage: 12, memoryUsage: 16 }] } : { server: { ...s, id, resources, ports: s.ports, providerMetadata: { template: { document: { schemaVersion: 2 } } } } };
    }
    return route.fulfill({ json: data });
  });
  await page.goto('http://127.0.0.1:4178/test/fleet.fixture.html');
  await expect(page.getByRole('heading', { name: 'Dust II Classic', exact: true })).toBeVisible();
  await expect(page.getByText('192.0.2.10:27015', { exact: true })).toBeVisible();
  await expect(page.getByText('0.24 / 2.00 vCPU', { exact: true })).toBeVisible();
  await page.screenshot({ path: output + 'fleet-cards.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await page.screenshot({ path: output + 'fleet-dark.png', fullPage: true, animations: 'disabled' });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await page.screenshot({ path: output + 'fleet-light.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: output + 'fleet-mobile.png', fullPage: true, animations: 'disabled' });
  console.log('Documentation screenshots saved. All data is synthetic.');
} finally { await browser.close(); }
