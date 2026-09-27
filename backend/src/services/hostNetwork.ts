import http from 'node:http';
import { globalSettings } from './globalSettings.js';
import { enterPortAllocationMutation } from './portAllocationLock.js';

type Entry = { name: string; parent: string; ip: string; mac: string };
type Snapshot = { available: boolean; revision: number; entries: Entry[]; [key: string]: unknown };
const fail = (message: string, statusCode = 503) => Object.assign(new Error(message), { statusCode });
export function hostNetworkRequest<T = Snapshot>(method = 'GET', pathname = '/network', body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ socketPath: '/run/eserv-network/control.sock', path: pathname, method,
      headers: { 'Content-Type': 'application/json', ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) } }, res => {
      let data = ''; res.on('data', chunk => { data += chunk; if (data.length > 262144) req.destroy(fail('Host network response too large')); });
      res.on('error', reject); res.on('end', () => {
        try { const value = JSON.parse(data); if (res.statusCode !== 200) return reject(fail(value.error || 'Host network operation rejected', res.statusCode)); resolve(value); }
        catch { reject(fail('Invalid host network response')); }
      });
    });
    req.setTimeout(30000, () => req.destroy(fail('Host network request timed out. Reload to check whether it was saved.')));
    req.on('error', () => reject(fail('Host network manager is unavailable. Configuration already saved on the machine still applies at boot.'))); req.end(payload);
  });
}
export async function hostNetworkSnapshot() {
  try { return await hostNetworkRequest(); }
  catch (error) { return { available: false, reason: (error as Error).message, entries: [], discovered: [], parents: [] }; }
}
export async function changeHostNetwork(body: any, preview = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['entries', 'revision'].includes(k)) || !Array.isArray(body.entries) || !Number.isSafeInteger(body.revision)) throw fail('Expected network entries and revision.', 400);
  const release = enterPortAllocationMutation();
  try {
    const previous = await hostNetworkRequest();
    const next = new Set(body.entries.map((e: any) => e?.ip));
    const removed = previous.entries.filter(e => !next.has(e.ip));
    const settings = globalSettings();
    const assignments = await settings.assignments();
    for (const e of removed) {
      const assigned = assignments.find(a => a.ip === e.ip);
      if (assigned) throw fail(`${e.ip} is assigned to ${assigned.serverName}. Change its binding first.`, 409);
      if (settings.snapshot().network.allocations.some(a => a.ip === e.ip)) throw fail(`${e.ip} is still in IP allocations. Remove its unused allocation first.`, 409);
    }
    return await hostNetworkRequest(preview ? 'POST' : 'PUT', preview ? '/network/preview' : '/network', body);
  } finally { release(); }
}
