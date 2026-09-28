import type { GameServerRow } from "../types/gameServer.js";
import { nativeServerTemplate } from "./nativeBackups.js";
import { sourceProfile } from "../templates/sourceProfile.js";
import { parseStoredPorts } from "../providers/runtimeConfig.js";
import { mqFail } from "./mixqueueContract.js";

export function mixqueueProfile(server: GameServerRow) {
  const template = nativeServerTemplate(server);
  if (
    !template ||
    !server.runtime_uuid ||
    !/^[a-f0-9]{32}$/.test(server.runtime_uuid)
  )
    throw mqFail("unsupported_server");
  const source = sourceProfile(template);
  const cs16 = template.configFiles?.some(
    (f) => f.root === "data" && f.path === "/serverfiles/cstrike/server.cfg",
  );
  const game = cs16
    ? "cs16"
    : source?.game === "csgo"
      ? "csgo"
      : source?.game === "classic"
        ? "csco"
        : null;
  if (!game) throw mqFail("unsupported_game");
  const engine = game === "cs16" ? "amxmodx" : "sourcemod";
  const base = game === "cs16" ? "serverfiles/cstrike" : source!.base;
  const ports = parseStoredPorts(server);
  // Current native templates use 27015 internally. Never guess a TV port as RCON.
  const port = ports.udp.find((p) => p.container === 27015);
  if (!port) throw mqFail("missing_game_port");
  return {
    game,
    adapter: game === "cs16" ? "amxx" : "get5",
    engine,
    base,
    port: port.container,
  };
}
