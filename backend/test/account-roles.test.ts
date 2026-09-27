import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountRole, isPanelAdministrator } from '../src/utils/accountRole.js';
import { loadWithMocks } from './loadWithMocks.js';
import * as validation from '../src/utils/httpValidation.js';
import { PERMISSIONS } from '../src/permissions.js';

test('account level separates protected owner, panel operator and assigned-server user', () => {
  assert.equal(accountRole({ is_root: 1 }), 'super-admin');
  assert.equal(accountRole({ is_root: 0, global_permissions_json: '["panel.operator"]' }), 'operator');
  for (const raw of ['[]', '["users.manage"]', '["*"]', '"panel.operator"', '{bad']) {
    assert.equal(isPanelAdministrator({ is_root: 0, global_permissions_json: raw }), false);
  }
});

function response() {
  return { code: 200, data: null as any, status(code: number) { this.code = code; return this; }, json(data: any) { this.data = data; return this; } };
}

test('live database grants determine panel authority, never a stale root token', async () => {
  let row = { id: 2, is_enabled: 1, is_root: 0, token_version: 1, global_permissions_json: '["panel.operator"]' };
  const auth = loadWithMocks('../src/middleware/auth.ts', {
    '../utils/auth.js': { extractTokenFromHeader: () => 'token', verifyToken: () => ({ userId: 2, isRoot: true, tokenVersion: 1, sessionId: 'session' }) },
    '../database/index.js': { userRepository: { findById: async () => row } },
    '../utils/ids.js': {}, '../utils/logger.js': {}, '../permissions.js': { PERMISSIONS },
    '../agent/identity.js': { isAgent: () => false },
    '../services/loginSessions.js': { loginSessions: async () => ({ active: async () => true }) },
  });
  for (const expected of [true, false]) {
    const req: any = { headers: {} }; let continued = false;
    await auth.authMiddleware(req, response(), () => { continued = true; });
    assert.equal(continued, true); assert.equal(req.user.isRoot, expected);
    row = { ...row, global_permissions_json: '[]' };
  }
});

test('operator cannot modify, disable, reset password or delete protected Super Admin', async () => {
  let target = { id: 1, is_root: 1, global_permissions_json: '[]' }; let writes = 0;
  const routes = new Map<string, any>();
  const router: any = {};
  for (const method of ['get', 'post', 'patch', 'delete']) router[method] = (path: string, ...handlers: any[]) => routes.set(method + path, handlers.at(-1));
  loadWithMocks('../src/routes/users.ts', {
    express: { Router: () => router }, '../middleware/auth.js': { requireGlobalPermission: () => () => {} },
    '../database/index.js': { userRepository: { findById: async () => target, updateUser: async () => writes++, updatePassword: async () => writes++, deleteUser: async () => writes++ } },
    '../utils/auth.js': { hashPassword: async () => 'hash' }, '../utils/routeErrors.js': { sendRouteError: (_r: any, e: any) => { throw e; } },
    '../permissions.js': { PERMISSIONS }, '../utils/time.js': {}, '../utils/httpValidation.js': validation,
  });
  for (const [method, body] of [
    ['patch/:id', { isEnabled: false, globalPermissions: [] }],
    ['patch/:id', { username: 'hijacked' }],
    ['delete/:id', {}], ['post/:id/reset-password', { newPassword: 'test-password' }],
  ] as const) {
    const res = response();
    await routes.get(method)({ params: { id: '1' }, user: { userId: 2, isRoot: true }, body }, res);
    assert.equal(res.code, 403);
  }
  assert.equal(writes, 0);
  target = { id: 3, is_root: 0, global_permissions_json: '[]' };
  const denied = response();
  await routes.get('patch/:id')({ params: { id: '3' }, user: { userId: 3, isRoot: false }, body: { globalPermissions: ['panel.operator'] } }, denied);
  assert.equal(denied.code, 403); assert.equal(writes, 0);
  const allowed = response();
  await routes.get('patch/:id')({ params: { id: '3' }, user: { userId: 2, isRoot: true }, body: { globalPermissions: ['panel.operator'] } }, allowed);
  assert.equal(allowed.code, 200); assert.equal(writes, 1);
});

test('scheduled actions cannot bypass terminal, power, backup, console or root-only update access', async () => {
  const { authorizeScheduledTask } = loadWithMocks('../src/services/scheduledTaskAccess.ts', {
    '../middleware/auth.js': { userHasServerPermission: async (user: any, id: number, permission: string) => user.isRoot || (id === 8 && user.permissions.includes(permission)) },
  });
  const user = { permissions: ['server.power', 'backups.create', 'server.command.send'] };
  const authorize = authorizeScheduledTask(user, 8);
  await authorize('restart', {}); await authorize('backup', {}); await authorize('game_command', { command: 'status' });
  await assert.rejects(authorize('custom', { command: 'id' }), { statusCode: 403 });
  await assert.rejects(authorize('restart', { maintenance: { update: true } }), { statusCode: 403 });
  await authorize('restart', { maintenance: { update: false, saveCommand: 'save' } });
  const none = authorizeScheduledTask({ permissions: [] }, 8);
  for (const type of ['restart', 'backup', 'game_command', 'custom']) await assert.rejects(none(type, {}), { statusCode: 403 });
  for (const phase of ['pre', 'post', 'cleanup']) await assert.rejects(authorizeScheduledTask({ permissions: ['server.power'] }, 8)('restart', { [phase]: [{ type: 'game_command', command: 'status' }] }), { statusCode: 403 });
  await assert.rejects(authorizeScheduledTask(user, 9)('restart', {}), { statusCode: 403 });
  await authorizeScheduledTask({ isRoot: true }, 8)('custom', { command: 'id' });
});
