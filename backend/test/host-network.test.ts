import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { loadWithMocks } from './loadWithMocks.js';

function fixture(allocated = false, assigned = false) {
  const requests: any[] = []; let locked = false;
  const service = loadWithMocks('../src/services/hostNetwork.ts', {
    'node:http': { request: (options: any, callback: any) => {
      const req: any = new EventEmitter(); req.setTimeout = () => req; req.end = (body: string) => {
        requests.push({ ...options, body: body ? JSON.parse(body) : undefined });
        queueMicrotask(() => { const res: any = new EventEmitter(); res.statusCode = 200; callback(res); res.emit('data', JSON.stringify({ available: true, revision: 1, entries: [{ name: 'macvlan5', ip: '51.83.150.145' }] })); res.emit('end'); });
      }; return req;
    } },
    './globalSettings.js': { globalSettings: () => ({ snapshot: () => ({ network: { allocations: allocated ? [{ ip: '51.83.150.145' }] : [] } }), assignments: async () => assigned ? [{ ip: '51.83.150.145', serverName: 'Stopped game' }] : [] }) },
    './portAllocationLock.js': { enterPortAllocationMutation: () => { assert.equal(locked, false); locked = true; return () => { locked = false; }; } },
  }, { Buffer });
  return { service, requests, locked: () => locked };
}
test('host network removal refuses saved allocations and stopped server assignments before host mutation', async () => {
  for (const [allocated, assigned] of [[true, false], [false, true]]) {
    const f = fixture(allocated, assigned);
    await assert.rejects(f.service.changeHostNetwork({ revision: 1, entries: [] }), { statusCode: 409 });
    assert.equal(f.requests.length, 1); assert.equal(f.requests[0].method, 'GET'); assert.equal(f.locked(), false);
  }
});
test('network preview and apply use a fixed private socket, preserve revision and release allocation lock', async () => {
  const f = fixture(); const body = { revision: 1, entries: [] };
  await f.service.changeHostNetwork(body, true);
  assert.equal(f.requests.at(-1).path, '/network/preview'); assert.equal(f.requests.at(-1).method, 'POST');
  await f.service.changeHostNetwork(body);
  assert.equal(f.requests.at(-1).method, 'PUT'); assert.equal(f.requests.at(-1).socketPath, '/run/eserv-network/control.sock');
  assert.equal(JSON.stringify(f.requests.at(-1).body), JSON.stringify(body)); assert.equal(f.locked(), false);
});
test('host network rejects unknown top-level input before reaching privileged helper', async () => {
  const f = fixture();
  await assert.rejects(f.service.changeHostNetwork({ revision: 1, entries: [], command: 'reboot' }), { statusCode: 400 });
  assert.equal(f.requests.length, 0);
});
