import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import * as crypto from "node:crypto";
import { SOURCE_TEMPLATES } from "../src/templates/sourceTemplates.js";
import { sourceProfile } from "../src/templates/sourceProfile.js";
import { templateHash, validateTemplate } from "../src/templates/schema.js";
import {
  sourceSelection,
  sourceModuleVersion,
  sourcePackagePath,
  SOURCE_MODULES,
} from "../src/services/sourcePackages.js";
import { SOURCE_ADDON_SOURCES } from "../src/services/sourceAddonSources.js";
import { loadWithMocks } from "./loadWithMocks.js";
import { addonPath } from "../src/services/rehldsPackages.js";

test("Source templates keep games, monitoring ports and runtime families separate", () => {
  for (const { document } of SOURCE_TEMPLATES) {
    const template = validateTemplate(document),
      p = sourceProfile(template)!;
    assert.ok(p);
    assert.equal(template.monitoring?.queryPort, "game");
    assert.equal(template.ports.filter((p) => p.protocol === "tcp").length, 1);
    assert.equal(
      template.gameConfig !== false && template.gameConfig?.path,
      `/${p.base}/cfg/server.cfg`,
    );
    assert.equal(template.lifecycle?.startup[1], p.game);
    assert.equal(Boolean(template.fastDownload), p.game !== "cs2");
  }
  assert.equal(sourceProfile(null), null);
  assert.deepEqual(sourceSelection("cs2", ["counterstrikesharp"]), [
    "metamod",
    "counterstrikesharp",
  ]);
  assert.deepEqual(sourceSelection("cs2", ["swiftlys2"]), ["swiftlys2"]);
  assert.throws(() => sourceSelection("cs2", ["sourcemod"]));
  assert.throws(() => sourceSelection("css", ["modsharp"]));
  assert.match(sourceModuleVersion("cs2", "metamod"), /^2\./);
  assert.match(sourceModuleVersion("css", "metamod"), /^1\./);
});
test("archive destinations reject traversal and unexpected roots", () => {
  for (const name of [
    "../../etc/passwd",
    "/etc/passwd",
    "addons/../x",
    "addons\\x",
    "random/file",
  ])
    assert.throws(() =>
      sourcePackagePath("metamod", name, "serverfiles/cstrike"),
    );
  assert.equal(
    sourcePackagePath(
      "swiftlys2",
      "swiftlys2-linux-v1.4.12-with-runtimes/addons/swiftlys2/bin/a.so",
      "serverfiles/game/csgo",
    ),
    "serverfiles/game/csgo/addons/swiftlys2/bin/a.so",
  );
  assert.equal(
    sourcePackagePath("modsharp", "sharp/bin/a.so", "serverfiles/game/csgo"),
    "serverfiles/game/sharp/bin/a.so",
  );
});
test("framework transaction keeps settings, verifies dependencies, and removes owned files only", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "source-framework-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const template = validateTemplate(
    SOURCE_TEMPLATES.find((t) => t.id === "builtin-cs2-native")!.document,
  );
  const server = {
    id: 7,
    runtime_uuid: "fixture",
    docker_container_id: "fixture-container",
    provider_metadata_json: JSON.stringify({
      template: { document: template, hash: templateHash(template) },
    }),
  };
  const rehlds = loadWithMocks(
    "../src/services/rehldsAddons.ts",
    {
      "node:fs": { promises: fs },
      "node:path": path,
      "node:crypto": crypto,
      "./servers.js": {},
      "./rehldsContent.js": {},
      "../utils/storage.js": {},
      "../utils/docker.js": {},
      "./nativeBackups.js": {},
      "./nativeRestore.js": {},
      "./rehldsPackages.js": { addonPath },
      "./nativeRestoreJournal.js": {},
    },
    { Buffer },
  );
  const calls: string[] = [];
  let containerStatus = "created";
  const service = loadWithMocks(
    "../src/services/sourceAddons.ts",
    {
      "node:fs": {
        promises: {
          ...fs,
          open: async (...args: any[]) => {
            const h = await (fs.open as any)(...args);
            h.chown = async () => {};
            return h;
          },
          chown: async () => {},
        },
      },
      "node:path": path,
      "node:crypto": crypto,
      "./servers.js": { getServerOrThrow: async () => server },
      "../templates/nativeContract.js": { nativeTemplate: () => template },
      "../templates/sourceProfile.js": { sourceProfile },
      "../utils/storage.js": {
        getServerStoragePaths: () => ({ dataDir: root }),
      },
      "../utils/docker.js": {
        checkContainerStatus: async () => containerStatus,
      },
      "./rehldsAddons.js": {
        ...rehlds,
        safeFile: async (...args: any[]) => {
          const value = await rehlds.safeFile(...args);
          return value;
        },
      },
      "./sourcePackages.js": {
        SOURCE_MODULES,
        sourceSelection,
        sourceModuleVersion,
        sourceModulePackage: (g: string, m: string) =>
          g === "cs2" && m === "metamod" ? "metamod-cs2" : m,
        downloadSourcePackage: async (m: string) => {
          calls.push("download");
          return new Map(
            m === "metamod-cs2"
              ? [
                  [
                    "serverfiles/game/csgo/addons/metamod/bin/linuxsteamrt64/libserver.so",
                    Buffer.from("metamod"),
                  ],
                  ["serverfiles/game/csgo/addons/metamod/metaplugins.ini", Buffer.from("; plugins")],
                ]
              : [
                  [
                    "serverfiles/game/csgo/addons/counterstrikesharp/bin/linuxsteamrt64/counterstrikesharp.so",
                    Buffer.from("sharp"),
                  ],
                  [
                    "serverfiles/game/csgo/addons/counterstrikesharp/configs/core.json",
                    Buffer.from("default"),
                  ],
                ],
          );
        },
      },
      "./sourceAddonSources.js": { SOURCE_ADDON_SOURCES },
      "./nativeBackups.js": {
        createNativeBackup: async () => {
          calls.push("backup");
          return { ok: true, name: "recovery.tar.gz" };
        },
      },
      "./nativeRestore.js": {
        restoreNativeBackup: async (
          _: unknown,
          _name: unknown,
          _held: unknown,
          stage: any,
        ) => {
          await stage(root);
          return { ok: true, exitCode: 0 };
        },
      },
    },
    { Buffer, structuredClone },
  );
  await fs.mkdir(
    path.join(root, "serverfiles/game/csgo/addons/counterstrikesharp/configs"),
    { recursive: true },
  );
  await fs.writeFile(
    path.join(root, "serverfiles/game/csgo/gameinfo.gi"),
    "SearchPaths\n{\n Game csgo\n Game core\n}\n",
  );
  const config = path.join(
    root,
    "serverfiles/game/csgo/addons/counterstrikesharp/configs/core.json",
  );
  await fs.writeFile(config, "custom");
  const p = await service.sourceAddonPreview(
    7,
    ["counterstrikesharp"],
    "install",
  );
  await assert.rejects(
    service.changeSourceAddon(7, ["counterstrikesharp"], "stale", "install"),
    /refresh/,
  );
  containerStatus = "running";
  await assert.rejects(
    service.changeSourceAddon(
      7,
      ["counterstrikesharp"],
      p.fingerprint,
      "install",
    ),
    /Stop/,
  );
  assert.equal(calls.length, 0);
  containerStatus = "created";
  await service.changeSourceAddon(
    7,
    ["counterstrikesharp"],
    p.fingerprint,
    "install",
  );
  assert.equal(calls[0], "backup");
  assert.equal(await fs.readFile(config, "utf8"), "custom");
  await assert.rejects(
    service.sourceAddonPreview(7, ["modsharp"], "install"),
    /Remove Metamod/,
  );
  assert.match(
    await fs.readFile(
      path.join(root, "serverfiles/game/csgo/gameinfo.gi"),
      "utf8",
    ),
    /Game\s+csgo\/addons\/metamod/,
  );
  await assert.rejects(
    service.sourceAddonPreview(7, ["metamod"], "uninstall"),
    /dependent/,
  );
  const remove = await service.sourceAddonPreview(
    7,
    ["counterstrikesharp"],
    "uninstall",
  );
  await service.changeSourceAddon(
    7,
    ["counterstrikesharp"],
    remove.fingerprint,
    "uninstall",
  );
  assert.equal(await fs.readFile(config, "utf8"), "custom");
  const result = await service.sourceAddonPreview(7);
  assert.equal(
    result.catalogue.find((m: any) => m.id === "counterstrikesharp").installed,
    false,
  );
  const loaders = service.patchSourceLoaders(
    "SearchPaths\n{\n Game csgo\n}\n",
    ["metamod", "swiftlys2"],
  );
  assert.equal(
    service.patchSourceLoaders(loaders, ["metamod", "swiftlys2"]),
    loaders,
  );
  assert.ok(
    loaders.indexOf("Game\tcsgo/addons/metamod") <
      loaders.indexOf("Game\tcsgo/addons/swiftlys2"),
  );
  assert.throws(
    () => service.patchSourceLoaders(loaders, ["metamod", "modsharp"]),
    /separate/,
  );
  const windows = service.patchSourceLoaders(
    "SearchPaths\r\n{\r\n Game csgo // Valve\r\n}\r\n",
    ["metamod"],
  );
  assert.equal(service.patchSourceLoaders(windows, ["metamod"]), windows);
  assert.doesNotMatch(
    service.patchSourceLoaders(windows, []),
    /addons\/metamod/,
  );
});
