import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { SignedWebhookStore } from '../src/services/signedWebhookStore.js';
import { publicWebhookAddress, signedWebhookUrl, webhookSignature } from '../src/services/signedWebhookDelivery.js';
import { loadWithMocks } from './loadWithMocks.js';
import * as net from 'node:net';
import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
test('delivery pins validated DNS, signs exact bytes and never follows a redirect', async () => {
    let address = '127.0.0.1', calls = 0;
    const body = '{"id":"fixed","data":{}}';
    const subject = loadWithMocks('../src/services/signedWebhookDelivery.ts', {
        'node:net': net, 'node:crypto': crypto, 'node:dns/promises': { lookup: async () => [{ address, family: 4 }] },
        'node:https': { request: (_url: URL, options: any, callback: any) => {
            calls++; const request = new EventEmitter() as any;
            options.lookup('example.com', { all: true }, (_error: any, answers: any) => assert.equal(answers[0].address, '1.1.1.1'));
            assert.equal(options.headers['x-eserv-event-id'], 'fixed');
            assert.equal(options.headers['x-eserv-signature'], 'v1=' + webhookSignature('secret', options.headers['x-eserv-timestamp'], body));
            request.end = (value: string) => { assert.equal(value, body); queueMicrotask(() => callback({ statusCode: 302, destroy: () => request.emit('close') })); };
            request.destroy = () => request.emit('close'); return request;
        } },
    }, { Buffer, URL, setTimeout, clearTimeout });
    await assert.rejects(subject.deliverSignedWebhook('https://example.com/events', 'secret', 'fixed', body), /public/);
    assert.equal(calls, 0); address = '1.1.1.1';
    assert.equal(await subject.deliverSignedWebhook('https://example.com/events', 'secret', 'fixed', body), 302);
    assert.equal(calls, 1);
});
test('signed webhook rejects private destinations and unsafe URL components', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.1.1', '172.17.0.1', '192.168.1.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1', '2001:db8::1', '2002:7f00:1::']) assert.equal(publicWebhookAddress(ip), false, ip);
    for (const ip of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(publicWebhookAddress(ip), true, ip);
    for (const url of ['http://example.com/', 'https://user:pass@example.com/', 'https://example.com:444/', 'https://example.com/?secret=x', 'https://example.com/#x']) assert.throws(() => signedWebhookUrl(url));
    assert.equal(signedWebhookUrl('https://example.com/events').pathname, '/events');
    const body = '{"id":"event","type":"webhook.test"}', timestamp = '1234567';
    assert.equal(webhookSignature('key', timestamp, body), createHmac('sha256', 'key').update(timestamp + '.' + body).digest('hex'));
    assert.notEqual(webhookSignature('key', timestamp, body), webhookSignature('key', timestamp, body + ' '));
});
test('webhook secrets are encrypted, retries retain IDs, restart requeues and rotation skips old deliveries', async () => {
    const db = new DatabaseSync(':memory:');
    const adapter = { exec: async (sql: string) => db.exec(sql), run: async (sql: string, ...p: any[]) => db.prepare(sql).run(...p), get: async (sql: string, ...p: any[]) => db.prepare(sql).get(...p), all: async (sql: string, ...p: any[]) => db.prepare(sql).all(...p) };
    const store = new SignedWebhookStore(adapter as any, 'test-master');
    try {
        await store.initialize();
        const created = await store.save({ revision: 0, url: 'https://example.com/events', enabled: true });
        assert(created.secret); assert(!(await store.config()).secret.includes(created.secret));
        assert.equal('secret' in await store.view(), false);
        await store.enqueue('webhook.test', { value: 'safe' }, 'event'); await store.enqueue('webhook.test', { value: 'safe' }, 'event');
        let calls = 0;
        await store.tick(async (_url, secret, id, body) => { calls++; assert.equal(secret, created.secret); assert.equal(id, 'event'); assert.equal(JSON.parse(body).id, id); return 503; });
        assert.equal(calls, 1); assert.equal((await store.view()).recent[0].state, 'pending');
        db.exec("UPDATE signed_webhook_events SET state='sending',next_at=0"); await store.initialize();
        await store.tick(async () => 204); assert.equal((await store.view()).recent[0].state, 'delivered');
        await store.enqueue('webhook.test', {}, 'next');
        const rotated = await store.save({ revision: 1, url: created.url, enabled: true, rotateSecret: true });
        assert.notEqual(rotated.secret, created.secret); assert.equal((await adapter.get('SELECT state FROM signed_webhook_events WHERE id=?', 'next') as any).state, 'skipped');
        await assert.rejects(store.save({ revision: 1, url: created.url, enabled: false }), /changed/);
        await store.enqueue('webhook.test', {}, 'exhaust');
        for (let i = 0; i < 5; i++) { db.exec("UPDATE signed_webhook_events SET next_at=0"); await store.tick(async () => 500); }
        const failed: any = await adapter.get('SELECT * FROM signed_webhook_events WHERE id=?', 'exhaust');
        assert.equal(failed.state, 'failed'); assert.equal(failed.attempts, 5);
    } finally { db.close(); }
});
