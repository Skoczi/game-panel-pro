import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { loadWithMocks } from "./loadWithMocks.js";
import { validateDelegation, delegatedPath } from "../src/nodes/delegation.js";

test("server control requires owner/operator capability; server capability cannot install a node runtime", async (t) => {
  let user: any = { isRoot: false },
    reads = 0,
    changes = 0,
    installs = 0;
  const routes = loadWithMocks("../src/routes/mixqueue.ts", {
    express,
    "../middleware/auth.js": {
      rootOnly: (req: any, res: any, next: any) =>
        req.user?.isRoot ? next() : res.sendStatus(403),
    },
    "../services/mixqueue.js": {
      mixqueueStatus: async () => {
        reads++;
        return { enabled: false };
      },
      changeMixqueue: async () => {
        changes++;
        return { enabled: false };
      },
      safeError: () => "operation_failed",
    },
    "../services/mixqueueNode.js": {
      mixqueueNodeStatus: async () => ({ installed: false }),
      installMixqueueNode: () => {
        installs++;
      },
    },
  });
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = user;
    next();
  });
  app.use("/api/servers/:id/mixqueue", routes.mixqueueServerRoutes);
  app.use("/api/system/mixqueue", routes.mixqueueNodeRoutes);
  const listener = app.listen(0, "127.0.0.1");
  t.after(() => listener.close());
  await new Promise<void>((resolve) => listener.once("listening", resolve));
  const url = "http://127.0.0.1:" + (listener.address() as any).port;
  for (const method of ["GET", "POST"])
    assert.equal(
      (await fetch(url + "/api/servers/1/mixqueue", { method })).status,
      403,
    );
  assert.equal(reads + changes, 0);
  user = { isRoot: false, delegation: { mixqueueOperator: true } };
  assert.equal((await fetch(url + "/api/servers/1/mixqueue")).status, 200);
  assert.equal(
    (await fetch(url + "/api/servers/1/mixqueue", { method: "POST" })).status,
    200,
  );
  assert.equal(
    (
      await fetch(url + "/api/system/mixqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"action":"install"}',
      })
    ).status,
    403,
  );
  assert.equal(installs, 0);
  user = { isRoot: true };
  assert.equal(
    (
      await fetch(url + "/api/system/mixqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"action":"install"}',
      })
    ).status,
    202,
  );
  assert.equal(installs, 1);
});
test("signed operator capability is still bound to one server and cannot reach node settings", () => {
  const scope = validateDelegation({
    actorId: 1,
    serverId: 100,
    runtimeKey: "a".repeat(32),
    permissions: [],
    mixqueueOperator: true,
  });
  assert.equal(delegatedPath("/api/servers/100/mixqueue", scope, "POST"), true);
  assert.equal(
    delegatedPath("/api/servers/101/mixqueue", scope, "POST"),
    false,
  );
  assert.equal(delegatedPath("/api/system/mixqueue", scope, "POST"), false);
  assert.throws(() =>
    validateDelegation({ ...scope, mixqueueOperator: "true" }),
  );
});
