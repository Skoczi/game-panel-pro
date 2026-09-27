import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { archiveWithProgress, countArchiveEntries } from '../src/services/archiveProgress.js';
import { validateNativeArchive } from '../src/services/nativeArchive.js';
import type { OperationProgress } from '../src/services/operationProgress.js';
import { loadWithMocks } from './loadWithMocks.js';
import { randomUUID } from 'node:crypto';

test('archive reports real entry progress, preserves links and rejects failed output', { skip: process.platform === 'win32' }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'addon-progress-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'serverfiles'));
  for (let i = 0; i < 40; i++) await fs.writeFile(path.join(root, 'serverfiles', `file-${i}`), 'test');
  await fs.symlink('file-0', path.join(root, 'serverfiles', 'link'));
  assert.equal(await countArchiveEntries(root, ['serverfiles']), 42);
  const updates: OperationProgress[] = [];
  await archiveWithProgress(root, ['serverfiles'], path.join(root, 'backup.tar.gz'), new AbortController().signal, async p => { updates.push(p); });
  assert.deepEqual(await validateNativeArchive(path.join(root, 'backup.tar.gz')), ['serverfiles']);
  const percentages = updates.filter(p => p.stage === 'backup').map(p => p.percent!);
  assert.equal(percentages[0], 0); assert.equal(percentages.at(-1), 100);
  assert.ok(percentages.some(p => p > 0 && p < 100));
  assert.deepEqual(percentages, [...percentages].sort((a,b) => a-b));
  updates.length = 0;
  await assert.rejects(archiveWithProgress(root, ['serverfiles'], path.join(root, 'missing/backup.tar.gz'), new AbortController().signal, async p => { updates.push(p); }));
  assert.ok(!updates.some(p => p.percent === 100));
});

test('addon job persists progress, emits console markers and records completion or failure', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'addon-job-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const messages: string[] = []; let released = 0;
  const jobs = loadWithMocks('../src/services/backupJobs.ts', {
    'node:fs': { promises: fs }, 'node:path': path, 'node:crypto': { randomUUID },
    '../utils/storage.js': { getServerStoragePaths: () => ({ serverRoot: root }) },
    './nativeOperationLock.js': { acquireNativeOperation: () => () => released++ },
    './nativeRestoreJournal.js': { syncDirectory: async () => {} },
    '../database/index.js': { actionsRepository: { create: async (_id: number, _level: string, message: string) => messages.push(message) } },
  }, { console, Error });
  const job = await jobs.startBackupJob(1, 'addon', 'tester', async (report: any) => {
    await report({ stage: 'backup', message: 'Backup: archiving entries', percent: 35 });
    assert.equal((await jobs.readBackupJob(1, job.id)).progress.percent, 35);
    await report({ stage: 'install-amxx', message: 'Installing AMX Mod X', percent: 50 });
    return { ok: true, exitCode: 0 };
  });
  for (let i = 0; i < 100 && !released; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await jobs.readBackupJob(1, job.id)).status, 'completed');
  assert.ok(messages.some(message => message.includes('[GamePanel] Addons: Backup: archiving entries - 35%')));
  assert.ok(messages.some(message => message.includes('Installation completed')));
  const failed = await jobs.startBackupJob(1, 'addon', 'tester', async () => { throw new Error('Checksum mismatch'); });
  for (let i = 0; i < 100 && released < 2; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await jobs.readBackupJob(1, failed.id)).status, 'failed');
  assert.ok(messages.some(message => message.includes('[GamePanel] Addons: addon failed: Checksum mismatch')));
});
