import { getMonitoringSummary } from './gameMonitoring.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';
import { getDatabase } from '../database/init.js';
import { serverRepository, scheduledTaskRepository } from '../database/index.js';
import { isAgent } from '../agent/identity.js';
import { nativeServerTemplate } from './nativeBackups.js';
import { readNativeBackupRecord } from './nativeProtection.js';
import { readNativeBackupPolicy } from './nativeBackupPolicy.js';
import { listExternalBackups } from './externalBackups.js';
import { getServerStoragePaths } from '../utils/storage.js';
import { alertStore } from './alerts.js';
import { logError } from '../utils/logger.js';
import { diskHealth, backupAgeHealth, OperationalHealthStore, type OperationalCheck } from './operationalHealthStore.js';

let storePromise: Promise<OperationalHealthStore> | undefined;
export function operationalHealthStore() {
  return storePromise ??= getDatabase().then(async db => { const store = new OperationalHealthStore(db); await store.initialize(); return store; }).catch(error => { storePromise = undefined; throw error; });
}
const ageDetail = (date: number | null, now: number) => date === null ? 'No verified recovery point.' : `Last verified recovery point: ${new Date(date).toISOString()} (${Math.max(0, Math.floor((now - date) / 3600000))} hours ago).`;
export async function collectOperationalHealth(): Promise<OperationalCheck[]> {
  const now = Date.now(), checks: OperationalCheck[] = [];
  const add = (check: Omit<OperationalCheck, 'observedAt'>) => checks.push({ ...check, observedAt: now });
  try {
    const stat = await fs.statfs(getConfig().gamepanelServersDir);
    const free = Number(stat.bavail) * Number(stat.bsize), total = Number(stat.blocks) * Number(stat.bsize);
    add({ key: 'disk', category: 'storage', title: 'Runtime disk space', status: diskHealth(free, total), detail: `${(free / 1024 ** 3).toFixed(1)} GiB available; ${(100 * (1 - free / total)).toFixed(1)}% used.` });
  } catch { add({ key: 'disk', category: 'storage', title: 'Runtime disk space', status: 'unknown', detail: 'Disk measurement unavailable.' }); }
  for (const server of await serverRepository.listAll()) {
    const base = { category: 'backup' as const, serverId: server.id };
    try {
      const monitoring = await getMonitoringSummary(server);
      if (monitoring.enabled) add({ key: `game:${server.id}`, category: 'game', notify: false, serverId: server.id,
        title: `${server.name} · game response`, status: monitoring.state === 'offline' ? 'critical' : ['online', 'stopped', 'starting'].includes(monitoring.state) ? 'ok' : 'unknown',
        detail: `Game monitoring: ${monitoring.state}.` });
      for (const task of await scheduledTaskRepository.listForServer(server.id)) {
        add({ key: `task:${task.id}`, category: 'schedule', notify: false, serverId: server.id,
          title: `${server.name} · ${task.type} schedule #${task.id}`, status: task.last_status === 'failed' ? 'warning' : 'ok',
          detail: task.last_status === 'failed' ? 'Last run failed. Open schedules to review the result before retrying.' : task.last_run_at ? `Last run: ${task.last_status} at ${task.last_run_at}.` : 'No completed runs yet.' });
      }
    } catch { add({ key: `runtime:${server.id}`, category: 'game', notify: false, serverId: server.id, title: `${server.name} · runtime checks`, status: 'unknown', detail: 'Game and schedule measurements unavailable.' }); }

    try {
      if (!nativeServerTemplate(server)) continue;
      const directory = path.join(getServerStoragePaths(server.id).dataDir, 'backups');
      const entries = await fs.readdir(directory, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
      if (entries.length > 2000) throw new Error('Inventory too large');
      let latest: number | null = null;
      for (const entry of entries) if (entry.isFile() && entry.name.endsWith('.tar.gz')) {
        const record = await readNativeBackupRecord(path.join(directory, entry.name));
        if (record) latest = Math.max(latest || 0, Date.parse(record.createdAt));
      }
      add({ ...base, key: `backup:${server.id}`, title: `${server.name} Â· local backup`, status: backupAgeHealth(latest, now), detail: ageDetail(latest, now) });
      const tasks = await scheduledTaskRepository.listForServer(server.id);
      const enabled = tasks.some(task => task.type === 'backup' && task.enabled);
      add({ ...base, key: `schedule:${server.id}`, title: `${server.name} Â· backup schedule`, status: enabled ? 'ok' : 'warning', detail: enabled ? 'Automatic backup schedule enabled.' : 'No enabled backup schedule.' });
      const policy = await readNativeBackupPolicy(server.id);
      if (policy.externalCopy) {
        try {
          const copies = await listExternalBackups(server), latest = copies.length ? Math.max(...copies.map(copy => Date.parse(copy.createdAt))) : null;
          add({ ...base, key: `external:${server.id}`, title: `${server.name} Â· external backup`, status: backupAgeHealth(latest, now), detail: ageDetail(latest, now) });
        } catch { add({ ...base, key: `external:${server.id}`, title: `${server.name} Â· external backup`, status: 'unknown', detail: 'External backup storage could not be inspected.' }); }
      } else add({ ...base, key: `external:${server.id}`, title: `${server.name} Â· external backup`, status: 'warning', detail: 'External copies are disabled.' });
    } catch { add({ ...base, key: `backup:${server.id}`, title: `${server.name} Â· backup protection`, status: 'unknown', detail: 'Backup protection could not be inspected.' }); }
  }
  if (process.env.GAMEPANEL_CONTROL_BACKUP_STATUS) {
    try {
      const report = JSON.parse(await fs.readFile(process.env.GAMEPANEL_CONTROL_BACKUP_STATUS, 'utf8'));
      const stamp = /^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/.exec(report.at);
      if (!stamp || !Array.isArray(report.backups)) throw new Error('Invalid backup receipt');
      const last = Date.parse(`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`);
      for (const host of ['fr1', 'waw1', 'waw2']) {
        const verified = report.backups.some((r: any) => typeof r.name === 'string' && r.name.startsWith(host + '-') && r.sqliteIntegrity === 'ok');
        add({ key: 'control-backup:' + host, category: 'backup', title: `${host.toUpperCase()} Â· control-plane backup`, status: backupAgeHealth(verified ? last : null, now), detail: ageDetail(verified ? last : null, now) });
      }
    } catch { add({ key: 'control-backup', category: 'backup', title: 'Control-plane backup', status: 'unknown', detail: 'Backup verification receipt unavailable.' }); }
  }
  return checks;
}
export function startOperationalHealthWorker() {
  let busy = false, stopped = false;
  const tick = async () => {
    if (busy || stopped) return; busy = true;
    try {
      const checks = await collectOperationalHealth(), store = await operationalHealthStore(), alerts = await alertStore();
      if (!stopped) await store.save(checks, async (check, recovered) => { await alerts.create(check.category,
        `${recovered ? 'Resolved' : check.status.toUpperCase()}: ${check.title}`, check.detail, isAgent() ? 'agent-outbox' : 'local'); });
    } catch (error) { logError('OPERATIONAL:HEALTH', error); }
    finally { busy = false; }
  };
  void tick(); const timer = setInterval(() => void tick(), 60000);
  return { stop() { stopped = true; clearInterval(timer); } };
}
