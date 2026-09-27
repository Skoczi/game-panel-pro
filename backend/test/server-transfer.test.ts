import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import * as stream from 'node:stream';
import * as promises from 'node:stream/promises';
import { loadWithMocks } from './loadWithMocks.js';
const packet = () => ({ version: 1, exportId: crypto.randomUUID(), source: { runtime_uuid: 'a'.repeat(32) }, archive: { name: 'native-test.tar.gz', size: 3, sha256: crypto.createHash('sha256').update('abc').digest('hex') } });
function fixture(directory = '') {
  let failed = 0, restored = 0, locked = false;
  const expected = packet().archive;
  const subject = loadWithMocks('../src/services/serverTransfer.ts', {
    'node:fs': fs, 'node:path': path, 'node:crypto': crypto, 'node:stream': stream, 'node:stream/promises': promises,
    './serverClone.js': { archiveHash: async (p: string) => crypto.createHash('sha256').update(await fs.promises.readFile(p)).digest('hex'), failClone: async () => { failed++; }, populateClone: async () => { restored++; return { ok: true }; } },
    '../database/index.js': { serverRepository: { findById: async () => ({ id: 1, runtime_uuid: 'a'.repeat(32), status: 'creating', runtime_config_json: JSON.stringify({ cloneImport: expected }) }) } },
    './nativeBackups.js': { nativeBackupDirectory: async () => directory },
    '../utils/storage.js': {}, '../utils/docker.js': {}, '../utils/docker/client.js': {},
    './nativeOperationLock.js': { acquireNativeOperation: () => { assert.equal(locked, false); locked = true; return () => { locked = false; }; } },
    './storageReserve.js': { withStorageReserve: async (_p: string, fn: any) => fn(new AbortController().signal) },
    './nativeRestoreJournal.js': { syncDirectory: async () => {} },
    './backupJobs.js': { startBackupJob: async (_id: number, _kind: string, _actor: string, run: any) => { assert.equal(locked, false); return run(); } },
  }, { Buffer });
  return { subject, failed: () => failed, restored: () => restored, locked: () => locked };
}
test('transfer manifest rejects traversal, missing identity, invalid hashes and unbounded archive sizes', () => {
  const { subject } = fixture();
  for (const change of [{ name: '../native-x.tar.gz' }, { name: 'native-../x.tar.gz' }, { size: 0 }, { size: 51 * 1024 ** 3 }, { sha256: 'bad' }]) {
    const p = packet(); Object.assign(p.archive, change); assert.throws(() => subject.validateTransferPacket(p), /Invalid transfer/);
  }
  const p = packet(); p.source.runtime_uuid = 'old-id'; assert.throws(() => subject.validateTransferPacket(p));
  assert.equal(subject.validateTransferPacket(packet()).archive.size, 3);
});
test('checksum failure quarantines destination and never restores it', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'transfer-'));
  try {
    const f = fixture(dir);
    await assert.rejects(f.subject.receiveTransfer(1, 'a'.repeat(32), 3, stream.Readable.from(['xyz']), 'test'), /checksum/);
    assert.equal(f.failed(), 1); assert.equal(f.restored(), 0); assert.equal(f.locked(), false);
    assert.equal(fs.existsSync(path.join(dir, 'native-test.tar.gz')), false);
  } finally { await fs.promises.rm(dir, { recursive: true, force: true }); }
});
test('verified upload alone can hand off to restore; stale identity writes nothing', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'transfer-'));
  try {
    const f = fixture(dir);
    await assert.rejects(f.subject.receiveTransfer(1, 'wrong', 3, stream.Readable.from(['abc']), 'test'), /identity/);
    assert.equal((await fs.promises.readdir(dir)).length, 0); assert.equal(f.failed(), 0);
    await f.subject.receiveTransfer(1, 'a'.repeat(32), 3, stream.Readable.from(['abc']), 'test');
    assert.equal(f.restored(), 1); assert.equal(f.failed(), 0); assert.equal(f.locked(), false);
  } finally { await fs.promises.rm(dir, { recursive: true, force: true }); }
});
