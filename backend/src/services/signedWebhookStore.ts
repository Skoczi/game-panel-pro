import { randomBytes, randomUUID } from 'node:crypto';
import type { Database } from 'sqlite';
import { seal, unseal } from '../nodes/protocol.js';
import { signedWebhookUrl, deliverSignedWebhook } from './signedWebhookDelivery.js';
export class SignedWebhookStore {
    constructor(private db: Database, private master: string) {}
    async initialize() {
        await this.db.exec(`CREATE TABLE IF NOT EXISTS signed_webhook_config (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, enabled INTEGER NOT NULL, url TEXT NOT NULL, secret TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS signed_webhook_events(id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at INTEGER NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, result TEXT);
            UPDATE signed_webhook_events SET state='pending' WHERE state='sending'`);
    }
    async config() { return this.db.get('SELECT * FROM signed_webhook_config WHERE id=1'); }
    async view() {
        const c = await this.config();
        return { revision: c?.revision || 0, enabled: Boolean(c?.enabled), url: c?.url || '', secretConfigured: Boolean(c?.secret),
            recent: await this.db.all('SELECT id,created_at,state,attempts,result FROM signed_webhook_events ORDER BY created_at DESC LIMIT 20') };
    }
    async save(input: any) {
        if (!input || typeof input.enabled !== 'boolean' || typeof input.url !== 'string' || Object.keys(input).some(k => !['revision', 'enabled', 'url', 'rotateSecret'].includes(k)) || (input.rotateSecret !== undefined && typeof input.rotateSecret !== 'boolean')) throw new Error('Invalid webhook settings');
        const old = await this.config();
        if (input.revision !== (old?.revision || 0)) throw Object.assign(new Error('Webhook settings changed; refresh before saving'), { statusCode: 409 });
        const url = input.url ? signedWebhookUrl(input.url).href : '';
        if (input.enabled && !url) throw new Error('Set a webhook URL before enabling');
        const secret = !old?.secret || input.rotateSecret ? randomBytes(32).toString('base64url') : undefined;
        const encrypted = secret ? seal(secret, this.master, 'signed-webhooks') : old.secret;
        const result = old ? await this.db.run('UPDATE signed_webhook_config SET revision=revision+1,enabled=?,url=?,secret=? WHERE id=1 AND revision=?', Number(input.enabled), url, encrypted, old.revision)
            : await this.db.run('INSERT OR IGNORE INTO signed_webhook_config VALUES(1,1,?,?,?)', Number(input.enabled), url, encrypted);
        if (result.changes !== 1) throw Object.assign(new Error('Webhook settings changed'), { statusCode: 409 });
        if (!input.enabled || old?.url !== url || secret) await this.db.run("UPDATE signed_webhook_events SET state='skipped',result='Destination disabled or changed' WHERE state='pending'");
        return { ...await this.view(), ...(secret ? { secret } : {}) };
    }
    async enqueue(type: string, data: Record<string, unknown>, eventId: string = randomUUID()) {
        if (!(await this.config())?.enabled) return;
        const now = Date.now(), body = JSON.stringify({ id: eventId, type, createdAt: new Date(now).toISOString(), data });
        if (body.length > 4096) throw new Error('Webhook event too large');
        await this.db.run("DELETE FROM signed_webhook_events WHERE created_at<?", now - 7 * 86400000);
        await this.db.run("DELETE FROM signed_webhook_events WHERE state NOT IN ('pending','sending') AND id NOT IN (SELECT id FROM signed_webhook_events ORDER BY created_at DESC LIMIT 10000)");
        await this.db.run("INSERT OR IGNORE INTO signed_webhook_events(id,body,created_at,state) SELECT ?,?,?,'pending' WHERE (SELECT COUNT(*) FROM signed_webhook_events WHERE state IN ('pending','sending')) < 1000", eventId, body, now);
    }
    async tick(send = deliverSignedWebhook) {
        const config = await this.config(); if (!config?.enabled) return;
        const now = Date.now();
        await this.db.run("UPDATE signed_webhook_events SET state='failed',result='Delivery window expired' WHERE state='pending' AND created_at<?", now - 86400000);
        const row = await this.db.get("SELECT * FROM signed_webhook_events WHERE state='pending' AND next_at<=? ORDER BY created_at LIMIT 1", now); if (!row) return;
        if ((await this.db.run("UPDATE signed_webhook_events SET state='sending',attempts=attempts+1 WHERE id=? AND state='pending'", row.id)).changes !== 1) return;
        let status = 0;
        try { status = await send(config.url, unseal(config.secret, this.master, 'signed-webhooks'), row.id, row.body); } catch { /* Network outcomes may be ambiguous; receiver deduplicates the stable event ID. */ }
        const delivered = status >= 200 && status < 300, retryable = status === 0 || status === 429 || status >= 500;
        await this.db.run('UPDATE signed_webhook_events SET state=?,next_at=?,result=? WHERE id=?', delivered ? 'delivered' : retryable && row.attempts < 4 ? 'pending' : 'failed', now + Math.min(3600, 15 * 2 ** row.attempts) * 1000, status ? `HTTP ${status}` : 'Delivery unconfirmed; receiver must deduplicate event ID', row.id);
    }
}
