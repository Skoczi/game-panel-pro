import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWithMocks } from './loadWithMocks.js';
test('Native API installation prepares files and creates a stopped container without starting a game', async () => {
    const calls: string[] = [], row: any = { desired_state: 'stopped' };
    const repo = { findById: async () => row, update: async (_id: number,p: any) => Object.assign(row,p), updateDockerInfo: async () => calls.push('container-recorded'), markFailed: async () => calls.push('failed') };
    const service = loadWithMocks('../src/services/servers.ts', {
        './serverSftp.js': {}, './sharedFiles.js': { recordSharedDependencies: async () => {} }, 'node:path': path,
        '../database/index.js': { serverRepository: repo, installProgressRepository: { update: async (_id: number,p: number,s: string) => calls.push(`${p}:${s}`) }, actionsRepository: { create: async () => {} }, installInteractionRepository: {} },
        '../utils/docker.js': { buildManagedContainerName: () => 'test', imageExists: async () => true, createContainer: async (config: any) => { assert.equal(config.start,false); calls.push('create'); return { id:'container',name:'test' }; }, startContainer: async () => calls.push('GAME STARTED') },
        '../providers/linuxgsm/adapters/linuxGsmConfig.js': {}, '../providers/linuxgsm/adapters/registry.js': {}, '../realtime/bus.js': {},
        '../utils/storage.js': { ensureServerDataDirs: async () => ({ dataDir:'/isolated' }), ensureServerMountDirs: async () => [] }, '../utils/logger.js': { logError: (_s: string,e: Error) => { throw e; } }, '../utils/time.js': {},
        '../templates/nativeContract.js': { nativeTemplate: () => ({ mounts:[] }), nativeEnvironment: () => ({}), nativeContainerOptions: () => ({}) },
        './nativeOperationLock.js': { acquireNativeOperation: () => () => calls.push('released') },
        './nativeRuntime.js': { NativeCleanupError: class extends Error {}, runNativeSteps: async () => calls.push('files-installed') },
        '../utils/docker/client.js': { docker: { getImage: () => ({ inspect: async () => ({ Id:'image-digest' }) }) } },
        './serverTransitions.js': {}, './telemetry.js': {}, './ovhcloudLifecycle.js': { installOvhcloudServerIfHandled: async () => false, getOvhcloudInstallRestartPolicy: () => null },
        './serverActionPolicy.js': { assertServerExistsDuringInstall: async () => {}, serverExists: async () => true, ServerInstallCancelledError: class extends Error {} },
    });
    await service.installServerAsync(101,'DD2',{ provider:'external',providerMetadata:{},runtimeConfig:{nativeOperation:'install',apiProvisionId:'operation'},dockerImage:'image',runtimeIdentity:{uid:1000,gid:1000},mounts:[],env:[],ports:{} },'api-user:1');
    assert(calls.includes('files-installed')); assert(calls.includes('create')); assert(calls.includes('100:completed'));
    assert(!calls.includes('GAME STARTED')); assert.equal(row.status,'stopped'); assert.equal(row.container_status,'created');
    assert.equal(JSON.parse(row.runtime_config_json).apiProvisionId,'operation'); assert(calls.includes('released'));
});
