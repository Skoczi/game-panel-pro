import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedMixqueueCommand,
  validateMixqueueImport,
  validMixqueueReport,
  validMixqueueObserverUpdate,
  filterMixqueueObserverUpdates,
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

test('round reasons stay optional event data without changing the RCON or rejection contracts', () => {
  for (const type of ['round', 'finished']) {
    for (const reason of [undefined, 'elimination', 'bomb_exploded', 'bomb_defused', 'time', 'other']) {
      const data = {team1_score: 2, team2_score: 1, stats_version: 2, players: {},
        ...(reason === undefined ? {} : {round_reason: reason})};
      const report = {action: 'event', event: {event_id: 'fixture-round', match_id: 'a'.repeat(24),
        generation: 3, schema_version: 1, sequence: 2, boot_id: 'fixture-boot', type, data}};
      const before = structuredClone(report);
      assert.ok(validMixqueueReport(report));
      assert.deepEqual(report, before);
      assert.equal(Object.hasOwn(report.event.data, 'round_reason'), reason !== undefined);
    }
  }
  for (const reason of ['elimination', 'bomb_exploded', 'bomb_defused', 'time', 'other']) {
    assert.equal(validMixqueueReport({action: 'event', event: {type: 'load_rejected', data: {code: reason}}}), false);
    for (const command of [`mq2_clear ${reason}`, `mq2_endtest ${reason}`, `mq2_round_reason ${reason}`]) {
      assert.equal(allowedMixqueueCommand(command, 'cs16'), false);
    }
  }
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


test('observer RCON capability accepts the complete signed integer range and no other syntax', () => {
  const id = 'a'.repeat(24);
  for (const generation of [1, 999999999, 1000000000, 2147483647]) {
    for (const revision of [1, 2147483647]) {
      const command = `mq2_observers ${id} ${generation} ${revision}`;
      assert.ok(allowedMixqueueCommand(command, 'cs16'));
      for (const game of ['csgo', 'csco', 'css', 'cs2']) assert.equal(allowedMixqueueCommand(command, game), false);
    }
  }
  for (const value of ['0', '-1', '+1', '01', '1.0', '1e2', '2147483648', '99999999999', 'true']) {
    assert.equal(allowedMixqueueCommand(`mq2_observers ${id} ${value} 1`, 'cs16'), false);
    assert.equal(allowedMixqueueCommand(`mq2_observers ${id} 1 ${value}`, 'cs16'), false);
  }
  for (const command of [`mq2_observers ${id.toUpperCase()} 1 1`, `mq2_observers ../${id} 1 1`,
    `mq2_observers ${id} 1 1;quit`, `mq2_observers ${id} 1 1\n`, `mq2_observers ${id} 1\t1`,
    `mq2_observers ${id} 1 1 extra`, `mq2_observers ${id} 1 1 `, `mq2_observers  ${id} 1 1`]) {
    assert.equal(allowedMixqueueCommand(command, 'cs16'), false, command);
  }
});

const observerFixture = (now: number) => ({
  id: 'b'.repeat(24), type: 'observer_update', match_id: 'a'.repeat(24), generation: 2147483647,
  // WWW returns DB metadata alongside the command; this is not an alternate capability.
  server_id: 'fixture-server', state: 'pending', attempts: 1,
  payload: {version: 1, revision: 2147483647, expires_at: now + 300,
    observers: [{steam_id: '76561198000000001', role: 'admin', xray: true, expires_at: now + 120, locale: 'pl'}]},
});

test('observer snapshots reject path injection, stale leases, duplicates and malformed authority', () => {
  const now = 1800000000, valid = observerFixture(now);
  assert.ok(validMixqueueObserverUpdate(valid, now));
  assert.ok(validMixqueueObserverUpdate({...valid, payload: {...valid.payload, observers: []}}, now));
  assert.ok(validMixqueueObserverUpdate({...valid, payload: {...valid.payload, expires_at: now + 600,
    observers: Array.from({length: 16}, (_, i) => ({...valid.payload.observers[0], role: 'commentator', locale: 'en',
      xray: false, steam_id: String(76561197960265729n + BigInt(i))}))}}, now));
  for (const patch of [{match_id: 'A'.repeat(24)}, {match_id: 'a'.repeat(24) + '\n'}, {match_id: '../private'}, {generation: 0}, {generation: true},
    {generation: '1'}, {generation: 1.5}, {generation: 2147483648}, {payload: null}, {payload: []}]) {
    assert.equal(validMixqueueObserverUpdate({...valid, ...patch}, now), false);
  }
  for (const patch of [{version: true}, {version: 2}, {revision: 0}, {revision: '1'}, {revision: true},
    {revision: 2147483648}, {expires_at: now}, {expires_at: now + 601}, {expires_at: '1800000300'},
    {observers: null}, {observers: Array(17).fill(valid.payload.observers[0])},
    {observers: Array(2).fill(valid.payload.observers[0])}, {path: '/etc/passwd'}, {command: 'quit'}]) {
    assert.equal(validMixqueueObserverUpdate({...valid, payload: {...valid.payload, ...patch}}, now), false);
  }
  for (const patch of [{steam_id: '76561197960265728'}, {steam_id: '76561202255233024'}, {steam_id: '123'},
    {steam_id: '76561198000000001\n'}, {role: 'operator'}, {role: 'admin;quit'}, {xray: 1}, {xray: 'true'},
    {locale: 'PL'}, {locale: 'en\n'}, {expires_at: now}, {expires_at: now + 301}, {expires_at: 1.5},
    {path: '../../config'}, {rcon: 'quit'}]) {
    const observers = [{...valid.payload.observers[0], ...patch}];
    assert.equal(validMixqueueObserverUpdate({...valid, payload: {...valid.payload, observers}}, now), false);
  }
});

test('invalid optional observer updates cannot discard cleanup or alter legacy response data', () => {
  const now = 1800000000, valid = observerFixture(now);
  const cleanup = {id: 'c'.repeat(24), type: 'cleanup', match_id: valid.match_id, generation: valid.generation};
  const response = {commands: [{...valid, payload: {...valid.payload, revision: 0}}, valid, cleanup], load_rejection_contract: 1};
  const before = structuredClone(response);
  assert.deepEqual(filterMixqueueObserverUpdates(response, 'cs16', now), {...response, commands: [valid, cleanup]});
  assert.deepEqual(response, before);
  assert.deepEqual(filterMixqueueObserverUpdates(response, 'csgo', now), {...response, commands: [cleanup]});
  assert.deepEqual(filterMixqueueObserverUpdates({accepted: true}, 'cs16', now), {accepted: true});
});
