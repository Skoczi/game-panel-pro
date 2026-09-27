import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWithMocks } from './loadWithMocks.js';
import { journalResponse } from '../src/agent/journal.js';
import * as path from 'node:path';

function fixture() {
  const config = { apiUrl: 'http://eserv-sftp:8080', admin: 'panel', secret: 'private-service-secret', port: 2023, publicIps: ['51.83.150.145'], fingerprint: 'SHA256:test' };
  const server: any = { id: 8, runtime_uuid: 'a'.repeat(32), ports_json: JSON.stringify({ udp: [{ hostIp: '51.83.150.145' }] }) };
  const root = path.resolve('/games/8'); let symlink = false; let owner = 1000; let account: any = null; const writes: any[] = [];
  const service = loadWithMocks('../src/services/serverSftp.ts', {
    'node:fs': { promises: { readFile: async () => JSON.stringify(config), realpath: async (p: string) => symlink ? '/other-server' : path.resolve(p), stat: async () => ({ isDirectory: () => true, uid: owner, gid: owner }) } },
    'node:path': path, 'node:net': { isIP: (ip: string) => /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? 4 : 0 },
    'node:crypto': { randomBytes: () => Buffer.from('high-entropy-one-time-password') },
    '../database/index.js': { serverRepository: { findById: async (id: number) => id === 8 ? server : null } },
    '../utils/storage.js': { getServerStoragePaths: () => ({ serverRoot: root }) },
    '../providers/runtimeConfig.js': { parseStoredPorts: (s: any) => JSON.parse(s.ports_json), parseStoredMounts: () => [{ key: 'data' }] },
    './nativeBackups.js': { nativeServerTemplate: () => ({}) },
  }, { URL, Buffer, AbortSignal, fetch: async (url: string, options: any) => {
    if (url.endsWith('/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'private-token' }) };
    if (options.method === 'GET') return { ok: !!account, status: account ? 200 : 404, json: async () => account };
    const body = options.body ? JSON.parse(options.body) : undefined; writes.push({ url, method: options.method, body });
    if (options.method === 'DELETE') account = null;
    else account = { ...body, password: 'HASH' };
    return { ok: true, status: 200, json: async () => ({}) };
  } });
  return { service, server, config, writes, symlink: () => { symlink = true; }, otherOwner: () => { owner = 0; } };
}

test('SFTP exposes game IP only, provisions an isolated game directory, and never reads passwords back', async () => {
  const f = fixture();
  const off = await f.service.serverSftpStatus(8); assert.equal(off.enabled, false); assert.equal(off.host, '51.83.150.145');
  const on = await f.service.updateServerSftp(8, { action: 'enable' }); assert.ok(on.password); assert.equal(on.enabled, true);
  const write = f.writes[0]; assert.equal(write.body.home_dir, '/servers/8/data/serverfiles');
  assert.equal(write.body.username, 'a'.repeat(32)); assert.ok(!write.body.permissions['/'].includes('create_symlinks'));
  assert.ok(!write.body.filters.denied_protocols.includes('SSH'));
  const read = await f.service.serverSftpStatus(8); assert.equal(read.password, undefined); assert.ok(!JSON.stringify(read).includes('private-'));
  await f.service.updateServerSftp(8, { action: 'rotate' }); assert.match(f.writes.at(-1).url, /disconnect=1/);
  const disabled = await f.service.updateServerSftp(8, { action: 'disable' }); assert.equal(disabled.enabled, false); assert.match(f.writes.at(-1).url, /disconnect=1/);
  await assert.rejects(f.service.updateServerSftp(8, { action: 'rotate' }), { statusCode: 409 });
});

test('no management-IP fallback, caller-selected paths or foreign server identity', async () => {
  const f = fixture();
  f.server.ports_json = JSON.stringify({ udp: [{ hostIp: '51.68.155.190' }] });
  const state = await f.service.serverSftpStatus(8); assert.equal(state.available, false); assert.equal(state.host, null);
  await assert.rejects(f.service.updateServerSftp(8, { action: 'enable' }), { statusCode: 409 });
  await assert.rejects(f.service.updateServerSftp(8, { action: 'enable', home_dir: '/' }), { statusCode: 400 });
  await assert.rejects(f.service.serverSftpStatus(9), { statusCode: 404 }); assert.equal(f.writes.length, 0);
});

test('filesystem symlinks and incompatible ownership fail closed without chmod or chown', async () => {
  for (const invalid of ['symlink', 'otherOwner'] as const) {
    const f = fixture(); f[invalid]();
    await assert.rejects(f.service.updateServerSftp(8, { action: 'enable' }), { statusCode: 409 });
    assert.equal(f.writes.length, 0);
  }
});

test('existing access remains revocable after the assigned game IP is removed', async () => {
  const f = fixture(); await f.service.updateServerSftp(8, { action: 'enable' });
  f.server.ports_json = JSON.stringify({ udp: [] });
  const state = await f.service.serverSftpStatus(8);
  assert.equal(state.available, false); assert.equal(state.enabled, true); assert.equal(state.host, null);
  assert.equal((await f.service.updateServerSftp(8, { action: 'disable' })).enabled, false);
});

test('server deletion revokes active SFTP before removing its account', async () => {
  const f = fixture(); await f.service.updateServerSftp(8, { action: 'enable' });
  await f.service.revokeServerSftp(f.server);
  assert.equal(f.writes.at(-2).body.status, 0); assert.match(f.writes.at(-2).url, /disconnect=1/); assert.equal(f.writes.at(-1).method, 'DELETE');
});

test('one-time SFTP passwords are excluded from the durable agent journal and replay', () => {
  const body = { enabled: true, username: 'server', password: 'secret' };
  const cached = journalResponse('POST', '/api/servers/8/sftp', body);
  assert.deepEqual(JSON.parse(cached), { enabled: true, username: 'server' }); assert.equal(body.password, 'secret');
  assert.equal(journalResponse('POST', '/api/servers/8/console', { ok: true }), '{"ok":true}');
});
