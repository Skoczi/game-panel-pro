import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import Docker from "dockerode";
import { MixqueueDockerRuntime } from "../../src/services/mixqueueDocker.js";
import {
  MixqueueSupervisor,
  type MixqueueAssignment,
} from "../../src/services/mixqueueSupervisor.js";
import { startMixqueueBroker } from "../../src/services/mixqueueBroker.js";

test(
  "one supervisor runs two isolated Python executors with independent journal faults and restart",
  { skip: !process.env.MIXQUEUE_TEST_IMAGE, timeout: 60000 },
  async (t) => {
    const docker = new Docker();
    const image = (
      await docker.getImage(process.env.MIXQUEUE_TEST_IMAGE!).inspect()
    ).Id;
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gp-mq2-"));
    const nodeId = "mq-test-" + randomBytes(4).toString("hex");
    const keys = [
      randomBytes(16).toString("hex"),
      randomBytes(16).toString("hex"),
    ];
    const secrets = new Map(
      keys.map((key) => [key, randomBytes(32).toString("base64url")]),
    );
    const brokers = new Map<
      string,
      Awaited<ReturnType<typeof startMixqueueBroker>>
    >();
    const requests: Array<{ id: string; action: string; healthy?: boolean }> =
      [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url, options) => {
      assert.equal(url, "https://csco.gg/mq2-agent");
      assert.equal(options?.redirect, "error");
      const headers = options!.headers as Record<string, string>;
      const id = headers["X-MQ-Server"],
        raw = String(options!.body);
      assert.equal(
        headers["X-MQ-Signature"],
        createHmac("sha256", secrets.get(id)!)
          .update(id + "\n" + headers["X-MQ-Time"] + "\n" + raw)
          .digest("hex"),
      );
      const body = JSON.parse(raw);
      requests.push({ id, action: body.action, healthy: body.healthy });
      return new Response(JSON.stringify({ commands: [] }), { status: 200 });
    }) as typeof fetch;
    const closeBroker = async (key: string) => {
      await brokers.get(key)?.close();
      brokers.delete(key);
    };
    const runtime = new MixqueueDockerRuntime(
      docker,
      nodeId,
      async (a) => {
        const base = path.join(root, a.runtimeKey);
        for (const name of ["config", "journal", "state", "broker"])
          await fs.mkdir(path.join(base, name), { recursive: true });
        await fs.writeFile(
          path.join(base, "broker", "config.json"),
          JSON.stringify({
            server_id: a.runtimeKey,
            game: "cs16",
            adapter: "amxx",
            verified_build: "",
            api: "https://csco.gg/mq2-agent",
            key_env: "MQ2_AGENT_KEY",
            rcon_password_env: "MQ2_RCON_PASSWORD",
            rcon_port: 27015,
            game_root: "/game",
            journal: "/journal/events.jsonl",
            database: "/state/spool.sqlite",
          }),
        );
        const socket = path.join(base, "broker", "agent.sock");
        await fs.rm(socket, { force: true });
        brokers.set(
          a.runtimeKey,
          await startMixqueueBroker(socket, {
            async authorize() {
              return {
                serverId: a.runtimeKey,
                game: "cs16",
                key: secrets.get(a.runtimeKey)!,
              };
            },
            async rcon(command) {
              assert.equal(command, "mq2_status");
              return '{"bridge":1,"healthy":true,"idle":true}';
            },
          }),
        );
        return {
          image,
          engine: "amxmodx",
          configDirectory: path.join(base, "config"),
          journalDirectory: path.join(base, "journal"),
          stateDirectory: path.join(base, "state"),
          brokerDirectory: path.join(base, "broker"),
        };
      },
      closeBroker,
    );
    const supervisor = new MixqueueSupervisor(runtime);
    t.after(async () => {
      try {
        await supervisor.close();
      } finally {
        globalThis.fetch = originalFetch;
        await fs.rm(root, { recursive: true, force: true });
      }
    });
    for (const key of keys) {
      await fs.mkdir(path.join(root, key, "journal"), { recursive: true });
      await fs.writeFile(path.join(root, key, "journal", "events.jsonl"), "");
    }
    const assignments = keys.map(
      (runtimeKey) =>
        ({
          runtimeKey,
          revision: "1",
          gameGeneration: "game-1",
          enabled: true,
          gameRunning: true,
        }) satisfies MixqueueAssignment,
    );
    await supervisor.reconcile(assignments);
    const status = async (key: string) =>
      JSON.parse(
        await fs.readFile(path.join(root, key, "state", "status.json"), "utf8"),
      );
    async function until(check: () => Promise<boolean>) {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        try {
          if (await check()) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new Error("test_condition_timeout");
    }
    await until(
      async () =>
        (await status(keys[0])).ready && (await status(keys[1])).ready,
    );
    assert.equal((await runtime.list()).size, 2);
    assert.ok(
      keys.every((key) =>
        requests.some((r) => r.id === key && r.action === "poll" && r.healthy),
      ),
    );
    // Removing one journal must fail readiness without stopping the other executor's heartbeat.
    await fs.rm(path.join(root, keys[0], "journal", "events.jsonl"));
    await until(
      async () =>
        !(await status(keys[0])).ready && (await status(keys[0])).heartbeat,
    );
    assert.equal((await status(keys[1])).ready, true);
    const before = (await runtime.list()).get(keys[1])?.generation;
    await supervisor.reconcile([
      { ...assignments[0], revision: "2" },
      assignments[1],
    ]);
    assert.equal((await runtime.list()).get(keys[1])?.generation, before);
    await supervisor.reconcile([
      { ...assignments[0], gameRunning: false },
      assignments[1],
    ]);
    assert.equal((await runtime.list()).size, 1);
    for (const item of await docker.listContainers({
      filters: { label: [`gamepanel.node=${nodeId}`] },
    })) {
      const info = await docker.getContainer(item.Id).inspect();
      assert.equal(info.HostConfig.NetworkMode, "none");
      assert.ok(!JSON.stringify(info).includes(secrets.get(keys[1])!));
    }
  },
);
