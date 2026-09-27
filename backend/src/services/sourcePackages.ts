import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import tar from "tar-stream";
import yauzl from "yauzl";
import { addonPath } from "./rehldsPackages.js";
import { SOURCE_ADDON_SOURCES } from "./sourceAddonSources.js";
import type { ReportProgress } from "./operationProgress.js";
import type { SourceGame } from "../templates/sourceProfile.js";

export const SOURCE_MODULES = [
  {
    id: "metamod",
    name: "Metamod:Source",
    games: ["css", "csgo", "cs2", "classic"],
    requires: [],
  },
  {
    id: "sourcemod",
    name: "SourceMod",
    games: ["css", "csgo", "classic"],
    requires: ["metamod"],
  },
  {
    id: "counterstrikesharp",
    name: "CounterStrikeSharp",
    games: ["cs2"],
    requires: ["metamod"],
  },
  { id: "swiftlys2", name: "SwiftlyS2", games: ["cs2"], requires: [] },
  { id: "modsharp", name: "ModSharp", games: ["cs2"], requires: [] },
].map((m) => ({
  ...m,
  // Tested against CS2 build 2000918: ModSharp's direct loader does not chain
  // with these loaders. CounterStrikeSharp + Metamod + Swiftly is supported.
  conflicts:
    m.id === "modsharp"
      ? ["metamod", "counterstrikesharp", "swiftlys2"]
      : ["metamod", "counterstrikesharp", "swiftlys2"].includes(m.id)
        ? ["modsharp"]
        : [],
  version: SOURCE_ADDON_SOURCES.find((s) => s.id === m.id)!.version,
}));
export const sourceModulePackage = (game: SourceGame, module: string) =>
  game === "classic" && ["metamod", "sourcemod"].includes(module) ? module + "-classic" : game === "cs2" && module === "metamod" ? "metamod-cs2" : module;
export const sourceModuleVersion = (game: SourceGame, module: string) =>
  SOURCE_ADDON_SOURCES.find((s) => s.id === sourceModulePackage(game, module))!
    .version;
