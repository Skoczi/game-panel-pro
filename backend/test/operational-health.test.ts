import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { OperationalHealthStore, diskHealth, backupAgeHealth, type OperationalCheck } from '../src/services/operationalHealthStore.js';

test('disk and backup thresholds distinguish missing, stale and invalid measurements', () => {
  const gb = 1024 ** 3, now = Date.now(), hour = 3600000;
  assert.equal(diskHealth(49 * gb, 108 * gb), 'ok');
  assert.equal(diskHealth(14 * gb, 100 * gb), 'warning');
  assert.equal(diskHealth(4 * gb, 100 * gb), 'critical');
  assert.equal(diskHealth(1 * gb, 10 * gb), 'critical');
  assert.equal(diskHealth(0, 0), 'unknown');
  assert.equal(backupAgeHealth(null, now), 'critical');
  assert.equal(backupAgeHealth(now - 35 * hour, now), 'ok');
  assert.equal(backupAgeHealth(now - 36 * hour, now), 'warning');
  assert.equal(backupAgeHealth(now - 72 * hour, now), 'critical');
  assert.equal(backupAgeHealth(now + hour, now), 'unknown');
});

test('operational incidents persist across restart, notify only changes and retry queue failures', async t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  const adapter: any = { exec: async (s: string) => db.exec(s), get: async (s: string, ...a: any[]) => db.prepare(s).get(...a),
    all: async (s: string, ...a: any[]) => db.prepare(s).all(...a), run: async (s: string, ...a: any[]) => db.prepare(s).run(...a) };
  let store = new OperationalHealthStore(adapter); await store.initialize();
  const check: OperationalCheck = { key: 'disk', category: 'storage', title: 'Disk', detail: 'test', status: 'ok', observedAt: 1000 };
  const events: string[] = []; const notify = async (c: OperationalCheck, recovered: boolean) => { events.push(`${c.status}:${recovered}`); };
  await store.save([check], notify); assert.deepEqual(events, []);
  check.status = 'warning'; await store.save([check], notify);
  store = new OperationalHealthStore(adapter); await store.initialize();
  await store.save([check], notify); assert.deepEqual(events, ['warning:false']);
  check.status = 'ok'; await store.save([check], notify); assert.deepEqual(events, ['warning:false', 'ok:true']);
  assert.equal((await store.snapshot(182000)).checks[0].status, 'unknown');
  check.status = 'critical'; await assert.rejects(store.save([check], async () => { throw new Error('queue failed'); }));
  await store.save([check], notify); assert.equal(events.at(-1), 'critical:false');
  check.notify = false; check.status = 'warning'; const before = events.length;
  await store.save([check], notify); assert.equal(events.length, before);
  await store.save([], notify); assert.equal((await store.snapshot()).checks.length, 0);
});
