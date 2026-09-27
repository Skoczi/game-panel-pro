import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { loadWithMocks } from './loadWithMocks.js';
import * as browser from '../src/utils/fsBrowser.js';

test('copies binary files atomically without overwriting, escaping roots or following links', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gp-copy-'));
  const copy = loadWithMocks('../src/services/copyServerFile.ts', {
    'node:fs': { promises: fs, constants }, 'node:path': path, 'node:crypto': { randomUUID },
    '../utils/fsBrowser.js': browser,
    './fileExplorer.js': { resolveServerPath: async (params: any) => ({ ...browser.resolveSafeChildPath(root, params.path), root: 'data', rootDir: root }) },
  }, { Buffer }).copyServerFile;
  try {
    const bytes = randomBytes(2500000);
    await fs.writeFile(path.join(root, 'source.bin'), bytes, { mode: 0o640 });
    await fs.mkdir(path.join(root, 'dest'));
    await copy(7, '/source.bin', '/dest/copy.bin', 'data');
    assert.deepEqual(await fs.readFile(path.join(root, 'dest/copy.bin')), bytes);
    assert.equal((await fs.stat(path.join(root, 'dest/copy.bin'))).mode & 0o777, 0o640);
    await assert.rejects(copy(7, '/source.bin', '/dest/copy.bin', 'data'), { statusCode: 409 });
    await assert.rejects(copy(7, '/source.bin', '/source.bin', 'data'), { statusCode: 409 });
    await assert.rejects(copy(7, '/dest', '/folder-copy', 'data'));
    await fs.symlink('/etc/passwd', path.join(root, 'link'));
    await assert.rejects(copy(7, '/link', '/bad', 'data'));
    await assert.rejects(copy(7, '/source.bin', '/link', 'data'), { statusCode: 409 });
    await fs.symlink(os.tmpdir(), path.join(root, 'outside'));
    await assert.rejects(copy(7, '/source.bin', '/outside/copied', 'data'));
    assert.deepEqual((await fs.readdir(path.join(root, 'dest'))), ['copy.bin']);
    assert.deepEqual(await fs.readFile(path.join(root, 'source.bin')), bytes);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
