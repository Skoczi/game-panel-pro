import * as sharedFiles from '../src/services/sharedFiles.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { loadWithMocks } from './loadWithMocks.js';
function fixture() {
  let creates = 0;
  const server: any = { id: 8, runtime_uuid: 'source-key', docker_container_id: 'source', provider_metadata_json: '{}', runtime_config_json: '{}', ports_json: '{}', env_json: '[]', mounts_json: '[]' };
  const empty = Object.fromEntries(['node:fs', 'node:path', 'node:stream/promises', './nativeImages.js', './nativeRestore.js', './nativeProtection.js', './nativeOperationLock.js', './portAllocationLock.js', './hostPortAvailability.js', './cpuTopology.js', './storageReserve.js', '../utils/storage.js', '../templates/nativeContract.js', '../utils/ports.js', '../providers/runtimeConfig.js', '../utils/docker/client.js', './nativeRestoreJournal.js'].map(name => [name, {}]));
  const subject = loadWithMocks('../src/services/serverClone.ts', { './sharedFiles.js': sharedFiles, ...empty,
    'node:crypto': crypto,
    '../database/index.js': { serverRepository: { findById: async () => server, create: async () => { creates++; return 9; } } },
    './nativeBackups.js': { nativeServerTemplate: () => ({ mounts: [{ key: 'data', containerPath: '/data' }] }) },
    '../providers/runtimeConfig.js': { parseStoredMounts: () => [{ key: 'data', containerPath: '/data' }] },
    '../utils/docker.js': { checkContainerStatus: async () => 'running' },
  });
  return { subject, server, creates: () => creates };
}
test('clone rejects stale runtime identity before accessing game data', async () => {
  const f = fixture(); await assert.rejects(f.subject.cloneSource(8, 'reused-id'), /identity changed/); assert.equal(f.creates(), 0);
});
test('clone rejects running source before reserving a target', async () => {
  const f = fixture(); await assert.rejects(f.subject.cloneServer(8, 'source-key', { fingerprint: f.subject.cloneFingerprint(f.server) }, 'operator'), /Stop the source/); assert.equal(f.creates(), 0);
});
test('clone review fingerprint changes with configuration and rejects pending settings', async () => {
  const f = fixture(), original = f.subject.cloneFingerprint(f.server);
  f.server.env_json = '["MAP=de_dust2"]'; assert.notEqual(f.subject.cloneFingerprint(f.server), original);
  f.server.provider_metadata_json = '{"pendingConfiguration":{"ports":{}}}';
  await assert.rejects(f.subject.cloneSource(8, 'source-key'), /pending server settings/);
});
