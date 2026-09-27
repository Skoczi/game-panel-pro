import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getServerOrThrow } from "./servers.js";
import { nativeTemplate } from "../templates/nativeContract.js";
import { sourceProfile } from "../templates/sourceProfile.js";
import { getServerStoragePaths } from "../utils/storage.js";
import { checkContainerStatus } from "../utils/docker.js";
import { safeFile, textFile } from "./rehldsAddons.js";
import {
  SOURCE_MODULES,
  sourceSelection,
  downloadSourcePackage,
  sourceModulePackage,
  sourceModuleVersion,
} from "./sourcePackages.js";
import { SOURCE_ADDON_SOURCES } from "./sourceAddonSources.js";
import { createNativeBackup } from "./nativeBackups.js";
import { restoreNativeBackup } from "./nativeRestore.js";
import type { ReportProgress } from "./operationProgress.js";

const STATE = "serverfiles/.eserv-source-addons.json";
type State = Record<string, { version: string; files: Record<string, string> }>;
const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const preserve = (p: string) =>
  /\/(configs?|data|logs|translations)\//i.test(p) || /\.(cfg|ini)$/i.test(p);
export function sourceProbes(
  base: string,
  source2: boolean,
): Record<string, string[]> {
  return {
    metamod: [
      `${base}/addons/metamod/bin/${source2 ? "linuxsteamrt64/libserver.so" : "server_i486.so"}`,
      `${base}/addons/metamod/bin/linux64/server.so`,
    ],
    sourcemod: [
      `${base}/addons/sourcemod/bin/sourcemod.2.css.so`,
      `${base}/addons/sourcemod/bin/sourcemod.2.csgo.so`,
      `${base}/addons/sourcemod/bin/x64/sourcemod.2.css.so`,
    ],
    counterstrikesharp: [
      `${base}/addons/counterstrikesharp/bin/linuxsteamrt64/counterstrikesharp.so`,
    ],
    swiftlys2: [`${base}/addons/swiftlys2/bin/linuxsteamrt64/swiftlys2.so`],
    modsharp: ["serverfiles/game/sharp/bin/libmodsharp.so"],
  };
}
async function context(id: number) {
  const server = await getServerOrThrow(id),
    template = nativeTemplate(
      JSON.parse(server.provider_metadata_json || "{}"),
    );
  const profile = sourceProfile(template);
  if (!profile)
    throw Object.assign(
      new Error("Source framework management is unavailable for this template"),
      { statusCode: 400 },
    );
  const root = getServerStoragePaths(id).dataDir;
  const inventory = await safeFile(root, STATE);
  if (inventory?.stat && inventory.stat.size > 4 * 1024 * 1024)
    throw new Error("Framework inventory too large");
  const raw = inventory?.stat
    ? await fs.readFile(inventory.filename, "utf8")
    : null;
  const state: State = raw ? JSON.parse(raw) : {};
  if (!state || typeof state !== "object" || Array.isArray(state))
    throw new Error("Invalid framework inventory");
  const catalogue = [];
  for (const module of SOURCE_MODULES.filter((m) =>
    m.games.includes(profile.game),
  )) {
    let detected = false;
    for (const probe of sourceProbes(profile.base, profile.source2)[module.id])
      if ((await safeFile(root, probe))?.stat) detected = true;
    const configRoot =
      module.id === "modsharp"
        ? "serverfiles/game/sharp/configs"
        : `${profile.base}/addons/${module.id}${module.id === "metamod" ? "" : "/configs"}`;
    const configurationFiles: string[] = [];
    for (const directoryRoot of [
      configRoot,
      ...(module.id === "sourcemod" ? [profile.base + "/cfg/sourcemod"] : []),
    ]) {
      await safeFile(root, directoryRoot + "/.directory-check");
      const directory = await fs
        .lstat(path.join(root, directoryRoot))
        .catch((e) => {
          if (e.code === "ENOENT") return null;
          throw e;
        });
      if (directory?.isDirectory()) {
        for (const entry of (
          await fs.readdir(path.join(root, directoryRoot), {
            withFileTypes: true,
          })
        ).slice(0, 200)) {
          if (
            entry.isFile() &&
            /\.(json|cfg|ini|txt|vdf)$/.test(entry.name) &&
            (await safeFile(root, directoryRoot + "/" + entry.name))?.stat
          )
            configurationFiles.push("/" + directoryRoot + "/" + entry.name);
        }
      }
    }
    const pluginsDirectory =
      module.id === "modsharp"
        ? "/serverfiles/game/sharp/modules"
        : `/${profile.base}/addons/${module.id}${module.id === "metamod" ? "" : "/plugins"}`;
    catalogue.push({
      ...module,
      version: sourceModuleVersion(profile.game, module.id),
      installed: detected,
      installedVersion: detected ? state[module.id]?.version || null : null,
      managed: Boolean(state[module.id]),
      configurationFiles,
      pluginsDirectory,
    });
  }
  return { server, profile, root, raw, state, catalogue };
}
export async function sourceAddonPreview(
  id: number,
  selection?: unknown,
  action = "install",
) {
  if (!["install", "uninstall"].includes(action))
    throw Object.assign(new Error("Invalid framework action"), {
      statusCode: 400,
    });
  const c = await context(id);
  const selected =
    selection === undefined ? [] : sourceSelection(c.profile.game, selection);
  const requested = selected[selected.length - 1];
  if (action === "install" && requested) {
    const conflicts = c.catalogue.filter(
      (m) =>
        m.installed &&
        selected.some((id) =>
          c.catalogue.find((x) => x.id === id)?.conflicts.includes(m.id),
        ),
    );
    if (conflicts.length)
      throw Object.assign(
        new Error(
          `Remove ${conflicts.map((m) => m.name).join(", ")} before installing ${c.catalogue.find((m) => m.id === requested)!.name}`,
        ),
        { statusCode: 409 },
      );
  }
  const modules =
    action === "uninstall"
      ? [requested!]
      : selected.filter(
          (m) =>
            m === requested || !c.catalogue.find((x) => x.id === m)?.installed,
        );
  if (action === "uninstall") {
    if (!requested || !c.state[requested])
      throw Object.assign(
        new Error(
          "This framework was not installed by the panel. Manage its files manually.",
        ),
        { statusCode: 409 },
      );
    if (c.catalogue.some((m) => m.installed && m.requires.includes(requested)))
      throw Object.assign(new Error("Remove dependent frameworks first"), {
        statusCode: 409,
      });
    for (const [name, digest] of Object.entries(c.state[requested].files)) {
      if (preserve(name)) continue;
      const file = await safeFile(c.root, name);
      if (file?.stat && hash(await fs.readFile(file.filename)) !== digest)
        throw Object.assign(
          new Error(
            "Framework files were modified. Reinstall the framework or manage its files manually.",
          ),
          { statusCode: 409 },
        );
    }
  }
  const loader = c.profile.source2
    ? await textFile(c.root, "serverfiles/game/csgo/gameinfo.gi")
    : "";
  const fingerprint = hash(
    JSON.stringify([
      c.server.runtime_uuid,
      c.server.docker_container_id,
      c.raw,
      c.catalogue.map((m) => [m.id, m.installed]),
      loader,
      modules,
      action,
      SOURCE_ADDON_SOURCES,
    ]),
  );
  return {
    catalogue: c.catalogue,
    modules,
    fingerprint,
    action,
    game: c.profile.game,
    stopped: ["exited", "created"].includes(
      await checkContainerStatus(c.server.docker_container_id),
    ),
    selected: requested || null,
  };
}
async function write(root: string, filename: string, bytes: Buffer) {
  if (!filename.startsWith("serverfiles/"))
    throw new Error("Invalid framework destination");
  // Restore's temporary parent belongs to the agent; files must retain the
  // game mount owner's identity so the non-root runtime can update its configs.
  const target = (await safeFile(
    path.join(root, "serverfiles"),
    filename.slice("serverfiles/".length),
    true,
  ))!;
  const handle = await fs.open(
    target.filename,
    "w",
    /\.so$|\/dotnet$/.test(filename) ? 0o755 : 0o644,
  );
  try {
    await handle.writeFile(bytes);
    await handle.chown(target.owner.uid, target.owner.gid);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export function patchSourceLoaders(content: string, modules: string[]) {
  if (
    modules.includes("modsharp") &&
    modules.some((id) => id === "metamod" || id === "swiftlys2")
  )
    throw new Error("ModSharp requires a separate loader setup");
  const paths: Record<string, string> = {
    metamod: "csgo/addons/metamod",
    modsharp: "sharp",
    swiftlys2: "csgo/addons/swiftlys2",
  };
  for (const p of Object.values(paths))
    content = content.replace(
      new RegExp(
        '^[ \\t]*Game[ \\t]+"?' +
          p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          '"?[ \\t]*(?://[^\\r\\n]*)?(?:\\r?\\n|$)',
        "gm",
      ),
      "",
    );
  const anchor = /^[ \t]*Game[ \t]+"?csgo"?[ \t]*(?:\/\/[^\r\n]*)?\r?$/m.exec(
    content,
  );
  if (!anchor) throw new Error("Cannot locate CS2 game search path");
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  return (
    content.slice(0, anchor.index) +
    Object.entries(paths)
      .filter(([id]) => modules.includes(id))
      .map(([, p]) => `\t\t\tGame\t${p}${newline}`)
      .join("") +
    content.slice(anchor.index)
  );
}
export async function changeSourceAddon(
  id: number,
  selection: unknown,
  expected: string,
  action: string,
  report?: ReportProgress,
) {
  const preview = await sourceAddonPreview(id, selection, action);
  if (!preview.stopped || preview.fingerprint !== expected)
    throw Object.assign(new Error("Stop the server and refresh the preview"), {
      statusCode: 409,
    });
  const c = await context(id);
  await report?.({
    stage: "backup",
    message: "Creating recovery backup",
    percent: 0,
  });
  const backup = await createNativeBackup(
    c.server,
    true,
    "Before-Source-frameworks",
    report,
  );
  if (!backup.ok || backup.stderr)
    throw new Error("Verified recovery backup required");
  const result = await restoreNativeBackup(
    c.server,
    backup.name,
    true,
    async (staging) => {
      const current = await sourceAddonPreview(id, selection, action);
      if (!current.stopped || current.fingerprint !== expected)
        throw new Error("Framework configuration changed");
      const root = path.join(staging); // restore staging is the data mount's contents
      const state: State = structuredClone(c.state);
      for (const module of preview.modules) {
        if (action === "uninstall") {
          const record = state[module];
          for (const [name, digest] of Object.entries(record.files)) {
            if (preserve(name)) continue;
            const file = await safeFile(root, name);
            if (file?.stat && hash(await fs.readFile(file.filename)) === digest)
              await fs.unlink(file.filename);
          }
          delete state[module];
        } else {
          const record = {
            version: sourceModuleVersion(c.profile.game, module),
            files: { ...state[module]?.files },
          };
          for (const source of module === "modsharp"
            ? [module, "modsharp-runtime"]
            : [sourceModulePackage(c.profile.game, module)]) {
            const files = await downloadSourcePackage(
              source,
              c.profile.base,
              report,
            );
            let count = 0;
            for (const [name, bytes] of files) {
              const existing = await safeFile(root, name);
              if (!(existing?.stat && preserve(name))) {
                await write(root, name, bytes);
                record.files[name] = hash(bytes);
              }
              if (++count % 50 === 0 || count === files.size)
                await report?.({
                  stage: "install-" + module,
                  message: `Installing ${SOURCE_MODULES.find((m) => m.id === module)!.name}`,
                  percent: Math.floor((count / files.size) * 100),
                });
            }
          }
        if (module === "modsharp" && !c.catalogue.find(m => m.id === module)?.installed && !c.state[module]) {
          // Upstream ships an optional SQL storage module without a database
          // connection. Leave it opt-in on first install; preserve user choices later.
          const marker = "serverfiles/game/sharp/modules/AdminCommands.SQLStorage/.disabled";
          const bytes = Buffer.from("Configure the database before enabling this optional module.\n");
          await write(root, marker, bytes);
          record.files[marker] = hash(bytes);
        }
        state[module] = record;
          if (module === "sourcemod")
            for (const directory of [
              "logs",
              "data",
              "data/sqlite",
              "plugins/disabled",
            ]) {
              await safeFile(
                path.join(root, "serverfiles"),
                c.profile.base.slice("serverfiles/".length) +
                  "/addons/sourcemod/" +
                  directory +
                  "/.directory-check",
                true,
              );
            }
          if (module === "swiftlys2")
            await safeFile(
              path.join(root, "serverfiles"),
              "game/csgo/addons/swiftlys2/plugins/disabled/.directory-check",
              true,
            );
          if (module === "counterstrikesharp")
            await safeFile(
              path.join(root, "serverfiles"),
              "game/csgo/addons/counterstrikesharp/plugins/.directory-check",
              true,
            );
        }
      }
      if (c.profile.source2) {
        const loaders = c.catalogue.filter((m) => m.installed).map((m) => m.id);
        for (const id of preview.modules) {
          const index = loaders.indexOf(id);
          if (index >= 0) loaders.splice(index, 1);
          if (action === "install") loaders.push(id);
        }
        const active = loaders.filter((id) =>
          ["metamod", "modsharp", "swiftlys2"].includes(id),
        );
        const file = "serverfiles/game/csgo/gameinfo.gi";
        await write(
          root,
          file,
          Buffer.from(
            patchSourceLoaders((await textFile(root, file)) || "", active),
          ),
        );
        await write(
          root,
          "serverfiles/.eserv-source-loaders.json",
          Buffer.from(JSON.stringify(active)),
        );
      }
      await write(root, STATE, Buffer.from(JSON.stringify(state)));
      await report?.({
        stage: "commit",
        message: "Applying framework changes",
        percent: null,
      });
    },
  );
  return {
    ...result,
    stdout: `${action === "uninstall" ? "Addon removed:" : "Addon installed:"} ${preview.selected}. Server remains stopped. Backup: ${backup.name}`,
  };
}
