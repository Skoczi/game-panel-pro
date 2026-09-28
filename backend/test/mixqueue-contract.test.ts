import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedMixqueueCommand,
  validateMixqueueImport,
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
