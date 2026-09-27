import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { loadWithMocks } from './loadWithMocks.js';
import { publicApi } from '../src/routes/publicApi.js';
import { ApiProvisionStore, apiFail, validateProvisionInput } from '../src/services/apiProvisioning.js';
import { ApiOperationStore } from '../src/services/apiOperations.js';
import { FleetStore } from '../src/fleet/store.js';
import { tokenAllows, API_SCOPES } from '../src/services/apiTokens.js';
import { steamId } from '../src/services/gameAdminEntries.js';

test('HTTP provisioning, accounts, memberships and game admins enforce scopes, replay and concurrency versions', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT); INSERT INTO users VALUES(1,'owner'),(2,'player');");
    const adapter = { exec: async (s: string) => db.exec(s), run: async (s: string,...v: any[]) => db.prepare(s).run(...v), get: async (s: string,...v: any[]) => db.prepare(s).get(...v), all: async (s: string,...v: any[]) => db.prepare(s).all(...v) } as any;
    const fleet = new FleetStore(adapter); await fleet.initialize();
    await fleet.observe('local', [{ id: 100, runtimeKey: 'a'.repeat(32), name: 'Test', provider: 'native', status: 'stopped' }]);
    const baseRow = (await fleet.list())[0];
    const ops = new ApiOperationStore(adapter); await ops.initialize();
    const provisions = new ApiProvisionStore(adapter); await provisions.initialize();
    const token: any = { id: 'token', ownerId: 1, scopes: [...API_SCOPES], serverIds: [baseRow.id], revokedAt: null, expiresAt: Date.now()+600000,
        provisioning: { nodeIds: ['local'], templateIds: ['cs16'], maxServers: 3, maxCpu: 2, maxMemoryMb: 2048 } };
    let root = true, enabled = true, grants = ['fs.read','fs.write','server.power'];
    let creates = 0, writes = 0, passwordsHashed = 0, memberPermission: string[] = [], currentVersion = '"'+'1'.repeat(64)+'"';
    const receipts = new Map<string, any>();
    const users: any[] = [{ id: 1, username: 'owner', is_root: 1, is_enabled: 1 }, { id: 2, username: 'player', is_root: 0, is_enabled: 1 }];
    const tokenStore: any = { authenticate: async () => enabled ? token : null, markUsed: async () => {}, attachServer: async (_id: string, id: string) => { if (!token.serverIds.includes(id)) token.serverIds.push(id); } };
    const extension = loadWithMocks('../src/routes/publicApiManagement.ts', {
        'node:crypto': { randomUUID }, '../database/init.js': { getDatabase: async () => adapter },
        '../database/index.js': { userRepository: { list: async () => users, findById: async (id: number) => users.find(u => u.id === id), findByUsername: async (name: string) => users.find(u => u.username.toLowerCase() === name.toLowerCase()), create: async (username: string, hash: string) => { assert.equal(hash, 'hashed'); users.push({ id: 3, username, is_root: 0, is_enabled: 1 }); return 3; } }, serverMemberRepository: { listByServer: async () => [], find: async () => false, create: async (_s: number,_u: number,p: string[]) => { memberPermission = p; }, delete: async () => { memberPermission = []; } } },
        '../fleet/control.js': { fleet: () => fleet, fleetPermissions: async () => grants }, '../nodes/control.js': { nodes: () => ({ list: async () => [] }) },
        '../templates/store.js': { TemplateStore: class { async list() { return [await this.get()]; } async get() { return { id: 'cs16', version: 1, hash: 'hash', status: 'published', document: { name: 'CS 1.6', runtime: { catalogId: 'cs16', architectures: ['x64'] }, lifecycle: {}, ports: [], variables: [{ key: 'PASSWORD', secret: true, default: 'must-not-leak' }] } }; } } },
        '../templates/tickets.js': { issueTemplateTicket: () => 'ticket' }, '../config.js': { getConfig: () => ({ jwtSecret: 'secret' }) },
        '../services/apiProvisioning.js': { apiFail, validateProvisionInput },
        '../services/apiProvisionRuntime.js': { provisionNative: async (body: any, _actor: string, plan: boolean) => { if (plan) return { startAfterInstall: false }; creates++; const v = { id: 100+creates, runtimeKey: String(creates).repeat(32), name: body.name, provider: 'native', status: 'creating', installation: { status: 'preparing_files', percent: 25 } }; receipts.set(body.operationId, v); return v; }, provisionReceipt: async (id: string) => receipts.get(id) || null },
        '../services/apiNodeRequest.js': {}, '../services/globalSettings.js': { globalSettings: () => ({ snapshot: () => ({ network: { allocations: [] } }) }) },
        '../services/apiTokens.js': { tokenAllows }, '../utils/auth.js': { hashPassword: async () => { passwordsHashed++; return 'hashed'; } },
        '../services/rehldsContent.js': { readGameAdmins: async () => ({ version: currentVersion, entries: [] }), writeGameAdmin: async (_id: number,b: any) => { if (b.version !== currentVersion) apiFail(409,'File changed'); writes++; currentVersion = '"'+'2'.repeat(64)+'"'; return { version: currentVersion, entries: [] }; } },
        '../services/nativeOperationLock.js': { enterServerMutation: () => () => {} }, '../services/gameAdminEntries.js': { steamId },
    }, { console });
    const app = express(); app.use(express.json());
    app.use('/api/v1', publicApi({ store: () => tokenStore, owner: async () => ({ userId: 1, isRoot: root, enabled }), servers: () => fleet.list(), permissions: async () => grants,
        extension: (router: any) => extension.registerPublicManagement(router, { tokens: () => tokenStore, provisions: () => provisions, operations: () => ops }) }));
    const server = app.listen(0,'127.0.0.1'); await new Promise<void>(r => server.once('listening',r));
    const call = (path: string, method = 'GET', body?: any, headers: any = {}) => fetch(`http://127.0.0.1:${(server.address() as any).port}/api/v1${path}`, { method, headers: { authorization: 'Bearer gpp_'+'a'.repeat(43), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const input = { nodeId: 'local', templateId: 'cs16', templateVersion: 1, name: 'DD2', bindings: [], resourceLimits: { cpu: 1, memoryMb: 1024 } };
    try {
        const templates = await (await call('/templates')).json(); assert(!JSON.stringify(templates).includes('must-not-leak'));
        root = false; for (const path of ['/templates','/nodes','/users', '/servers/'+baseRow.id+'/members']) assert.equal((await call(path)).status,403); root = true;
        assert.equal((await call('/servers/plan','POST',input)).status,200); assert.equal(creates,0);
        assert.equal((await call('/servers','POST',input)).status,400);
        const h = { 'idempotency-key': 'create_dd2_123456789' };
        const first = await call('/servers','POST',input,h); assert.equal(first.status,202); const op = (await first.json()).data;
        const replay = await call('/servers','POST',input,h); assert.equal(replay.headers.get('idempotency-replayed'),'true'); assert.equal(creates,1);
        assert.equal((await fleet.get(baseRow.id))!.missing,0, 'partial registration must not remove other servers');
        assert.equal((await call('/servers','POST',{ ...input, name: 'Different' },h)).status,409);
        assert.equal((await (await call('/operations/'+op.id)).json()).data.percent,25);
        assert.equal((await (await call('/operations')).json()).data.length,1);
        assert.equal((await call('/users','POST',{ username:'newuser',password:'strongPassword123',role:'operator' })).status,400);
        assert.equal((await call('/users','POST',{ username:'newuser',password:'strongPassword123' })).status,201);
        assert.equal((await call('/users','POST',{ username:'newuser',password:'strongPassword123' })).status,409); assert.equal(passwordsHashed,1);
        assert.equal((await call('/servers/'+baseRow.id+'/members/1','DELETE')).status,403);
        assert.equal((await call('/servers/'+baseRow.id+'/members/2','PUT',{ preset:'server-admin' })).status,200);
        assert(memberPermission.includes('fs.write')); for (const p of ['server.edit','server.env','container.terminal']) assert(!memberPermission.includes(p));
        const admins = await call('/servers/'+baseRow.id+'/game-admins'); const etag = admins.headers.get('etag')!;
        assert.equal(etag,currentVersion);
        assert.equal((await call('/servers/'+baseRow.id+'/game-admins/STEAM_0:1:123','PUT',{flags:'abc'})).status,428);
        assert.equal((await call('/servers/'+baseRow.id+'/game-admins/STEAM_0:1:123','PUT',{flags:'abc'},{'if-match':etag})).status,200);
        assert.equal((await call('/servers/'+baseRow.id+'/game-admins/STEAM_0:1:123','DELETE',undefined,{'if-match':etag})).status,409); assert.equal(writes,1);
        grants = ['fs.read']; assert.equal((await call('/servers/'+baseRow.id+'/game-admins/STEAM_0:1:123','PUT',{flags:'abc'},{'if-match':currentVersion})).status,404);
        enabled = false; assert.equal((await call('/templates')).status,401);
    } finally { await new Promise<void>(r => server.close(() => r())); db.close(); }
});
