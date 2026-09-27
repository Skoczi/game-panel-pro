import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import https from 'node:https';
import * as crypto from 'node:crypto';
import { once } from 'node:events';
import { loadWithMocks } from './loadWithMocks.js';
import { RequestVerifier, signNodeRequest } from '../src/nodes/protocol.js';

test('agent allocation authenticates to the panel and rejects outages or a mismatched identity', async () => {
    const nodeId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', key = 'test-key';
    let mode = 'ok';
    const verifier = new RequestVerifier();
    const server = http.createServer((req, res) => {
        const claim = verifier.verify(String(req.headers['x-gamepanel-node-auth']), key, nodeId, 'POST', req.url!);
        assert.equal(claim.actor, 'server-identity');
        assert.match(req.url!, new RegExp(`^/api/nodes/${nodeId}/server-identities/[a-f0-9]{32}$`));
        res.statusCode = mode === 'offline' ? 503 : 200;
        res.end(JSON.stringify({ id: 101, runtimeKey: mode === 'mismatch' ? 'wrong' : req.url!.split('/').pop() }));
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const mod = loadWithMocks('../src/services/serverIdentity.ts', {
        'node:crypto': crypto, 'node:http': http, 'node:https': https,
        '../agent/identity.js': { isAgent: () => true, agentIdentity: () => ({ nodeId, key, panel: `http://127.0.0.1:${(server.address() as any).port}` }) },
        '../fleet/store.js': { FleetStore: class { constructor() { throw new Error('No local fallback'); } } },
        '../nodes/protocol.js': { signNodeRequest }, '../nodes/transport.js': { nodeTls: () => ({}) },
    }, { setTimeout, clearTimeout, URL });
    try {
        assert.equal((await mod.allocateServerIdentity({})).id, 101);
        mode = 'offline'; await assert.rejects(mod.allocateServerIdentity({}), /unavailable/);
        mode = 'mismatch'; await assert.rejects(mod.allocateServerIdentity({}), /Invalid central/);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('repository inserts the allocated number and UUID and never inserts when allocation fails', async () => {
    let offline = false;
    const writes: any[] = [];
    const mod = loadWithMocks('../src/database/repositories/gameServerRepository.ts', {
        '../../services/serverIdentity.js': { allocateServerIdentity: async () => {
            if (offline) throw new Error('Panel offline');
            return { id: 105, runtimeKey: 'c'.repeat(32) };
        } },
        '../../realtime/bus.js': {}, '../../utils/time.js': { nowIso: () => 'now' },
        './base.js': { BaseRepository: class { async ensureDb() { return { run: async (sql: string, args: unknown[]) => {
            writes.push({ sql, args }); return { lastID: 105 };
        } }; } } },
    });
    const repo = new mod.GameServerRepository();
    assert.equal(await repo.create({ name: 'Arena', ports: {}, mounts: [] }), 105);
    assert.match(writes[0].sql, /\(id, runtime_uuid, name/);
    assert.deepEqual(Array.from(writes[0].args.slice(0, 2)), [105, 'c'.repeat(32)]);
    offline = true; await assert.rejects(repo.create({}), /Panel offline/);
    assert.equal(writes.length, 1);
});
