import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadWithMocks } from './loadWithMocks.js';
import * as history from '../src/services/fileHistory.js';
import * as atomic from '../src/services/atomicFile.js';
import * as validation from '../src/utils/httpValidation.js';
import { PERMISSIONS } from '../src/permissions.js';
test('file history HTTP access uses file-read permission, records successful writes and refuses another path', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gp-history-route-'));
  await fs.writeFile(path.join(root, 'server.cfg'), 'before'); await fs.writeFile(path.join(root, 'other.cfg'), 'other');
  const actions: unknown[][] = [];
  const router = loadWithMocks('../src/routes/serverFile.ts', {
    '../services/copyServerFile.js': { copyServerFile: async (_id: number, from: string, to: string) => ({ sourceRoot: 'data', sourcePath: from, root: 'data', path: to }) },
    '../database/index.js': { actionsRepository: { create: async (...args: unknown[]) => { actions.push(args); } } },
    express: { Router: express.Router }, 'node:fs': { promises: fs }, 'node:path': path,
    '../utils/storage.js': { getServerStoragePaths: () => ({ serverRoot: root }) },
    '../services/fileHistory.js': history, '../services/atomicFile.js': atomic,
    '../middleware/auth.js': { requireServerPermission: (permission: string) => (req: any, res: any, next: any) => { req.user = { username: 'operator' }; return String(req.headers['x-permission']).split(',').includes(permission) ? next() : res.status(403).json({ error: 'denied' }); } },
    '../services/fileExplorer.js': { resolveServerPath: async ({ path: apiPath }: any) => ({ absPath: path.join(root, path.basename(apiPath)), apiPath, root: 'data', rootDir: root }) },
    '../middleware/privateFileRoots.js': { rejectPrivateFileRoots: (_req: any, _res: any, next: any) => next() },
    '../utils/fsBrowser.js': { ensureIsFile: async (name: string) => { assert((await fs.stat(name)).isFile()); }, getBasenameFromApiPath: path.basename, guessContentTypeByName: () => 'text/plain' },
    '../utils/httpValidation.js': validation, '../permissions.js': { PERMISSIONS },
    '../utils/routeErrors.js': { sendRouteError: (res: any, error: any) => res.status(error.statusCode || 500).json({ error: error.message }) },
  }).default;
  const app = express(); app.use(express.json()); app.use('/servers/:id/file', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/servers/7/file`;
  try {
    const save = await fetch(base+'?path=/server.cfg', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-permission': 'fs.write' }, body: JSON.stringify({ content: 'after', version: atomic.fileVersion('before') }) });
    assert.deepEqual(actions, [[7, 'info', 'File saved: data:/server.cfg', 'operator']]);
    assert.equal(save.status, 200); assert.equal((await save.json()).historyWarning, undefined);
    assert.equal((await fetch(base+'?path=/server.cfg', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-permission': 'fs.write' }, body: JSON.stringify({ content: 'conflicting', version: atomic.fileVersion('before') }) })).status, 409);
    assert.equal(actions.length, 1);
    assert.equal((await fetch(base+'/history?path=/server.cfg', { headers: { 'x-permission': 'fs.write' } })).status, 403);
    const response = await fetch(base+'/history?path=/server.cfg', { headers: { 'x-permission': 'fs.read' } });
    assert.equal(response.status, 200); const entries = (await response.json()).entries;
    assert.equal(entries.length, 1); assert.equal(entries[0].state, 'committed'); assert.equal(entries[0].actor, 'operator'); assert.equal('before' in entries[0], false);
    const record = await fetch(base+'/history?path=/server.cfg&entry='+entries[0].id, { headers: { 'x-permission': 'fs.read' } });
    assert.equal((await record.json()).entry.before, 'before');
    for (const permission of ['fs.read', 'fs.write']) {
      const denied = await fetch(base+'/copy', { method: 'POST', headers: { 'content-type': 'application/json', 'x-permission': permission }, body: JSON.stringify({ from: '/server.cfg', to: '/copy.cfg' }) });
      assert.equal(denied.status, 403);
    }
    const copied = await fetch(base+'/copy', { method: 'POST', headers: { 'content-type': 'application/json', 'x-permission': 'fs.read,fs.write' }, body: JSON.stringify({ from: '/server.cfg', to: '/copy.cfg' }) });
    assert.equal(copied.status, 201);
    assert.deepEqual(actions[1], [7, 'info', 'File copied: data:/server.cfg → data:/copy.cfg', 'operator']);
    const wrong = await fetch(base+'/history?path=/other.cfg&entry='+entries[0].id, { headers: { 'x-permission': 'fs.read' } }); assert.equal(wrong.status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await fs.rm(root, { recursive: true, force: true }); }
});
