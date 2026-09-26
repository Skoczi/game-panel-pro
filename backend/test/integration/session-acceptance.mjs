// Run only in an isolated Linux container with /data as a fresh tmpfs.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
process.env.DOMAIN = 'panel.example'; process.env.PORT = '3001';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
const { initializeDatabase, closeDatabase } = await import('../../dist/database/init.js');
const { userRepository } = await import('../../dist/database/index.js');
const { hashPassword, verifyToken, generateToken } = await import('../../dist/utils/auth.js');
const { default: auth } = await import('../../dist/routes/auth.js');
const { default: security } = await import('../../dist/routes/accountSecurity.js');
const { totp } = await import('../../dist/services/mfa.js');
const { setupWebSocket } = await import('../../dist/websocket/handler.js');
const db = await initializeDatabase();
assert.equal((await db.get('SELECT COUNT(*) AS n FROM users')).n, 0, 'Fresh test database required');
const password = randomBytes(18).toString('hex');
const userId = await userRepository.create('SessionTest', await hashPassword(password));
const app = express(); app.use(express.json()); app.use('/api/auth', auth); app.use('/api/auth/security', security);
const server = createServer(app), wss = new WebSocketServer({ server }); setupWebSocket(wss);
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/auth/`;
async function call(path, { body, token, cookie, origin = 'https://panel.example', header = true } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: {
    'Content-Type': 'application/json', Origin: origin, ...(header ? { 'X-GP-Session': '1' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie'), cache: res.headers.get('cache-control') };
}
try {
  let login = await call('login', { body: { username: 'SessionTest', password } });
  assert.equal(login.status, 200); assert.equal(login.cache, 'no-store');
  assert.match(login.cookie, /HttpOnly/); assert.match(login.cookie, /Secure/); assert.match(login.cookie, /SameSite=Strict/);
  let cookie = login.cookie.split(';')[0], token = login.data.token;
  const claims = verifyToken(token); assert.equal(claims.exp - claims.iat, 900);
  assert.equal((await call('me', { token })).status, 200);
  const legacy = generateToken({ userId, username: 'SessionTest', isRoot: false, tokenVersion: 0 });
  assert.equal((await call('me', { token: legacy })).status, 401);
  assert.equal((await call('session', { body: {}, cookie, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('session', { body: {}, cookie, header: false })).status, 403);
  assert.equal((await call('session', { body: {}, cookie })).status, 200);
  const ws = new WebSocket(base.replace('http:', 'ws:').replace('/api/auth/', '/'), { headers: { Authorization: `Bearer ${token}` } });
  await once(ws, 'open'); const closed = once(ws, 'close', { signal: AbortSignal.timeout(8000) });
  assert.equal((await call('logout', { body: {}, cookie })).status, 200);
  assert.equal((await call('me', { token })).status, 401);
  assert.equal((await call('session', { body: {}, cookie })).status, 401);
  assert.equal((await closed)[0], 1008);
  login = await call('login', { body: { username: 'SessionTest', password } });
  token = login.data.token; cookie = login.cookie.split(';')[0];
  assert.equal((await call('security/begin', { token, body: { password: 'wrong' } })).status, 403);
  const setup = await call('security/begin', { token, body: { password } }); assert.equal(setup.status, 200);
  const code = totp(setup.data.secret, Math.floor(Date.now() / 30000));
  const confirmed = await call('security/confirm', { token, cookie, body: { password, code } }); assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.recoveryCodes.length, 10);
  assert.equal((await call('me', { token })).status, 401);
  assert.equal((await call('me', { token: confirmed.data.token })).status, 200);
  assert.equal((await call('login', { body: { username: 'SessionTest', password } })).data.mfaRequired, true);
  assert.equal((await call('login', { body: { username: 'SessionTest', password, code } })).status, 401);
  const recovered = await call('login', { body: { username: 'SessionTest', password, code: confirmed.data.recoveryCodes[0] } });
  assert.equal(recovered.status, 200);
  assert.equal((await call('login', { body: { username: 'SessionTest', password, code: confirmed.data.recoveryCodes[0] } })).status, 401);
  const changed = await call('change-password', { token: recovered.data.token, cookie: recovered.cookie.split(';')[0], body: { currentPassword: password, newPassword: password + 'new', confirmPassword: password + 'new' } });
  assert.equal(changed.status, 200); assert.equal((await call('me', { token: recovered.data.token })).status, 401);
  assert.equal((await call('me', { token: changed.data.token })).status, 200);
  await db.run('UPDATE users SET is_enabled=0 WHERE id=?', userId);
  assert.equal((await call('me', { token: changed.data.token })).status, 403);
  assert.equal((await call('session', { body: {}, cookie: changed.cookie.split(';')[0] })).status, 401);
  console.log('PASS: real HTTP login/refresh/logout, legacy rejection, cookie flags, CSRF, WebSocket revocation, MFA/recovery/replay, password and disabled-account revocation');
} finally { for (const client of wss.clients) client.terminate(); process.emit('SIGTERM'); server.close(); await closeDatabase(); }
