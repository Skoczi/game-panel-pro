import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ApiTokenStore, tokenAllows } from '../src/services/apiTokens.js';

const server = '11111111-1111-4111-8111-111111111111';
async function fixture() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2)');
    const adapter = {
        exec: async (sql: string) => db.exec(sql),
        run: async (sql: string, ...params: any[]) => db.prepare(sql).run(...params),
        get: async (sql: string, ...params: any[]) => db.prepare(sql).get(...params),
        all: async (sql: string, ...params: any[]) => db.prepare(sql).all(...params),
    };
    let now = 1000000;
    const store = new ApiTokenStore(adapter as any, () => now);
    await store.initialize();
    const input = { name: 'Nightly backup', scopes: ['backups.create'] as const, serverIds: [server], expiresAt: now + 1000 };
    return { db, store, input: { ...input, scopes: [...input.scopes] }, advance: () => { now += 1000; } };
}

test('API secrets are issued once, hashed in storage, owner-isolated and immediately revocable', async () => {
    const { db, store, input } = await fixture();
    try {
        const { token, secret } = await store.create(1, input);
        assert.equal(secret.length, 47);
        assert(!JSON.stringify(db.prepare('SELECT * FROM api_tokens').all()).includes(secret));
        assert(!JSON.stringify(await store.list(1)).includes('secret'));
        assert.deepEqual(await store.list(2), []);
        assert.equal((await store.authenticate(secret))?.id, token.id);
        assert.equal(await store.authenticate(`${secret.slice(0, -1)}!`), null);
        assert.equal(await store.revoke(2, token.id), false);
        assert(await store.authenticate(secret));
        await store.markUsed(token.id);
        assert.equal((await store.list(1))[0].lastUsedAt, 1000000);
        assert.equal(await store.revoke(1, token.id), true);
        assert.equal(await store.authenticate(secret), null);
        assert.equal(await store.revoke(1, token.id), true);
    } finally { db.close(); }
});

test('API token expiry, malformed restrictions and unknown scopes fail closed', async () => {
    const { db, store, input, advance } = await fixture();
    try {
        for (const override of [{ scopes: ['*'] }, { serverIds: [] }, { serverIds: ['*'] },
            { expiresAt: 1000000 }, { expiresAt: Number.MAX_SAFE_INTEGER }, { name: '\nunsafe' }])
            await assert.rejects(store.create(1, { ...input, ...override } as any));
        const first = await store.create(1, input);
        db.prepare("UPDATE api_tokens SET scopes='[\"*\"]' WHERE id=?").run(first.token.id);
        assert.equal(await store.authenticate(first.secret), null);
        const second = await store.create(1, input);
        advance();
        assert.equal(await store.authenticate(second.secret), null);
    } finally { db.close(); }
});

test('API scopes intersect fresh membership and do not grant root-like capabilities', async () => {
    const { db, store, input } = await fixture();
    try {
        const { token } = await store.create(1, input);
        const owner = { enabled: true, permissions: ['backups.create'] };
        assert(tokenAllows(token, server, 'backups.create', owner, 1000000));
        assert(!tokenAllows(token, server, 'backups.read', owner, 1000000));
        assert(!tokenAllows(token, server, 'backups.create', { ...owner, permissions: [] }, 1000000));
        assert(!tokenAllows(token, server, 'backups.create', { ...owner, permissions: null }, 1000000));
        assert(!tokenAllows(token, server, 'backups.create', { ...owner, enabled: false }, 1000000));
        assert(!tokenAllows(token, '22222222-2222-4222-8222-222222222222', 'backups.create', owner, 1000000));
        assert(!tokenAllows({ ...token, revokedAt: 1000000 }, server, 'backups.create', owner, 1000000));
        assert(!tokenAllows(token, server, 'backups.create', owner, token.expiresAt));
    } finally { db.close(); }
});


test('provisioning credentials persist explicit policy and grant only a confirmed created server', async () => {
    const { db, store, input } = await fixture();
    try {
        const policy = { nodeIds: ['local'], templateIds: ['cs16'], maxServers: 3, maxCpu: 2, maxMemoryMb: 2048 };
        const issued = await store.create(1, { ...input, serverIds: [], scopes: ['servers.read','servers.create','operations.read'], provisioning: policy });
        assert.deepEqual((await store.authenticate(issued.secret))!.provisioning, policy);
        await store.attachServer(issued.token.id, '11111111-1111-4111-8111-111111111111');
        await store.attachServer(issued.token.id, '11111111-1111-4111-8111-111111111111');
        assert.deepEqual((await store.authenticate(issued.secret))!.serverIds, ['11111111-1111-4111-8111-111111111111']);
        await assert.rejects(store.create(1,{ ...input, scopes: ['servers.create'] }));
        await assert.rejects(store.create(1,{ ...input, scopes: ['servers.create'], provisioning: { ...policy, maxServers: 0 } }));
        db.prepare("UPDATE api_tokens SET provisioning='{}' WHERE id=?").run(issued.token.id);
        assert.equal(await store.authenticate(issued.secret),null);
    } finally { db.close(); }
});
