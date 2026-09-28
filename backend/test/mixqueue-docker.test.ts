import { test } from "node:test";
import assert from "node:assert/strict";
import { executorContainerOptions } from "../src/services/mixqueueDocker.js";

test("executor has only per-server mounts and no network or credentials", () => {
  const config = executorContainerOptions(
    "test-node",
    {
      runtimeKey: "a".repeat(32),
      revision: "1",
      enabled: true,
      gameRunning: true,
      gameGeneration: "one",
    },
    {
      image: "sha256:" + "b".repeat(64),
      engine: "amxmodx",
      configDirectory: "/games/100/mq2/config",
      journalDirectory: "/games/100/mq2/data",
      stateDirectory: "/private/100/state",
      brokerDirectory: "/private/100/broker",
    },
  );
  assert.equal(config.HostConfig?.NetworkMode, "none");
  assert.equal(config.HostConfig?.ReadonlyRootfs, true);
  assert.deepEqual(config.HostConfig?.CapDrop, ["ALL"]);
  assert.deepEqual(config.HostConfig?.RestartPolicy, { Name: "no" });
  assert.equal(config.Env, undefined);
  assert.equal(config.Labels?.["gamepanel.managed"], undefined);
  assert.deepEqual(
    config.HostConfig?.Mounts?.map((m) => [m.Target, m.ReadOnly]),
    [
      ["/game/addons/amxmodx/configs/mq2", false],
      ["/journal", true],
      ["/state", false],
      ["/broker", true],
    ],
  );
});
