import { getDatabase } from '../database/init.js';
import { serverRepository } from '../database/index.js';
import { nativeServerTemplate, createNativeBackup } from './nativeBackups.js';
import { startNativeUpdate } from './nativeUpdate.js';
import { sendGameConsoleCommand } from './gameConsole.js';
import { checkContainerStatus, startContainer, stopContainer } from '../utils/docker.js';
import { docker } from '../utils/docker/client.js';
import { getConfig } from '../config.js';
import { getMonitoringSettings } from './gameMonitoring.js';
import { queryGame } from './gameQuery.js';
import { getServerStopTimeoutSeconds } from './ovhcloudLifecycle.js';
import type { GameServerRow } from '../types/gameServer.js';

export type MaintenancePlan = { version: 1; saveCommand?: string; update: boolean; healthTimeoutSeconds: number };
export type MaintenanceRun = { taskId: number; serverId: number; startedAt: string; status: string; backup?: string; steps: { name: string; status: string; startedAt?: string; completedAt?: string; detail?: string }[] };
export function normalizeMaintenance(value: unknown): MaintenancePlan {
  const p = value as MaintenancePlan;
  if (!p || typeof p !== 'object' || p.version !== 1 || typeof p.update !== 'boolean' || !Number.isInteger(p.healthTimeoutSeconds) || p.healthTimeoutSeconds < 15 || p.healthTimeoutSeconds > 600) throw Object.assign(new Error('Invalid maintenance plan'), { statusCode: 400 });
  if (p.saveCommand !== undefined && (typeof p.saveCommand !== 'string' || !p.saveCommand.trim() || p.saveCommand.length > 1000 || /[\0\r\n]/.test(p.saveCommand))) throw Object.assign(new Error('Invalid save command'), { statusCode: 400 });
  return { version: 1, update: p.update, healthTimeoutSeconds: p.healthTimeoutSeconds, ...(p.saveCommand ? { saveCommand: p.saveCommand.trim() } : {}) };
}
async function store() {
  const db = await getDatabase();
  await db.exec('CREATE TABLE IF NOT EXISTS maintenance_runs (task_id INTEGER PRIMARY KEY REFERENCES server_scheduled_tasks(id) ON DELETE CASCADE, server_id INTEGER NOT NULL REFERENCES game_servers(id) ON DELETE CASCADE, payload_json TEXT NOT NULL)');
  return db;
}
async function save(run: MaintenanceRun) {
  await (await store()).run('INSERT INTO maintenance_runs VALUES(?,?,?) ON CONFLICT(task_id) DO UPDATE SET server_id=excluded.server_id,payload_json=excluded.payload_json', run.taskId, run.serverId, JSON.stringify(run));
}
export async function maintenanceRuns(serverId: number): Promise<MaintenanceRun[]> {
  return (await (await store()).all('SELECT payload_json FROM maintenance_runs WHERE server_id=?', serverId)).map(row => JSON.parse(row.payload_json));
}
export async function interruptMaintenance(serverId: number, taskId: number) {
  const run = (await maintenanceRuns(serverId)).find(r => r.taskId === taskId);
  if (run?.status === 'running') {
    run.status = 'interrupted';
    for (const step of run.steps) if (step.status === 'running') { step.status = 'interrupted'; step.detail = 'Agent restarted; inspect the server and backup before retrying.'; }
    await save(run);
  }
}
export async function validateMaintenanceServer(server: GameServerRow, plan: MaintenancePlan) {
  const template = nativeServerTemplate(server);
  if (!template) throw Object.assign(new Error('Maintenance workflows require a Native server'), { statusCode: 400 });
  if (plan.update && !template.lifecycle?.update?.length) throw Object.assign(new Error('This template has no update recipe'), { statusCode: 400 });
  const monitoring = await getMonitoringSettings(server.id);
  if (!monitoring.config.enabled || !monitoring.config.queryPort) throw Object.assign(new Error('Enable the A2S game query before creating a maintenance workflow'), { statusCode: 400 });
  return monitoring.config.queryPort;
}
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
// Called while the scheduler owns the server mutation lock. Each native operation
// retains its own lock; no HTTP power/config write can interleave these steps.
export async function runMaintenance(server: GameServerRow & { docker_container_id: string }, taskId: number, plan: MaintenancePlan) {
  const port = await validateMaintenanceServer(server, plan);
  const run: MaintenanceRun = { taskId, serverId: server.id, startedAt: new Date().toISOString(), status: 'running', steps: [
    ...(plan.saveCommand ? ['Save game command'] : []), 'Stop game', 'Verified backup', ...(plan.update ? ['Update game'] : []), 'Start game', 'Game query health check',
  ].map(name => ({ name, status: 'pending' })) };
  await save(run);
  let index = 0;
  async function step(action: () => Promise<string | void>) {
    const current = run.steps[index++]; current.status = 'running'; current.startedAt = new Date().toISOString(); await save(run);
    try { current.detail = await action() || undefined; current.status = 'success'; current.completedAt = new Date().toISOString(); await save(run); }
    catch (error) { current.status = 'failed'; current.detail = (error as Error).message.slice(0, 1000); current.completedAt = new Date().toISOString(); run.status = 'failed'; await save(run); throw error; }
  }
  try {
    if (plan.saveCommand) await step(async () => {
      const result = await sendGameConsoleCommand(server, plan.saveCommand!);
      if (!result.ok) throw new Error('Save command could not be delivered');
      return 'Command delivered; the game is then stopped before the consistent backup.';
    });
    await step(async () => {
      await serverRepository.updateDesiredState(server.id, 'stopped');
      await stopContainer(server.docker_container_id, getServerStopTimeoutSeconds(server));
      if (!['exited', 'created'].includes(await checkContainerStatus(server.docker_container_id))) throw new Error('Game did not stop');
      await serverRepository.update(server.id, { status: 'stopped' });
    });
    await step(async () => {
      const result = await createNativeBackup(server, false, 'Before-maintenance');
      if (!result.ok || result.stderr) throw new Error('Verified pre-maintenance backup failed');
      run.backup = result.name; return result.name;
    });
    if (plan.update) await step(async () => {
      await startNativeUpdate(server.id, 'scheduler');
      const deadline = Date.now() + 2 * 60 * 60 * 1000;
      while (Date.now() < deadline) {
        const fresh = await serverRepository.findById(server.id);
        if (!fresh) throw new Error('Server disappeared during update');
        const runtime = JSON.parse(fresh.runtime_config_json || '{}');
        if (!runtime.nativeOperation) {
          if (runtime.nativeInterrupted || fresh.status === 'failed') throw new Error(fresh.last_error || 'Native update failed; restore the pre-maintenance backup before restarting');
          return;
        }
        await delay(2000);
      }
      throw new Error('Update timed out; inspect its worker before further changes');
    });
    await step(async () => {
      await serverRepository.updateDesiredState(server.id, 'running');
      await startContainer(server.docker_container_id);
      await serverRepository.update(server.id, { status: 'starting' });
    });
    await step(async () => {
      const deadline = Date.now() + plan.healthTimeoutSeconds * 1000;
      while (Date.now() < deadline) {
        const runtime = await docker.getContainer(server.docker_container_id).inspect();
        if (!runtime.State.Running) throw new Error('Game exited before its health check');
        const host = runtime.NetworkSettings.Networks[getConfig().gamesNetwork]?.IPAddress;
        if (host) {
          try {
            await queryGame(host, port, 1500);
            await serverRepository.update(server.id, { status: 'running', last_error: null });
            return 'A2S game query answered after restart';
          } catch { /* Allow the bounded startup interval. */ }
        }
        await delay(2000);
      }
      throw new Error('Game query did not recover within the startup deadline');
    });
    run.status = 'success'; await save(run);
  } catch (error) {
    // Never start a partially updated game or retry non-idempotent steps automatically.
    await serverRepository.updateDesiredState(server.id, 'stopped');
    if (await checkContainerStatus(server.docker_container_id) === 'running') await stopContainer(server.docker_container_id, getServerStopTimeoutSeconds(server));
    await serverRepository.markFailed(server.id, (error as Error).message);
    throw error;
  }
}
