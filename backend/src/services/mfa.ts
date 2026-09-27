import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Database } from 'sqlite';
import { seal, unseal } from '../nodes/protocol.js';
import { getDatabase } from '../database/init.js';
import { getConfig } from '../config.js';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Buffer) {
  let bits = 0, value = 0, result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; result += alphabet[(value >>> bits) & 31]; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function decode32(secret: string) {
  let bits = 0, value = 0; const bytes: number[] = [];
  for (const char of secret) {
    const digit = alphabet.indexOf(char); if (digit < 0) throw new Error('Invalid authenticator secret');
    value = (value << 5) | digit; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  return Buffer.from(bytes);
}
// RFC 6238, SHA-1, 30-second time step; 8 digits is used only by RFC test vectors.
export function totp(secret: string, step: number, digits = 6) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', decode32(secret)).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, '0');
}
function matchingStep(secret: string, code: string, now: number) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (step >= 0 && timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}
const digest = (code: string) => createHash('sha256').update(code).digest('hex');
type Row = { user_id: number; encrypted: string; enabled: number; pending_until: number; last_step: number };
export class MfaStore {
  constructor(private db: Database, private master: string, private now = Date.now) {}
  async initialize() {
    await this.db.exec(`CREATE TABLE IF NOT EXISTS user_mfa(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      encrypted TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, pending_until INTEGER NOT NULL, last_step INTEGER NOT NULL DEFAULT -1,
      recovery_hashes TEXT NOT NULL DEFAULT '[]');`);
  }
  async enabled(userId: number) { return Boolean((await this.db.get<Row>('SELECT enabled FROM user_mfa WHERE user_id=?', userId))?.enabled); }
  async begin(userId: number) {
    if (await this.enabled(userId)) throw new Error('MFA is already enabled');
    const secret = base32(randomBytes(20));
    await this.db.run(`INSERT INTO user_mfa(user_id,encrypted,pending_until) VALUES(?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET encrypted=excluded.encrypted,pending_until=excluded.pending_until,last_step=-1 WHERE user_mfa.enabled=0`,
      userId, seal(secret, this.master, 'mfa:' + userId), this.now() + 10 * 60_000);
    return secret;
  }
  async confirm(userId: number, code: string) {
    const row = await this.db.get<Row>('SELECT * FROM user_mfa WHERE user_id=?', userId);
    if (!row || row.enabled || row.pending_until <= this.now()) throw new Error('Setup expired. Start again.');
    const step = matchingStep(unseal(row.encrypted, this.master, 'mfa:' + userId), code, this.now());
    if (step === null) throw new Error('Invalid authenticator code');
    const codes = Array.from({ length: 10 }, () => randomBytes(16).toString('hex'));
    // Enable and save recovery credentials in one atomic statement: never enable
    // MFA with only a partial set of recovery credentials after a disk failure.
    const result = await this.db.run('UPDATE user_mfa SET enabled=1,last_step=?,recovery_hashes=? WHERE user_id=? AND enabled=0 AND encrypted=? AND pending_until>?', step, JSON.stringify(codes.map(digest)), userId, row.encrypted, this.now());
    if (result.changes !== 1) throw new Error('Setup changed. Refresh before retrying.');
    return codes;
  }
  async verify(userId: number, code: string) {
    const row = await this.db.get<Row>('SELECT * FROM user_mfa WHERE user_id=? AND enabled=1', userId);
    if (!row) return false;
    if (/^[0-9a-f]{32}$/i.test(code)) {
      const hash = digest(code.toLowerCase());
      const result = await this.db.run(`UPDATE user_mfa SET recovery_hashes=json_remove(recovery_hashes,
        (SELECT '$[' || key || ']' FROM json_each(recovery_hashes) WHERE value=? LIMIT 1))
        WHERE user_id=? AND enabled=1 AND encrypted=? AND EXISTS(SELECT 1 FROM json_each(recovery_hashes) WHERE value=?)`, hash, userId, row.encrypted, hash);
      return result.changes === 1;
    }
    const step = matchingStep(unseal(row.encrypted, this.master, 'mfa:' + userId), code, this.now());
    if (step === null) return false;
    const result = await this.db.run('UPDATE user_mfa SET last_step=? WHERE user_id=? AND enabled=1 AND encrypted=? AND last_step<?', step, userId, row.encrypted, step);
    return result.changes === 1;
  }
  async disable(userId: number) {
    await this.db.run('DELETE FROM user_mfa WHERE user_id=?', userId);
  }
}
let instance: Promise<MfaStore> | undefined;
export function mfaStore() {
  return instance ??= getDatabase().then(async db => { const store = new MfaStore(db, getConfig().jwtSecret); await store.initialize(); return store; })
    .catch(error => { instance = undefined; throw error; });
}
