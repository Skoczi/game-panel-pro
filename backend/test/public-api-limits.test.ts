import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { publicApi } from '../src/routes/publicApi.js';

test('invalid credentials and other tokens behind one proxy cannot consume a valid token budget', async () => {
  const app = express();
  app.use('/api/v1', publicApi({
    store: () => ({ authenticate: async (key: string) => key.endsWith('a') ? null : { id: key, ownerId: 1, scopes: ['servers.read'], serverIds: [] }, markUsed: async () => {} }) as any,
    owner: async () => ({ userId: 1, isRoot: false, enabled: true }), servers: async () => [], permissions: async () => [],
  }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1/servers`;
  const request = (char: string, spoof = '') => fetch(base, { headers: { authorization: 'Bearer gpp_' + char.repeat(43), 'X-Forwarded-For': spoof } });
  try {
    for (let i=0; i<240; i++) { const r = await request('a', '192.0.2.' + i); assert.equal(r.status, 401); await r.text(); }
    const limited = await request('a'); assert.equal(limited.status, 429); assert(Number(limited.headers.get('retry-after')) > 0); await limited.text();
    for (const char of ['b', 'c', 'd']) {
      for (let i=0; i<120; i++) { const r = await request(char); assert.equal(r.status, 200); await r.text(); }
      const r = await request(char); assert.equal(r.status, 429); await r.text();
    }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
