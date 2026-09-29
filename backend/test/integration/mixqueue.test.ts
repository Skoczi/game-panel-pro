import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, createHmac, randomBytes } from "node:crypto";
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
    const observations = new Map<string, any>();
    const rejected: any[] = [];
    const currentResultMatch = 'd'.repeat(24), legacyResultMatch = 'e'.repeat(24);
    const resultAttempts: any[] = [];
    let allowResultDelivery = false;
    let rejectMissingMap = false;
    let firstControllerHealthy = true;
    let rejectAiLoads = false;
    const aiCodes = ['test_ai_disabled', 'test_bot_profiles_missing', 'test_bot_nav_missing', 'test_bot_nav_invalid'];
    const aiLoads = aiCodes.map((code, index) => {
      const matchId = '7e5700' + String(index + 1).repeat(18), generation = index + 3;
      const players = [1, 2].flatMap(team => Array.from({length: 5}, (_, slot) => {
        const human = team === 1 && slot === 0;
        return {steam_id: human ? '76561198000000001' : 'bot:' + createHash('sha256')
          .update(`${matchId}:${generation}:${team}:${slot + 1}`).digest('hex').slice(0, 24),
          team, bot: !human, captain: Number(slot === 0), locale: human ? 'pl' : 'en',
          name: human ? 'Captain' : `Bot ${team}-${slot + 1}`};
      }));
      return {code, command: {id: String(index + 1).repeat(24), type: 'load', match_id: matchId, generation,
        payload: {match_id: matchId, generation, game: 'cs16', map: 'de_nuke', team_size: 5,
          contract_version: 3, starting_ct_team: 1, config_hash: 'a'.repeat(64),
          rules: {test: true, test_type: 'full', mr: 15, ot_mr: 3}, players,
          test_owner: '76561198000000001', teams: {'1': 'Captain team', '2': 'Bot 2-1 team'}}}};
    });
    const aiRconCalls: string[] = [];
    const command = { id: 'c'.repeat(24), type: 'load', match_id: 'a'.repeat(24), generation: 2,
      payload: {match_id: 'a'.repeat(24), generation: 2, rules: {}, map: 'de_missing'} };
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
      if (body.action === 'event' && [currentResultMatch, legacyResultMatch].includes(body.event.match_id)) {
        resultAttempts.push({id, event: body.event});
        if (!allowResultDelivery) return new Response('{"error":"fixture_upstream_unavailable"}', {status: 503});
      }
      if (body.action === 'poll') observations.set(id, body.observation);
      if (body.action === 'event') rejected.push({id, event: body.event});
      if (body.action === 'poll' && body.healthy) {
        assert.equal(body.observation.agent_protocol, 2);
        assert.equal(body.observation.agent_version, '0.6.1');
        assert.equal(body.observation.assignment_contract, 3);
        assert.equal(body.observation.full_test, true);
        assert.equal(body.observation.controller, 'matchbot');
        assert.equal(body.observation.controller_version, '0.6.4');
        assert.equal(body.observation.rules_ready, true);
        assert.equal(body.observation.stats_version, 2);
        assert.equal(body.observation.pause_policy, 2);
        assert.equal(body.observation.reconnect_budget, 1);
        assert.equal(body.observation.tactical_limit, 3);
        assert.equal(body.observation.tactical_seconds, 30);
        assert.equal(body.observation.ready_seconds, 300);
        assert.equal(typeof body.observation.delivery.pending, 'number');
        assert.equal(body.observation.solo_test, true);
      }
      requests.push({ id, action: body.action, healthy: body.healthy });
      return new Response(JSON.stringify({ commands: id !== keys[0] ? [] : rejectAiLoads
        ? aiLoads.map(item => item.command) : rejectMissingMap ? [command] : [],
        load_rejection_contract: 1 }), { status: 200 });
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
        for (const name of ["config", "journal", "state", "broker", "maps"]) {
          await fs.mkdir(path.join(base, name), { recursive: true });
          // Match production ownership for the unprivileged executor, including root-run CI.
          await fs.chown(path.join(base, name), 1000, 1000);
        }
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
              if (command.startsWith('mq2_load ')) {
                assert.equal(a.runtimeKey, keys[0]);
                const load = aiLoads.find(item => command === `mq2_load ${item.command.match_id} ${item.command.generation}`);
                assert.ok(load, 'only a validated full-test assignment may reach controller load');
                const wire = await fs.readFile(path.join(base, 'config', `${load.command.match_id}-${load.command.generation}.txt`), 'utf8');
                assert.ok(wire.startsWith('MQ2V3 '));
                assert.equal(wire.trim().split('\n').length, 12);
                aiRconCalls.push(command);
                // The actual agent must map only the exact safe line, dropping all other RCON text.
                return `private-controller-diagnostic\n${load.code}\n`;
              }
              assert.equal(command, "mq2_status");
              return JSON.stringify({bridge: 1, healthy: a.runtimeKey !== keys[0] || firstControllerHealthy,
                idle: true, controller: 'matchbot', controller_version: '0.6.4', assignment_contract: 3, stats_version: 2,
                pause_policy: 2, reconnect_budget: 1, tactical_limit: 3, tactical_seconds: 30, ready_seconds: 300,
                full_test: true, rules_ready: true, solo_test: true});
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
          mapsDirectory: path.join(base, "maps"),
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
      await fs.mkdir(path.join(root, key, 'maps'), {recursive: true});
      const bsp = Buffer.alloc(126); bsp.writeInt32LE(30, 0); bsp.writeInt32LE(124, 4);
      bsp.writeInt32LE(2, 8); bsp.write('{}', 124);
      await fs.writeFile(path.join(root, key, 'maps', key === keys[0] ? 'de_nuke.bsp' : 'de_train.bsp'), bsp);
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
    for (const [index, key] of keys.entries()) {
      assert.deepEqual(observations.get(key).map_inventory, {version: 1, source: 'bsp_v30', complete: true,
        maps: [index === 0 ? 'de_nuke' : 'de_train']});
    }
    // Real runner dispatch must negotiate and durably report refusal, never synthesize loaded.
    rejectMissingMap = true;
    await until(async () => rejected.length > 0);
    assert.equal(rejected.length, 1);
    assert.deepEqual(rejected[0].event.data, {code: 'missing_map'});
    assert.equal(rejected[0].event.type, 'load_rejected');
    assert.equal(rejected[0].event.match_id, command.match_id);
    assert.equal(rejected[0].event.generation, 2);
    assert.equal(rejected[0].event.sequence, 1);
    // Recovery must continue delivering sequenced journal events to the signed broker.
    firstControllerHealthy = false;
    await fs.appendFile(path.join(root, keys[0], 'journal', 'events.jsonl'), JSON.stringify({
      event_id: 'fixture-idle', match_id: command.match_id, generation: 2, type: 'idle', data: {},
    }) + '\n');
    await until(async () => rejected.length === 2);
    assert.equal(rejected[1].event.type, 'idle');
    assert.equal(rejected[1].event.sequence, 2);
    // The controller owns this deadline; broker/runner must not recalculate or project it away.
    const readyDeadline = Math.floor(Date.now() / 1000) + 300;
    const loaded = {map: 'de_nuke', ready_deadline: readyDeadline};
    await fs.appendFile(path.join(root, keys[0], 'journal', 'events.jsonl'), JSON.stringify({
      event_id: 'fixture-loaded-v3', match_id: command.match_id, generation: 2, type: 'loaded', data: loaded,
    }) + '\n');
    await until(async () => rejected.length === 3);
    assert.equal(rejected[2].event.type, 'loaded');
    assert.equal(rejected[2].event.sequence, 3);
    assert.deepEqual(rejected[2].event.data, loaded);
    firstControllerHealthy = true;
    rejectMissingMap = false;
    rejectAiLoads = true;
    // Exact controller refusals cross the real executor, durable spool and HMAC broker.
    await until(async () => rejected.length === 7);
    for (const [index, load] of aiLoads.entries()) {
      const item = rejected[index + 3];
      assert.equal(item.id, keys[0]);
      assert.equal(item.event.type, 'load_rejected');
      assert.equal(item.event.match_id, load.command.match_id);
      assert.equal(item.event.generation, load.command.generation);
      assert.equal(item.event.sequence, 1);
      assert.deepEqual(item.event.data, {code: load.code});
    }
    assert.equal(aiRconCalls.length, 4);
    assert.ok(!JSON.stringify(rejected).includes('private-controller-diagnostic'));
    assert.equal(rejected.filter(item => item.event.type === 'loaded').length, 1, 'only the journal acknowledges loaded');
    // A blocked upstream and executor recreation must preserve optional controller-owned reasons.
    const results = [
      {event_id: 'current-round', match_id: currentResultMatch, generation: 11, type: 'round',
        data: {team1_score: 15, team2_score: 10, stats_version: 2, players: {}, round_reason: 'elimination'}},
      {event_id: 'current-finished', match_id: currentResultMatch, generation: 11, type: 'finished',
        data: {team1_score: 16, team2_score: 10, stats_version: 2, players: {}, round_reason: 'bomb_defused'}},
      {event_id: 'legacy-round', match_id: legacyResultMatch, generation: 12, type: 'round',
        data: {team1_score: 15, team2_score: 10, stats_version: 2, players: {}}},
      {event_id: 'legacy-finished', match_id: legacyResultMatch, generation: 12, type: 'finished',
        data: {team1_score: 16, team2_score: 10, stats_version: 2, players: {}}},
    ];
    await fs.appendFile(path.join(root, keys[1], 'journal', 'events.jsonl'), results.map(event => JSON.stringify(event) + '\n').join(''));
    await until(async () => resultAttempts.length > 0 && !(await status(keys[1])).ready);
    const blocked = structuredClone(resultAttempts[0]);
    const spoolPath = path.join(root, keys[1], 'state', 'spool.sqlite');
    const spoolInode = (await fs.stat(spoolPath)).ino;
    const firstGeneration = (await runtime.list()).get(keys[0])?.generation;
    assignments[1] = {...assignments[1], revision: '2'};
    await supervisor.reconcile(assignments);
    assert.equal((await runtime.list()).get(keys[0])?.generation, firstGeneration);
    assert.equal((await fs.stat(spoolPath)).ino, spoolInode);
    allowResultDelivery = true;
    const acceptedResults = () => rejected.filter(item => [currentResultMatch, legacyResultMatch].includes(item.event.match_id));
    await until(async () => acceptedResults().length === results.length && (await status(keys[1])).ready);
    assert.deepEqual(acceptedResults()[0], blocked, 'retry retains event ID, boot ID, sequence and payload across restart');
    for (const [index, expected] of results.entries()) {
      const {id, event} = acceptedResults()[index];
      assert.equal(id, keys[1]);
      assert.deepEqual(event, {...expected, schema_version: 1, sequence: index % 2 + 1, boot_id: blocked.event.boot_id});
      assert.equal(Object.hasOwn(event.data, 'round_reason'), index < 2, 'legacy reasons must not be invented');
    }
    await fs.rm(path.join(root, keys[0], 'maps', 'de_nuke.bsp'));
    await until(async () => observations.get(keys[0]).map_inventory.maps.length === 0);
    assert.deepEqual(observations.get(keys[1]).map_inventory.maps, ['de_train']);
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
    assert.equal(rejected.filter(item => item.event.type === 'load_rejected').length, 5);
    assert.equal(aiRconCalls.length, 4, 'redelivery/restart must not resubmit durably rejected commands');
    assert.equal(acceptedResults().length, results.length, 'journal retries must not duplicate acknowledged results');
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
      const maps = info.Mounts.find(m => m.Destination === '/game/maps');
      assert.equal(maps?.RW, false);
      assert.equal(maps?.Source, path.join(root, keys[1], 'maps'));
      assert.ok(!JSON.stringify(info).includes(secrets.get(keys[1])!));
    }
  },
);
