import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Database } from 'sqlite';
import { getDatabase } from '../database/init.js';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export type LoginSession = { id: string; user_id: number; token_version: number; created_at: number; expires_at: number; revoked_at: number | null; label: string };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const columns = 'id,user_id,token_version,created_at,expires_at,revoked_at,label';

export class LoginSessionStore {
  constructor(private db: Database, private now = Date.now) {}
  async initialize() {
    await this.db.exec(`CREATE TABLE IF NOT EXISTS login_sessions (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      secret_hash TEXT NOT NULL UNIQUE, token_version INTEGER NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER, label TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS login_sessions_owner ON login_sessions(user_id,expires_at);`);
  }
  async create(userId: number, tokenVersion: number, label: string) {
    const now = this.now(), id = randomUUID(), secret = randomBytes(32).toString('base64url');
    await this.db.run('DELETE FROM login_sessions WHERE expires_at<=? OR revoked_at IS NOT NULL', now);
    const session: LoginSession = { id, user_id: userId, token_version: tokenVersion, created_at: now,
      expires_at: now + SESSION_TTL_MS, revoked_at: null, label: label.replace(/[\x00-\x1f\x7f]/g, '').slice(0,160) };
    const inserted = await this.db.run(`INSERT INTO login_sessions(id,user_id,secret_hash,token_version,created_at,expires_at,label) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM login_sessions WHERE user_id=?)<20`,
      id, userId, digest(secret), tokenVersion, now, session.expires_at, session.label, userId);
    if (inserted.changes !== 1) throw new Error('Too many active sessions. Sign out another device first.');
    return { session, secret };
  }
  async fromSecret(secret: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
    return await this.db.get<LoginSession>(`SELECT ${columns} FROM login_sessions WHERE secret_hash=? AND revoked_at IS NULL AND expires_at>?`, digest(secret), this.now()) || null;
  }
  async active(id: string | undefined, userId: number, version: number) {
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return false;
    return Boolean(await this.db.get('SELECT id FROM login_sessions WHERE id=? AND user_id=? AND token_version=? AND revoked_at IS NULL AND expires_at>?', id, userId, version, this.now()));
  }
  async list(userId: number) {
    return this.db.all<LoginSession[]>(`SELECT ${columns} FROM login_sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC`, userId, this.now());
  }
  async revoke(userId: number, id: string) {
    await this.db.run('UPDATE login_sessions SET revoked_at=? WHERE user_id=? AND id=?', this.now(), userId, id);
  }
  async revokeAll(userId: number) {
    await this.db.run('UPDATE login_sessions SET revoked_at=? WHERE user_id=?', this.now(), userId);
  }
}

let instance: Promise<LoginSessionStore> | undefined;
export function loginSessions() {
  return instance ??= getDatabase().then(async db => {
    const store = new LoginSessionStore(db);
    await store.initialize();
    return store;
  }).catch(error => { instance = undefined; throw error; });
}
