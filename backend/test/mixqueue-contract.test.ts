import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedMixqueueCommand,
  validateMixqueueImport,
  validMixqueueReport,
  MQ_API,
} from "../src/services/mixqueueContract.js";

const exported = () => ({
  agent: {
    server_id: "waw-cs16-1",
    game: "cs16",
    adapter: "amxx",
    verified_build: "",
    api: MQ_API,
    key_env: "MQ2_AGENT_KEY",
    rcon_password_env: "MQ2_RCON_PASSWORD",
    game_root: "/old/game",
    journal: "/old/journal",
    database: "/old/db",
    rcon_host: "127.0.0.1",
    rcon_port: 27015,
  },
  environment: { MQ2_AGENT_KEY: "a".repeat(48), MQ2_RCON_PASSWORD: null },
  instructions: "Not an executable command",
});

test('inventory and load rejection contracts are bounded without exposing arbitrary error text', () => {
  const inventory = { version: 1, source: 'bsp_v30', complete: true,
    maps: Array.from({length: 256}, (_, i) => `de_map_${i}`) };
  const poll = { action: 'poll', healthy: true, observation: { map_inventory: inventory } };
  assert.ok(validMixqueueReport(poll));
  assert.ok(Buffer.byteLength(JSON.stringify(poll)) < 131072);
  for (const patch of [{maps: [...inventory.maps, 'de_overflow']}, {maps: ['../private']},
    {maps: ['de_nuke', 'de_nuke']}, {version: 2}, {source: '/private/path'},
    {complete: 'true'}, {extra: 'private'}]) {
    assert.equal(validMixqueueReport({...poll, observation: {map_inventory: {...inventory, ...patch}}}), false);
  }
  for (const code of ['missing_map', 'malformed_assignment', 'storage_failure',
    'inventory_unavailable', 'server_busy', 'stale_generation', 'server_not_empty',
    'test_ai_disabled', 'test_bot_profiles_missing', 'test_bot_nav_missing', 'test_bot_nav_invalid']) {
    assert.ok(validMixqueueReport({action: 'event', event: {type: 'load_rejected', data: {code}}}));
  }
  for (const data of [{code: 'private RCON output'}, {code: 'missing_map', message: 'private'},
    {code: 'test_bot_nav_missing', path: '/private/maps/de_nuke.nav'},
    {code: 'test_bot_nav_missing\nprivate'}, {code: 'test_bot_nav_missing '},
    {code: 'test_bot_nav_unknown'}, {code: ['test_ai_disabled']}, null]) {
    assert.equal(validMixqueueReport({action: 'event', event: {type: 'load_rejected', data}}), false);
  }
  assert.ok(validMixqueueReport({action: 'poll', observation: {healthy: false}}));
  assert.ok(validMixqueueReport({action: 'event', event: {type: 'idle'}}));
});

test("import preserves identity and separates secrets without granting exported paths or targets", () => {
  const data = exported();
  data.agent.game_root = "/etc";
  data.agent.rcon_host = "169.254.169.254";
  data.instructions = "rm -rf /";
  const result = validateMixqueueImport(data, "cs16");
  assert.equal(result.serverId, "waw-cs16-1");
  assert.equal(result.rconPassword, null);
  assert.deepEqual(Object.keys(result).sort(), [
    "game",
    "key",
    "rconPassword",
    "serverId",
    "verifiedBuild",
  ]);
});
test("imports reject alternative endpoints, wrong games, environment injection and malformed keys", () => {
  const wrongEndpoint = exported();
  wrongEndpoint.agent.api = "https://attacker.invalid/mq2-agent";
  assert.throws(() => validateMixqueueImport(wrongEndpoint, "cs16"));
  assert.throws(() => validateMixqueueImport(exported(), "csgo"));
  const env = exported();
  Object.assign(env.environment, { LD_PRELOAD: "/payload" });
  assert.throws(() => validateMixqueueImport(env, "cs16"));
  const weak = exported();
  weak.environment.MQ2_AGENT_KEY = "short";
  assert.throws(() => validateMixqueueImport(weak, "cs16"));
});
test("RCON capability cannot turn into a console or shell and is game-specific", () => {
  for (const command of [
    "quit",
    "exec server.cfg",
    "mq2_status;quit",
    "mq2_clear\nquit",
    "get5_loadmatch ../../server.cfg",
  ])
    assert.equal(allowedMixqueueCommand(command, "csgo"), false);
  assert.equal(allowedMixqueueCommand("mq2_status", "cs16"), true);
  assert.equal(
    allowedMixqueueCommand("mq2_load " + "a".repeat(24) + " 1", "cs16"),
    true,
  );
  assert.equal(
    allowedMixqueueCommand("mq2_load " + "a".repeat(24) + " 1", "csgo"),
    false,
  );
  assert.equal(
    allowedMixqueueCommand(
      "get5_loadmatch addons/sourcemod/configs/mq2/" +
        "a".repeat(24) +
        "-1.json",
      "csgo",
    ),
    true,
  );
});

test('MatchBot v2 ending and cleanup accept only exact GoldSrc reason codes', () => {
  const reasons = ['test_admin', 'test_timeout', 'match_finished', 'not_roster', 'no_match', 'steam_timeout', 'server_error'];
  for (const reason of reasons) {
    assert.equal(allowedMixqueueCommand('mq2_clear ' + reason, 'cs16'), true);
    assert.equal(allowedMixqueueCommand('mq2_clear ' + reason, 'csgo'), false);
  }
  for (const reason of ['test_admin', 'test_timeout', 'server_error']) {
    assert.equal(allowedMixqueueCommand('mq2_endtest ' + reason, 'cs16'), true);
    assert.equal(allowedMixqueueCommand('mq2_endtest ' + reason, 'csco'), false);
  }
  for (const command of ['mq2_endtest', 'mq2_endtest match_finished', 'mq2_clear unknown',
    'mq2_clear test_admin;quit', 'mq2_endtest test_admin\n', 'mq2_clear test_admin\r',
    'mq2_endtest test_admin extra', 'mq2_clear "test_admin"', 'mq2_clear\x00',
    'mq2_load ' + 'a'.repeat(24) + ' 1\n']) {
    assert.equal(allowedMixqueueCommand(command, 'cs16'), false, command);
  }
  assert.equal(allowedMixqueueCommand('mq2_clear', 'cs16'), true);
  assert.equal(allowedMixqueueCommand('mq2_clear', 'csgo'), true);
});