export function sourceSelection(game: SourceGame, value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !SOURCE_MODULES.some((m) => m.id === value[0] && m.games.includes(game))
  )
    throw Object.assign(new Error("Choose one supported framework"), {
      statusCode: 400,
    });
  const module = SOURCE_MODULES.find((m) => m.id === value[0])!;
  return [...module.requires, module.id];
}
export function sourcePackagePath(module: string, raw: string, base: string) {
  if (module.endsWith("-classic")) module = module.replace("-classic", "");
  if (module === "metamod-cs2") module = "metamod";
  let name = raw.replace(/^\.\//, "").replace(/\/$/, "");
  if (!name) return null;
  if (module === "swiftlys2")
    name = name.replace(/^swiftlys2-linux-[^/]+\//, "");
  addonPath(name);
  // Both Source 1 recipes start srcds_linux (32-bit); the alternate VDF would
  // attempt to load a second, incompatible Metamod binary on every start.
  if (
    module === "metamod" &&
    base !== "serverfiles/game/csgo" &&
    name === "addons/metamod_x64.vdf"
  )
    return null;
  if (module === "modsharp-runtime")
    return "serverfiles/game/sharp/runtime/" + name;
  if (module === "modsharp") {
    if (name === "sharp") return null;
    if (!name.startsWith("sharp/"))
      throw new Error("Invalid ModSharp package root");
    return "serverfiles/game/" + name;
  }
  const roots =
    module === "metamod"
      ? ["addons/metamod/", "addons/metamod.vdf", "addons/metamod_x64.vdf"]
      : module === "sourcemod"
        ? [
            "addons/sourcemod/",
            "addons/metamod/sourcemod.vdf",
            "cfg/sourcemod/",
          ]
        : module === "counterstrikesharp"
          ? [
              "addons/counterstrikesharp/",
              "addons/metamod/counterstrikesharp.vdf",
            ]
          : ["addons/swiftlys2/"];
  if (
    [
      "addons",
      "cfg",
      "addons/metamod",
      "addons/sourcemod",
      "cfg/sourcemod",
      "addons/counterstrikesharp",
      "addons/swiftlys2",
    ].includes(name)
  )
    return null;
  if (!roots.some((p) => (p.endsWith("/") ? name.startsWith(p) : name === p)))
    throw new Error("Unsupported framework package path");
  return base + "/" + name;
}
export async function unpackSourcePackage(
  module: string,
  bytes: Buffer,
  kind: "zip" | "tar",
  base: string,
) {
  const files = new Map<string, Buffer>();
  let expanded = 0,
    entries = 0;
  const seen = new Set<string>();
  const add = (raw: string, data: Buffer) => {
    const name = sourcePackagePath(module, raw, base);
    if (!name) return;
    if (
      ++entries > 15000 ||
      data.length > 128 * 1024 * 1024 ||
      (expanded += data.length) > 768 * 1024 * 1024 ||
      seen.has(name)
    )
      throw new Error("Invalid or oversized framework archive");
    seen.add(name);
    files.set(name, data);
  };
  if (kind === "zip") {
    await new Promise<void>((resolve, reject) =>
      yauzl.fromBuffer(bytes, { lazyEntries: true }, (err, zip) => {
        if (err || !zip) return reject(err);
        zip.on("error", reject);
        zip.on("end", resolve);
        zip.on("entry", (entry) => {
          const mode = entry.externalFileAttributes >>> 16;
          if (
            (mode & 0o170000) === 0o120000 ||
            entry.uncompressedSize > 128 * 1024 * 1024
          ) {
            zip.close();
            return reject(new Error("Unsupported framework archive entry"));
          }
          if (entry.fileName.endsWith("/")) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) {
              zip.close();
              return reject(error);
            }
            void (async () => {
              const chunks: Buffer[] = [];
              let size = 0;
              for await (const c of stream) {
                size += c.length;
                if (size > 128 * 1024 * 1024)
                  throw new Error("Oversized framework file");
                chunks.push(Buffer.from(c));
              }
              add(entry.fileName, Buffer.concat(chunks));
              zip.readEntry();
            })().catch((e) => {
              zip.close();
              reject(e);
            });
          });
        });
        zip.readEntry();
      }),
    );
  } else {
    const extract = tar.extract();
    extract.on("entry", (header, stream, next) => {
      void (async () => {
        if (
          !["file", "directory"].includes(header.type || "") ||
          (header.size || 0) > 128 * 1024 * 1024
        )
          throw new Error("Unsupported framework archive entry");
        if (header.type === "directory") {
          stream.resume();
          next();
          return;
        }
        const chunks: Buffer[] = [];
        for await (const c of stream) chunks.push(Buffer.from(c));
        add(header.name, Buffer.concat(chunks));
        next();
      })().catch((e) => extract.destroy(e));
    });
    await pipeline(Readable.from(bytes), createGunzip(), extract);
  }
  if (!files.size) throw new Error("Empty framework package");
  return files;
}
export async function downloadSourcePackage(
  module: string,
  base: string,
  report?: ReportProgress,
) {
  const source = SOURCE_ADDON_SOURCES.find((s) => s.id === module);
  if (!source) throw new Error("Unknown framework");
  await report?.({
    stage: "download-" + module,
    message: `Downloading ${module}`,
    percent: 0,
  });
  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok || !response.body)
    throw new Error("Official framework download failed");
  const chunks: Buffer[] = [];
  let size = 0,
    last = 0;
  const total = Number(response.headers.get("content-length"));
  for await (const chunk of response.body as any) {
    size += chunk.length;
    if (size > 160 * 1024 * 1024)
      throw new Error("Framework download exceeds limit");
    chunks.push(Buffer.from(chunk));
    const percent =
      total > 0 ? Math.min(99, Math.floor((size / total) * 100)) : 0;
    if (percent >= last + 10) {
      last = percent;
      await report?.({
        stage: "download-" + module,
        message: `Downloading ${module}`,
        percent,
      });
    }
  }
  const bytes = Buffer.concat(chunks);
  if (createHash("sha256").update(bytes).digest("hex") !== source.sha256)
    throw new Error("Framework checksum mismatch");
  const files = await unpackSourcePackage(module, bytes, source.kind, base);
  if (module === 'metamod-classic') files.set(base + '/addons/metamod.vdf', Buffer.from('"Plugin"\n{\n  "file" "csco/csgo/addons/metamod/bin/server"\n}\n'));
  return files;
}
