export const MQ_API = "https://csco.gg/mq2-agent";
export const mqFail = (code: string, statusCode = 409) =>
  Object.assign(new Error(code), { statusCode });

/** Bound new v1 fields without filtering legacy observations or event envelopes. */
export function validMixqueueReport(body: any): boolean {
  const inventory = body?.action === 'poll' ? body.observation?.map_inventory : undefined;
  if (inventory !== undefined) {
    if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)
      || Object.keys(inventory).some(k => !['version', 'source', 'complete', 'maps'].includes(k))
      || inventory.version !== 1 || inventory.source !== 'bsp_v30'
      || typeof inventory.complete !== 'boolean' || !Array.isArray(inventory.maps)
      || inventory.maps.length > 256
      || inventory.maps.some((m: unknown) => typeof m !== 'string' || !/^de_[a-z0-9_]{1,36}$/.test(m))
      || new Set(inventory.maps).size !== inventory.maps.length) return false;
  }
  if (body?.action === 'event' && body.event?.type === 'load_rejected') {
    const data = body.event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || Object.keys(data).length !== 1 || ![
        'missing_map', 'malformed_assignment', 'storage_failure', 'inventory_unavailable',
        'server_busy', 'stale_generation', 'server_not_empty',
        'test_ai_disabled', 'test_bot_profiles_missing', 'test_bot_nav_missing', 'test_bot_nav_invalid',
      ].includes(data.code)) return false;
  }
  return true;
}
const MAX_OBSERVER_REVISION = 2147483647;
const object = (value: any): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_OBSERVER_REVISION;

/** An observer snapshot grants no paths, destinations or console capabilities. */
export function validMixqueueObserverUpdate(command: any, now = Math.floor(Date.now() / 1000)): boolean {
  if (!object(command) || command.type !== 'observer_update'
    || typeof command.match_id !== 'string' || command.match_id.length !== 24 || !/^[a-f0-9]{24}$/.test(command.match_id)
    || !positiveRevision(command.generation)) return false;
  const payload = command.payload;
  if (!object(payload) || Object.keys(payload).some(key => !['version', 'revision', 'expires_at', 'observers'].includes(key))
    || payload.version !== 1 || !positiveRevision(payload.revision)
    || !Number.isSafeInteger(payload.expires_at) || payload.expires_at <= now || payload.expires_at > now + 600
    || !Array.isArray(payload.observers) || payload.observers.length > 16
    || Buffer.byteLength(JSON.stringify(payload), 'utf8') > 8192) return false;
  const seen = new Set<string>();
  for (const observer of payload.observers) {
    if (!object(observer) || Object.keys(observer).some(key => !['steam_id', 'role', 'xray', 'expires_at', 'locale'].includes(key))
      || typeof observer.steam_id !== 'string' || observer.steam_id.length !== 17 || !/^[0-9]{17}$/.test(observer.steam_id)
      || seen.has(observer.steam_id) || !['admin', 'commentator'].includes(observer.role)
      || typeof observer.xray !== 'boolean' || !['pl', 'en'].includes(observer.locale)
      || !Number.isSafeInteger(observer.expires_at) || observer.expires_at <= now
      || observer.expires_at > payload.expires_at) return false;
    const accountId = BigInt(observer.steam_id) - 76561197960265728n;
    if (accountId <= 0n || accountId > 4294967295n) return false;
    seen.add(observer.steam_id);
  }
  return true;
}

/** Invalid optional ACL updates must never prevent a later abort/cleanup. */
export function filterMixqueueObserverUpdates(response: any, game: string, now = Math.floor(Date.now() / 1000)): any {
  if (!object(response) || !Array.isArray(response.commands)) return response;
  return {...response, commands: response.commands.filter((command: any) =>
    command?.type !== 'observer_update' || (game === 'cs16' && validMixqueueObserverUpdate(command, now)))};
}

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
          || (() => {
            const observer = /^mq2_observers ([a-f0-9]{24}) ([1-9][0-9]{0,9}) ([1-9][0-9]{0,9})$/.exec(command);
            return observer !== null && positiveRevision(Number(observer[2])) && positiveRevision(Number(observer[3]));
          })()
          || ["test_admin", "test_timeout", "match_finished", "not_roster", "no_match", "steam_timeout", "server_error"].some(reason => command === "mq2_clear " + reason)
          || ["test_admin", "test_timeout", "server_error"].some(reason => command === "mq2_endtest " + reason))
      : /^get5_loadmatch addons\/sourcemod\/configs\/mq2\/[a-f0-9]{24}-[1-9][0-9]{0,8}\.json$/.test(
          command,
        ))
  );
}
