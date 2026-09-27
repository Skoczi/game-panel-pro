import type { GameTemplate } from "./types.js";
import { sourceGameConfig, type SourceGame } from "./sourceProfile.js";

export const SOURCE_TEMPLATES: Array<{ id: string; document: GameTemplate }> = (
  ["css", "csgo", "cs2"] as const
).map((game) => {
  const name = {
    css: "Counter-Strike: Source",
    csgo: "Counter-Strike: Global Offensive (Legacy)",
    cs2: "Counter-Strike 2",
  }[game];
  const base =
    game === "cs2" ? "game/csgo" : game === "css" ? "cstrike" : "csgo";
  const variable = (
    key: string,
    label: string,
    value: string,
    type: "string" | "integer" = "string",
    secret = false,
  ) => ({ key, label, default: value, type, required: !secret, secret });
  return {
    id: `builtin-${game}-native`,
    document: {
      schemaVersion: 2,
      name,
      description:
        game === "csgo" ? "Legacy CS:GO dedicated server · Steam app 740" : "",
      author: "Skoczi",
      source: "Valve SteamCMD / LinuxGSM / AlliedModders",
      icon:
        game === "css"
          ? "counter-strike-source"
          : game === "cs2"
            ? "counter-strike-2"
            : "counter-strike-go",
      runtime: {
        provider: "external",
        image:
          game === "cs2"
            ? "gamepanel-runtime:source2-v1"
            : "gamepanel-runtime:source-v1",
        catalogId: game,
        gameServerName: "",
        architectures: ["x64"],
        identity: { user: "1000", uid: 1000, gid: 1000 },
      },
      ports: [
        {
          key: "game",
          label: "Game / Query",
          protocol: "udp",
          container: 27015,
          suggested: 27015,
          env: "SERVER_PORT",
          linuxgsmKey: "",
        },
        {
          key: "rcon",
          label: "RCON",
          protocol: "tcp",
          container: 27015,
          suggested: 27015,
          env: "",
          linuxgsmKey: "",
        },
      ],
      variables: [
        variable("MAP", "Starting map", "de_dust2"),
        variable("MAX_PLAYERS", "Player slots", "32", "integer"),
        variable("GSLT", "Steam server token", "", "string", true),
        ...(game !== "css"
          ? [
              variable("GAME_TYPE", "Game type", "0", "integer"),
              variable("GAME_MODE", "Game mode", "1", "integer"),
            ]
          : []),
        ...(game === "csgo"
          ? [
              variable("TICKRATE", "Tickrate", "128", "integer"),
              variable("MAP_GROUP", "Map group", "mg_active"),
            ]
          : []),
      ],
      mounts: [{ key: "data", containerPath: "/data" }],
      monitoring: { protocol: "a2s", queryPort: "game" },
      lifecycle: {
        startup: ["/usr/local/lib/gamepanel/source-start", game],
        installerImage: "gamepanel-installer:source-v1",
        install: [
          {
            name: "Install game files",
            argv: ["/usr/local/lib/gamepanel/source-install", game, "install"],
            timeoutSeconds: 3600,
          },
        ],
        update: [
          {
            name: "Update game files",
            argv: ["/usr/local/lib/gamepanel/source-install", game, "update"],
            timeoutSeconds: 3600,
          },
        ],
        workdir: "/data",
        stopCommand: "quit",
        stopSignal: "SIGINT",
        stopTimeoutSeconds: 30,
      },
      gameConfig: sourceGameConfig(game as SourceGame),
      configFiles: [
        {
          root: "data",
          path: `/serverfiles/${base}/cfg/server.cfg`,
          label: "Server settings",
        },
        ...(game !== "cs2"
          ? [
              {
                root: "data",
                path: `/serverfiles/${base}/mapcycle.txt`,
                label: "Map rotation",
              },
            ]
          : []),
      ],
      ...(game !== "cs2"
        ? {
            fastDownload: {
              enabled: true,
              gameRoot: `serverfiles/${base}`,
              folders: [
                "maps",
                "materials",
                "models",
                "sound",
                "resource",
                "scripts",
              ],
              compression: "bzip2" as const,
              configFile: `serverfiles/${base}/cfg/server.cfg`,
            },
          }
        : {}),
    },
  };
});
