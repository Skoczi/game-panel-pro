import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
process.env.DOMAIN = 'panel.example'; process.env.PORT = '3001'; process.env.JWT_SECRET = 'test-only-session-secret';
const { LoginSessionStore, SESSION_TTL_MS } = await import('../src/services/loginSessions.js');
const { MfaStore, totp, base32 } = await import('../src/services/mfa.js');
const { trustedSessionRequest } = await import('../src/services/sessionHttp.js');

async function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2)');
  const adapter = { exec: async (sql: string) => db.exec(sql),
    run: async (sql: string, ...args: any[]) => db.prepare(sql).run(...args),
    get: async (sql: string, ...args: any[]) => db.prepare(sql).get(...args),
    all: async (sql: string, ...args: any[]) => db.prepare(sql).all(...args) };
  let now = 1_000_000;
  const store = new LoginSessionStore(adapter as any, () => now);
  const mfa = new MfaStore(adapter as any, 'test-master-secret', () => now);
  await store.initialize(); await mfa.initialize();
  return { db, store, mfa, now: () => now, advance: (ms: number) => { now += ms; } };
}
test('sessions are hashed, user/version bound, revocable, persistent and expire', async () => {
  const f = await fixture();
  try {
    const { session, secret } = await f.store.create(1, 7, 'Browser');
    assert(!JSON.stringify(f.db.prepare('SELECT * FROM login_sessions').all()).includes(secret));
    assert.equal((await f.store.fromSecret(secret))?.id, session.id);
    assert(await f.store.active(session.id, 1, 7));
    assert(!await f.store.active(session.id, 2, 7));
    assert(!await f.store.active(session.id, 1, 8));
    assert(!await f.store.active(undefined, 1, 7));
    await f.store.revoke(2, session.id); assert(await f.store.active(session.id, 1, 7));
    await f.store.revoke(1, session.id); assert(!await f.store.active(session.id, 1, 7));
    assert.equal(await f.store.fromSecret(secret), null);
    const next = await f.store.create(1, 7, 'Next');
    await f.store.initialize(); assert(await f.store.active(next.session.id, 1, 7));
    f.advance(SESSION_TTL_MS); assert(!await f.store.active(next.session.id, 1, 7));
  } finally { f.db.close(); }
});
test('session inventory is capped and revoke-all leaves other users alone', async () => {
  const f = await fixture();
  try {
    for (let i=0; i<20; i++) await f.store.create(1, 0, 'Test');
    await assert.rejects(f.store.create(1, 0, 'Overflow'), /Too many/);
    const other = await f.store.create(2, 0, 'Other'); await f.store.revokeAll(1);
    assert.equal((await f.store.list(1)).length, 0); assert(await f.store.active(other.session.id, 2, 0));
  } finally { f.db.close(); }
});
test('cookie refresh rejects missing/cross-site origin and missing custom header', () => {
  const response: any = { status() { return this; }, json() {} };
  for (const headers of [{}, { origin: 'https://evil.example', 'x-gp-session':'1' }, { origin:'https://panel.example' }])
    assert.equal(trustedSessionRequest({ headers } as any, response), false);
  assert.equal(trustedSessionRequest({ headers: { origin: 'https://panel.example', 'x-gp-session':'1' } } as any, response), true);
});
test('TOTP matches RFC 6238 SHA-1 reference vectors', () => {
  const secret = base32(Buffer.from('12345678901234567890'));
  for (const [seconds, code] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']] as const)
    assert.equal(totp(secret, Math.floor(seconds / 30), 8), code);
});
test('MFA needs confirmation, rejects replay, hashes one-use recovery codes and expires setup', async () => {
  const f = await fixture();
  try {
    const secret = await f.mfa.begin(1); assert(!await f.mfa.enabled(1));
    assert(!JSON.stringify(f.db.prepare('SELECT * FROM user_mfa').all()).includes(secret));
    await assert.rejects(f.mfa.confirm(1, 'invalid'));
    const code = totp(secret, Math.floor(f.now()/30000));
    const recovery = await f.mfa.confirm(1, code); assert(await f.mfa.enabled(1));
    assert.equal(recovery.length, 10);
    assert(!JSON.stringify(f.db.prepare('SELECT recovery_hashes FROM user_mfa').all()).includes(recovery[0]));
    assert(!await f.mfa.verify(1, code)); f.advance(30000);
    const fresh = totp(secret, Math.floor(f.now()/30000));
    const results = await Promise.all([f.mfa.verify(1, fresh), f.mfa.verify(1, fresh)]);
    assert.equal(results.filter(Boolean).length, 1);
    assert(!await f.mfa.verify(2, recovery[0]));
    assert(await f.mfa.verify(1, recovery[0])); assert(!await f.mfa.verify(1, recovery[0]));
    await f.mfa.disable(1); assert(!await f.mfa.enabled(1));
    assert.equal(f.db.prepare('SELECT recovery_hashes FROM user_mfa').all().length, 0);
    const pending = await f.mfa.begin(2); f.advance(600001);
    await assert.rejects(f.mfa.confirm(2, totp(pending, Math.floor(f.now()/30000))), /expired/);
  } finally { f.db.close(); }
});
