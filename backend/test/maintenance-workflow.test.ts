import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWithMocks } from './loadWithMocks.js';
function fixture(failure = '') {
  let saved: any;
  let container = 'running';
  const calls: string[] = [];
  const server: any = { id: 8, docker_container_id: 'game', status: 'running', runtime_config_json: '{}' };
  const subject = loadWithMocks('../src/services/maintenanceWorkflow.ts', {
    '../database/init.js': { getDatabase: async () => ({ exec: async () => {}, run: async (_sql: string, _task: number, _server: number, json: string) => { saved = JSON.parse(json); }, all: async () => saved ? [{ payload_json: JSON.stringify(saved) }] : [] }) },
    '../database/index.js': { serverRepository: { findById: async () => server, update: async (_id: number, value: any) => Object.assign(server, value), updateDesiredState: async (_id: number, value: string) => { server.desired_state = value; }, markFailed: async () => { server.status = 'failed'; } } },
    './nativeBackups.js': { nativeServerTemplate: () => ({ lifecycle: { update: ['fixture'] } }), createNativeBackup: async () => { calls.push('backup'); if (failure === 'backup') throw new Error('backup unavailable'); return { ok: true, name: 'before.tar.gz', stderr: '' }; } },
    './nativeUpdate.js': { startNativeUpdate: async () => { calls.push('update'); if (failure === 'update') { server.status = 'failed'; server.runtime_config_json = '{"nativeInterrupted":true}'; } } },
    './gameConsole.js': { sendGameConsoleCommand: async () => { calls.push('save'); return { ok: true }; } },
    '../utils/docker.js': { checkContainerStatus: async () => container, stopContainer: async () => { calls.push('stop'); container = 'exited'; }, startContainer: async () => { calls.push('start'); container = 'running'; } },
    '../utils/docker/client.js': { docker: { getContainer: () => ({ inspect: async () => ({ State: { Running: true }, NetworkSettings: { Networks: { games: { IPAddress: '127.0.0.1' } } } }) }) } },
    '../config.js': { getConfig: () => ({ gamesNetwork: 'games' }) },
    './gameMonitoring.js': { getMonitoringSettings: async () => ({ config: { enabled: true, queryPort: 27015 } }) },
    './gameQuery.js': { queryGame: async () => { calls.push('query'); return {}; } },
    './ovhcloudLifecycle.js': { getServerStopTimeoutSeconds: () => 30 },
  }, { setTimeout });
  return { subject, server, calls, saved: () => saved };
}
const plan = { version: 1, update: true, saveCommand: 'save-all', healthTimeoutSeconds: 120 };
test('maintenance persists ordered steps and a rollback backup before update/start/query', async () => {
  const f = fixture(); await f.subject.runMaintenance(f.server, 3, plan);
  assert.deepEqual(f.calls, ['save', 'stop', 'backup', 'update', 'start', 'query']);
  assert.equal(f.saved().status, 'success'); assert.equal(f.saved().backup, 'before.tar.gz');
  assert.ok(f.saved().steps.every((s: any) => s.status === 'success'));
  assert.equal(f.server.desired_state, 'running');
});
for (const failure of ['backup', 'update']) test(`maintenance never starts the game after ${failure} failure`, async () => {
  const f = fixture(failure); await assert.rejects(f.subject.runMaintenance(f.server, 3, plan));
  assert.equal(f.calls.includes('start'), false);
  assert.equal(f.calls.includes('query'), false);
  if (failure === 'backup') assert.equal(f.calls.includes('update'), false);
  assert.equal(f.server.desired_state, 'stopped'); assert.equal(f.saved().status, 'failed');
  assert.ok(f.saved().steps.some((s: any) => s.status === 'failed'));
});
test('maintenance rejects malformed command and timeout plans', () => {
  const f = fixture();
  assert.throws(() => f.subject.normalizeMaintenance({ ...plan, saveCommand: 'save\nquit' }));
  assert.throws(() => f.subject.normalizeMaintenance({ ...plan, healthTimeoutSeconds: 99999 }));
  assert.throws(() => f.subject.normalizeMaintenance({ ...plan, version: 2 }));
});
