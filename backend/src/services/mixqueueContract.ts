export const MQ_API = "https://csco.gg/mq2-agent";
export const mqFail = (code: string, statusCode = 409) =>
  Object.assign(new Error(code), { statusCode });
export function validateMixqueueImport(input: unknown, game: string) {
  const value = input as any;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(value).length > 32768 ||
    Object.keys(value).some(
      (k) => !["agent", "environment", "instructions"].includes(k),
    )
  )
    throw mqFail("invalid_import", 400);
  const a = value.agent,
    e = value.environment;
  const fields = [
    "server_id",
    "game",
    "adapter",
    "verified_build",
    "api",
    "key_env",
    "rcon_password_env",
    "rcon_host",
    "rcon_port",
    "game_root",
    "journal",
    "database",
  ];
  if (
    !a ||
    !e ||
    typeof a !== "object" ||
    typeof e !== "object" ||
    Array.isArray(a) ||
    Array.isArray(e) ||
    Object.keys(a).some((k) => !fields.includes(k)) ||
    Object.keys(e).some(
      (k) => !["MQ2_AGENT_KEY", "MQ2_RCON_PASSWORD"].includes(k),
    )
  )
    throw mqFail("invalid_import", 400);
  if (
    a.api !== MQ_API ||
    a.game !== game ||
    a.adapter !== (game === "cs16" ? "amxx" : "get5") ||
    a.key_env !== "MQ2_AGENT_KEY" ||
    a.rcon_password_env !== "MQ2_RCON_PASSWORD" ||
    typeof a.server_id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(a.server_id)
  )
    throw mqFail("invalid_identity_or_endpoint", 400);
  if (
    typeof e.MQ2_AGENT_KEY !== "string" ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(e.MQ2_AGENT_KEY)
  )
    throw mqFail("invalid_key", 400);
  if (
    e.MQ2_RCON_PASSWORD !== null &&
    (typeof e.MQ2_RCON_PASSWORD !== "string" ||
      e.MQ2_RCON_PASSWORD.length < 1 ||
      e.MQ2_RCON_PASSWORD.length > 128 ||
      /[\x00-\x1f"\x7f]/.test(e.MQ2_RCON_PASSWORD))
  )
    throw mqFail("invalid_rcon_password", 400);
  if (
    typeof a.verified_build !== "string" ||
    !/^[A-Za-z0-9 ._+-]{0,128}$/.test(a.verified_build)
  )
    throw mqFail("invalid_build", 400);
  // Export paths/host/port are explanatory metadata. Never use them for filesystem or network access.
  return {
    serverId: a.server_id as string,
    game,
    verifiedBuild: a.verified_build as string,
    key: e.MQ2_AGENT_KEY as string,
    rconPassword: e.MQ2_RCON_PASSWORD as string | null,
  };
}
export function allowedMixqueueCommand(
  command: unknown,
  game: string,
): command is string {
  if (typeof command !== "string" || command.length > 200 || /[\x00-\x1f\x7f]/.test(command)) return false;
  return (
    ["mq2_status", "mq2_clear"].includes(command) ||
    (game === "cs16"
      ? (/^mq2_load [a-f0-9]{24} [1-9][0-9]{0,8}$/.test(command)
          || ["test_admin", "test_timeout", "match_finished", "not_roster", "no_match", "steam_timeout", "server_error"].some(reason => command === "mq2_clear " + reason)
          || ["test_admin", "test_timeout", "server_error"].some(reason => command === "mq2_endtest " + reason))
      : /^get5_loadmatch addons\/sourcemod\/configs\/mq2\/[a-f0-9]{24}-[1-9][0-9]{0,8}\.json$/.test(
          command,
        ))
  );
}
