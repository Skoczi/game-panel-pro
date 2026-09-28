import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MixqueueSupervisor,
  executorGeneration,
  type MixqueueAssignment,
  type MixqueueExecutor,
} from "../src/services/mixqueueSupervisor.js";

const a = "a".repeat(32),
  b = "b".repeat(32);
const assignment = (runtimeKey: string): MixqueueAssignment => ({
  runtimeKey,
  revision: "1",
  gameGeneration: "game-start-1",
  enabled: true,
  gameRunning: true,
});
function fixture() {
  const running = new Map<string, MixqueueExecutor>();
  const starts: string[] = [],
    stops: string[] = [];
  const failing = new Set<string>();
  let now = 0;
  const supervisor = new MixqueueSupervisor(
    {
      async list() {
        return new Map(running);
      },
      async start(item) {
        starts.push(item.runtimeKey);
        if (failing.has(item.runtimeKey))
          throw new Error("sensitive upstream error");
        running.set(item.runtimeKey, {
          running: true,
          generation: executorGeneration(item),
        });
      },
      async stop(key) {
        stops.push(key);
        running.delete(key);
      },
    },
    () => now,
  );
  return {
    supervisor,
    running,
    starts,
    stops,
    failing,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
test("concurrent reconciliations start exactly one executor per identity", async () => {
  const f = fixture();
  await Promise.all(
    Array.from({ length: 20 }, () =>
      f.supervisor.reconcile([assignment(a), assignment(b)]),
    ),
  );
  assert.deepEqual(f.starts, [a, b]);
});
test("one failed executor does not block its neighbour or leak errors", async () => {
  const f = fixture();
  f.failing.add(a);
  await f.supervisor.reconcile([assignment(a), assignment(b)]);
  assert.equal(f.running.has(b), true);
  assert.equal(f.supervisor.status(a).error, "executor_unavailable");
  await f.supervisor.reconcile([assignment(a), assignment(b)]);
  assert.deepEqual(f.starts, [a, b]);
  f.advance(1000);
  f.failing.delete(a);
  await f.supervisor.reconcile([assignment(a), assignment(b)]);
  assert.deepEqual(f.starts, [a, b, a]);
  assert.equal(f.supervisor.status(a).error, null);
});
test("stop, removal and game restart are isolated by runtime identity", async () => {
  const f = fixture();
  await f.supervisor.reconcile([assignment(a), assignment(b)]);
  await f.supervisor.reconcile([
    { ...assignment(a), gameRunning: false },
    assignment(b),
  ]);
  assert.deepEqual(f.stops, [a]);
  assert.equal(f.running.has(b), true);
  await f.supervisor.reconcile([
    { ...assignment(b), gameGeneration: "game-start-2" },
  ]);
  assert.deepEqual(f.stops, [a, b]);
  assert.deepEqual(f.starts, [a, b, b]);
  await f.supervisor.reconcile([]);
  assert.equal(f.running.size, 0);
});
test("an identity or credential revision restarts only that executor", async () => {
  const f = fixture();
  await f.supervisor.reconcile([assignment(a), assignment(b)]);
  await f.supervisor.reconcile([
    { ...assignment(a), revision: "2" },
    assignment(b),
  ]);
  assert.deepEqual(f.stops, [a]);
  assert.deepEqual(f.starts, [a, b, a]);
});
test("invalid or duplicate identities fail before touching containers", async () => {
  const f = fixture();
  await assert.rejects(f.supervisor.reconcile([assignment(a), assignment(a)]));
  await assert.rejects(f.supervisor.reconcile([assignment("../escape")]));
  assert.deepEqual(f.starts, []);
});
test("shutdown drains pending work, stops executors and rejects future starts", async () => {
  const f = fixture();
  await f.supervisor.reconcile([assignment(a)]);
  await f.supervisor.close();
  await f.supervisor.reconcile([assignment(b)]);
  assert.deepEqual(f.starts, [a]);
  assert.equal(f.running.size, 0);
});
