import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWithMocks } from './loadWithMocks.js';

test('backup listing adds verified metadata without exposing filesystem identities or secrets', async () => {
  const checked: string[] = [];
  const { listServerBackups } = loadWithMocks('../src/services/backupListing.ts', {
    'node:path': path,
    './servers.js': { getServerOrThrow: async () => ({ id: 8, provider: 'external' }) },
    './nativeBackups.js': { nativeServerTemplate: () => ({}) },
    './nativeProtection.js': { readNativeBackupRecord: async (file: string) => { checked.push(file); return file.endsWith('good.tar.gz') ? { mode: 'live', createdAt: '2026-09-26T17:00:00Z', validatedAt: '2026-09-26T17:01:00Z', identity: { ino: 123 } } : null; } },
    './fileExplorer.js': {
      listServerFiles: async () => ({ entries: ['good.tar.gz', 'old.tar.gz', 'note.txt'].map(name => ({ name, type: 'file', size: 20 })), path: '/backups' }),
      resolveServerPath: async ({ path: requested }: any) => ({ absPath: '/safe' + requested }),
    },
    './serverBackups.js': { getBackupKind: () => 'file', getBackupFileLocation: async () => ({ root: 'data', basePath: '/backups' }), getSupportedBackupExtensions: () => ['.tar.gz'] },
  });
  const result = await listServerBackups(8);
  assert.equal(result.entries.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.entries[0].verification)), { mode: 'live', createdAt: '2026-09-26T17:00:00Z', validatedAt: '2026-09-26T17:01:00Z' });
  assert.equal(result.entries[1].verification, null);
  assert.deepEqual(checked, ['/safe/backups/good.tar.gz', '/safe/backups/old.tar.gz']);
});
