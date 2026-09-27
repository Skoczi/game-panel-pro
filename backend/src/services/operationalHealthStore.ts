import type { Database } from 'sqlite';
export type HealthStatus = 'ok' | 'warning' | 'critical' | 'unknown';
export type OperationalCheck = { key: string; category: 'storage' | 'backup' | 'game' | 'schedule'; notify?: boolean; title: string; status: HealthStatus; detail: string; serverId?: number; observedAt: number };
export function diskHealth(freeBytes: number, totalBytes: number): HealthStatus {
  if (!Number.isFinite(freeBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0 || freeBytes < 0 || freeBytes > totalBytes) return 'unknown';
  const used = 1 - freeBytes / totalBytes;
  return used >= .95 || freeBytes < 2 * 1024 ** 3 ? 'critical' : used >= .85 || freeBytes < 8 * 1024 ** 3 ? 'warning' : 'ok';
}
export function backupAgeHealth(lastSuccess: number | null, now: number): HealthStatus {
  if (lastSuccess === null) return 'critical';
  if (!Number.isFinite(lastSuccess) || lastSuccess > now + 60000) return 'unknown';
  return now - lastSuccess >= 72 * 3600000 ? 'critical' : now - lastSuccess >= 36 * 3600000 ? 'warning' : 'ok';
}
export class OperationalHealthStore {
  constructor(private db: Database) {}
  async initialize() {
    await this.db.exec('CREATE TABLE IF NOT EXISTS operational_health_checks (key TEXT PRIMARY KEY, payload_json TEXT NOT NULL, status TEXT NOT NULL, since INTEGER NOT NULL, observed_at INTEGER NOT NULL)');
  }
  async save(checks: OperationalCheck[], notify: (check: OperationalCheck, recovered: boolean) => Promise<void>) {
    for (const check of checks) {
      const old = await this.db.get('SELECT status,since FROM operational_health_checks WHERE key=?', check.key);
      const changed = old?.status !== check.status;
      // Queue notification before updating state; a queue failure must be retried.
      if (check.notify !== false && changed && (check.status !== 'ok' || old)) await notify(check, check.status === 'ok');
      await this.db.run('INSERT INTO operational_health_checks VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload_json=excluded.payload_json,status=excluded.status,since=excluded.since,observed_at=excluded.observed_at',
        check.key, JSON.stringify(check), check.status, changed ? check.observedAt : old.since, check.observedAt);
    }
    const present = new Set(checks.map(c => c.key));
    for (const row of await this.db.all('SELECT key FROM operational_health_checks')) if (!present.has(row.key)) await this.db.run('DELETE FROM operational_health_checks WHERE key=?', row.key);
  }
  async snapshot(now = Date.now()) {
    const rows = await this.db.all('SELECT payload_json,since,observed_at FROM operational_health_checks ORDER BY key');
    return { observedAt: rows.length ? Math.min(...rows.map(r => r.observed_at)) : null,
      checks: rows.map(row => { const check: OperationalCheck = JSON.parse(row.payload_json); return { ...check, since: row.since,
        ...(now - row.observed_at > 180000 ? { status: 'unknown' as const, detail: 'Operational measurements are stale. Check the runtime.' } : {}) }; }) };
  }
}
