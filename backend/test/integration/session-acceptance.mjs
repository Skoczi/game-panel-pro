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
const { authMiddleware, rootOnly, requireServerPermission } = await import('../../dist/middleware/auth.js');
const { default: users } = await import('../../dist/routes/users.js');
const { default: security } = await import('../../dist/routes/accountSecurity.js');
const { serverSftpRoutes } = await import('../../dist/routes/serverSftp.js');
const { totp } = await import('../../dist/services/mfa.js');
const { setupWebSocket } = await import('../../dist/websocket/handler.js');
const db = await initializeDatabase();
assert.equal((await db.get('SELECT COUNT(*) AS n FROM users')).n, 0, 'Fresh test database required');
const password = randomBytes(18).toString('hex');
const userId = await userRepository.create('SessionTest', await hashPassword(password));
const app = express(); app.use(express.json()); app.use('/api/auth', auth); app.use('/api/auth/security', security);
app.use('/api/auth/managed-users', authMiddleware, users);
app.use('/api/auth/servers/:id/sftp', authMiddleware, serverSftpRoutes);
app.get('/api/auth/probe-admin', authMiddleware, rootOnly, (_req, res) => res.json({ ok: true }));
app.get('/api/auth/servers/:id/probe-terminal', authMiddleware, requireServerPermission('container.terminal'), (_req, res) => res.json({ ok: true }));
const server = createServer(app), wss = new WebSocketServer({ server }); setupWebSocket(wss);
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/auth/`;
async function call(path, { body, token, cookie, origin = 'https://panel.example', header = true, method } = {}) {
  const res = await fetch(base + path, { method: method || (body ? 'POST' : 'GET'), headers: {
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
  // Account-level authority and owner protection through real HTTP + SQLite.
  const ownerId = await userRepository.create('OwnerTest', await hashPassword(password));
  await db.run('UPDATE users SET is_root=1 WHERE id=?', ownerId);
  const operatorId = await userRepository.create('OperatorTest', await hashPassword(password), { globalPermissions: ['panel.operator'] });
  const operatorLogin = await call('login', { body: { username: 'OperatorTest', password } });
  const operatorToken = operatorLogin.data.token;
  const operatorMe = await call('me', { token: operatorToken });
  assert.equal(operatorMe.data.user.role, 'operator');
  assert.equal(operatorMe.data.user.isRoot, true);
  assert.equal((await call('probe-admin', { token: operatorToken })).status, 200);
  assert.equal((await call('servers/987/probe-terminal', { token: operatorToken })).status, 200);
  assert.equal((await call('probe-admin', { token })).status, 403);
  assert.equal((await call('servers/987/probe-terminal', { token })).status, 403);
  for (const [method, suffix, body] of [
    ['DELETE', '', undefined], ['PATCH', '', { isEnabled: false, globalPermissions: [] }],
    ['POST', '/reset-password', { newPassword: 'temporary-test-password' }],
  ]) assert.equal((await call(`managed-users/${ownerId}${suffix}`, { token: operatorToken, method, body })).status, 403);
  const rootAfter = await userRepository.findById(ownerId);
  assert.equal(rootAfter.is_root, 1); assert.equal(rootAfter.is_enabled, 1);
  await userRepository.updateUser(operatorId, { globalPermissions: [] });
  assert.equal((await call('probe-admin', { token: operatorToken })).status, 403);
  assert.equal((await call('me', { token: operatorToken })).data.user.role, 'user');
  console.log('PASS: Operator authority, assigned-user denial, protected owner and immediate HTTP demotion');
  // Real SFTP route: reading files alone must not issue a persistent credential.
  const stamp = new Date().toISOString();
  await db.run("INSERT INTO game_servers(id,name,provider,docker_image,ports_json,created_at,updated_at) VALUES(987,'SftpTest','external','test','{}',?,?)", stamp, stamp);
  await db.run('INSERT INTO server_members(server_id,user_id,permissions_json,created_at,updated_at) VALUES(987,?,?,?,?)', userId, '["fs.read"]', stamp, stamp);
  assert.equal((await call('servers/987/sftp', { token })).status, 200);
  for (const permissions of [['fs.read'], ['sftp.manage','fs.read'], ['sftp.manage','fs.write']]) {
    await db.run('UPDATE server_members SET permissions_json=? WHERE server_id=987 AND user_id=?', JSON.stringify(permissions), userId);
    assert.equal((await call('servers/987/sftp', { token, body: { action: 'enable' } })).status, 403);
  }
  await db.run('UPDATE server_members SET permissions_json=? WHERE server_id=987 AND user_id=?', '["sftp.manage","fs.read","fs.write"]', userId);
  assert.equal((await call('servers/987/sftp', { token, body: { action: 'enable' } })).status, 409, 'Authorized, but isolated test has no SFTP service');
  assert.equal((await call('servers/988/sftp', { token, body: { action: 'enable' } })).status, 403);
  assert.equal((await call('servers/987/probe-terminal', { token })).status, 403);
  await db.run('DELETE FROM game_servers WHERE id=987');
  console.log('PASS: SFTP requires management plus file read/write permissions, cannot access another server or terminal');
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
