import type { GameTemplate, GameConfigDefinition } from "./types.js";

export type SourceGame = "css" | "csgo" | "cs2" | "classic";
export function sourceProfile(template?: GameTemplate | null) {
  if (template?.schemaVersion !== 2) return null;
  const game = template.runtime?.catalogId;
  if (!["css", "csgo", "cs2", "classic"].includes(game)) return null;
  const base =
    game === "cs2"
      ? "serverfiles/game/csgo"
      : `serverfiles/${game === "classic" ? "csco/csgo" : game === "css" ? "cstrike" : "csgo"}`;
  if (
    !template.configFiles?.some(
      (f) => f.root === "data" && f.path === `/${base}/cfg/server.cfg`,
    )
  )
    return null;
  return { game: game as SourceGame, base, source2: game === "cs2" };
}
export function sourceGameConfig(game: SourceGame): GameConfigDefinition {
  const base =
    game === "classic" ? "csco/csgo" : game === "cs2" ? "game/csgo" : game === "css" ? "cstrike" : "csgo";
  return {
    format: "valve-cfg",
    root: "data",
    path: `/serverfiles/${base}/cfg/server.cfg`,
    sections: [
      {
        id: "identity",
        label: "Server",
        description: "",
        fields: [
          {
            key: "hostname",
            label: "Server name",
            description: "",
            type: "text",
            apply: "restart",
          },
          {
            key: "sv_password",
            label: "Join password",
            description: "",
            type: "password",
            apply: "restart",
          },
          {
            key: "rcon_password",
            label: "RCON password",
            description: "",
            type: "password",
            apply: "restart",
          },
        ],
      },
      {
        id: "match",
        label: "Match",
        description: "",
        fields: [
          {
            key: "mp_friendlyfire",
            label: "Friendly fire",
            description: "",
            type: "boolean",
            apply: "map-change",
          },
          {
            key: "mp_freezetime",
            label: "Freeze time",
            description: "Seconds",
            type: "number",
            min: 0,
            max: 120,
            apply: "map-change",
          },
          {
            key: "mp_roundtime",
            label: "Round duration",
            description: "Minutes",
            type: "number",
            min: 1,
            max: 60,
            apply: "map-change",
          },
          {
            key: "mp_maxrounds",
            label: "Maximum rounds",
            description: "",
            type: "number",
            min: 0,
            max: 1000,
            apply: "map-change",
          },
          {
            key: "mp_autoteambalance",
            label: "Auto team balance",
            description: "",
            type: "boolean",
            apply: "map-change",
          },
          {
            key: "bot_quota",
            label: "Bots",
            description: "",
            type: "number",
            min: 0,
            max: 64,
            apply: "map-change",
          },
        ],
      },
    ],
  };
}
