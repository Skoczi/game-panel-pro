import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import type { GameServerRow } from "../types/gameServer.js";
import { serverRepository } from "../database/index.js";
import { getConfig } from "../config.js";
import { getServerStoragePaths } from "../utils/storage.js";
import { ownsContainer } from "../utils/docker/ownership.js";
import { seal, unseal } from "../nodes/protocol.js";
import { nativeOperationRunning } from "./nativeOperationLock.js";
import { mixqueueProfile } from "./mixqueueProfile.js";
import { validateMixqueueImport, mqFail, MQ_API } from "./mixqueueContract.js";
import {
  mqDocker,
  mqRoot,
  mixqueueImage,
  mixqueueNodeStatus,
  privateJson,
  readPrivate,
  verifiedSource,
  dockerHostPath,
} from "./mixqueueNode.js";
import { MixqueueDockerRuntime } from "./mixqueueDocker.js";
import {
  MixqueueSupervisor,
  type MixqueueAssignment,
} from "./mixqueueSupervisor.js";
import { startMixqueueBroker } from "./mixqueueBroker.js";
import { mixqueueRcon } from "./mixqueueRcon.js";
import { matchbotPreview, startMatchbotInstall, matchbotJob, MATCHBOT_VERSION } from './matchbotInstaller.js';
import { MATCHBOT_ENTRY } from './matchbotFiles.js';
import { matchbotVersionForHash, MATCHBOT_MIN_WEB_VERSION } from './matchbotRelease.js';

type Binding = {
  serverId: string;
  game: string;
  verifiedBuild: string;
  key: string;
  rconPassword: string;
  enabled: boolean;
  revision: string;
  suspendedGeneration?: string;
};
const keyFor = (server: GameServerRow) => {
  if (!/^[a-f0-9]{32}$/.test(server.runtime_uuid || ""))
    throw mqFail("invalid_server_identity");
  return server.runtime_uuid!;
};
const directory = (key: string) => {
  if (!/^[a-f0-9]{32}$/.test(key)) throw mqFail("invalid_server_identity");
  return path.join(mqRoot, "servers", key);
};
const brokers = new Map<
  string,
  Awaited<ReturnType<typeof startMixqueueBroker>>
>();
const errors = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(run);
  queue = result.catch(() => {});
  return result;
}
async function binding(server: GameServerRow): Promise<Binding | null> {
  const key = keyFor(server),
    stored = await readPrivate<{ sealed: string }>(
      path.join(directory(key), "binding.json"),
    );
  if (!stored) return null;
  try {
    return JSON.parse(
      unseal(stored.sealed, getConfig().jwtSecret, "mixqueue:" + key),
    );
  } catch {
    throw mqFail("configuration_unavailable");
  }
}
async function save(server: GameServerRow, value: Binding) {
  const key = keyFor(server);
  await privateJson(path.join(directory(key), "binding.json"), {
    sealed: seal(
      JSON.stringify(value),
      getConfig().jwtSecret,
      "mixqueue:" + key,
    ),
  });
}
async function load(id: number) {
  const server = await serverRepository.findById(id);
  if (!server) throw mqFail("server_not_found", 404);
  return server;
}
async function gameInfo(server: GameServerRow) {
  if (!server.docker_container_id) throw mqFail("game_container_missing");
  const info = await mqDocker
    .getContainer(server.docker_container_id)
    .inspect();
  if (!ownsContainer(info.Config.Labels || {}))
    throw mqFail("game_container_not_owned");
  return info;
}
const generation = (info: Awaited<ReturnType<typeof gameInfo>>) =>
  info.Id + ":" + info.State.StartedAt;

async function safePath(root: string, relative: string, create = false) {
  if (relative.split("/").some((p) => !p || p === "." || p === ".."))
    throw mqFail("unsafe_storage_path");
  if ((await fs.realpath(root)) !== path.resolve(root))
    throw mqFail("unsafe_storage_path");
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    if (create) {
      try {
        await fs.mkdir(current, { mode: 0o755 });
        await fs.chown(current, 1000, 1000);
      } catch (error: any) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw mqFail("unsafe_storage_path");
  }
  return current;
}
async function gamePaths(server: GameServerRow, create = false) {
  const profile = mixqueueProfile(server);
  const root = await safePath(
    getServerStoragePaths(server.id).dataDir,
    profile.base,
  );
  const prefix = `addons/${profile.engine}`;
  const config = await safePath(root, `${prefix}/configs/mq2`, create);
  const journal = await safePath(root, `${prefix}/data/mq2`, create);
  return { root, config, journal, profile };
}
async function readRcon(server: GameServerRow): Promise<string | null> {
  try {
    const profile = mixqueueProfile(server),
      data = getServerStoragePaths(server.id).dataDir;
    const cfg = await safePath(
      data,
      profile.base +
        (profile.game === "cs16" ? "/server.cfg" : "/cfg/server.cfg"),
    );
    const handle = await fs.open(
      cfg,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      if ((await handle.stat()).size > 1024 * 1024) return null;
      const matches = [
        ...(await handle.readFile("utf8")).matchAll(
          /^\s*rcon_password\s+(?:"([^"\r\n]+)"|([^\s;]+))\s*(?:\/\/.*)?$/gm,
        ),
      ];
      const password = matches.length
        ? matches[matches.length - 1][1] || matches[matches.length - 1][2]
        : null;
      return password &&
        password.length <= 128 &&
        !/[\x00-\x1f"\x7f]/.test(password)
        ? password
        : null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}
async function closeBroker(key: string) {
  await brokers.get(key)?.close();
  brokers.delete(key);
}

const runtime = new MixqueueDockerRuntime(
  mqDocker,
  process.env.GAMEPANEL_NODE_ID || "local",
  async (a) => {
    try {
      const server = (await serverRepository.listAll()).find(
        (s) => s.runtime_uuid === a.runtimeKey,
      );
      if (!server) throw mqFail("server_not_found");
      const config = await binding(server),
        image = await mixqueueImage();
      if (!config?.enabled || !image) throw mqFail("runtime_not_installed");
      const paths = await gamePaths(server);
      if (config.game !== paths.profile.game) throw mqFail("game_changed");
      const root = directory(a.runtimeKey),
        state = path.join(root, "state"),
        broker = path.join(root, "broker");
      for (const target of [state, broker]) {
        await fs.mkdir(target, { recursive: true, mode: 0o700 });
        await fs.chown(target, 1000, 1000);
      }
      // Status from a previous process is not evidence of current connectivity.
      await fs.rm(path.join(state, "status.json"), { force: true });
      await fs.writeFile(
        path.join(broker, "config.json"),
        JSON.stringify({
          server_id: config.serverId,
          game: config.game,
          adapter: paths.profile.adapter,
          verified_build: config.verifiedBuild,
          api: MQ_API,
          key_env: "MQ2_AGENT_KEY",
          rcon_password_env: "MQ2_RCON_PASSWORD",
          rcon_host: "broker",
          rcon_port: paths.profile.port,
          game_root: "/game",
          journal: "/journal/events.jsonl",
          database: "/state/spool.sqlite",
        }),
        { mode: 0o644 },
      );
      const socket = path.join(broker, "agent.sock");
      await fs.rm(socket, { force: true });
      const authorize = async () => {
        const current = await load(server.id),
          assigned = await binding(current),
          info = await gameInfo(current);
        if (
          keyFor(current) !== a.runtimeKey ||
          !assigned?.enabled ||
          assigned.revision !== a.revision ||
          generation(info) !== a.gameGeneration ||
          assigned.suspendedGeneration === a.gameGeneration ||
          !info.State.Running ||
          current.desired_state !== "running" ||
          nativeOperationRunning(current.id)
        )
          throw mqFail("integration_suspended");
        return {
          serverId: assigned.serverId,
          game: assigned.game,
          key: assigned.key,
        };
      };
      await authorize();
      brokers.set(
        a.runtimeKey,
        await startMixqueueBroker(socket, {
          authorize,
          rcon: async (command) => {
            await authorize();
            const info = await gameInfo(await load(server.id));
            const host =
              info.NetworkSettings.Networks[getConfig().gamesNetwork]
                ?.IPAddress;
            if (!host) throw mqFail("game_network_unavailable");
            return mixqueueRcon(
              {
                host,
                port: paths.profile.port,
                password: config.rconPassword,
                game: config.game,
              },
              command,
            );
          },
        }),
      );
      errors.delete(a.runtimeKey);
      return {
        image,
        engine: paths.profile.engine as "amxmodx" | "sourcemod",
        configDirectory: await dockerHostPath(paths.config),
        journalDirectory: await dockerHostPath(paths.journal),
        stateDirectory: await dockerHostPath(state),
        brokerDirectory: await dockerHostPath(broker),
      };
    } catch (error: any) {
      errors.set(a.runtimeKey, safeError(error));
      await closeBroker(a.runtimeKey);
      throw error;
    }
  },
  closeBroker,
);
const supervisor = new MixqueueSupervisor(runtime);
let initialized = false;
async function reconcile() {
  if (!initialized) {
    // Old executors have dead broker sockets after an ESERV/node restart.
    for (const key of (await runtime.list()).keys()) await runtime.stop(key);
    initialized = true;
  }
  const assignments: MixqueueAssignment[] = [];
  for (const server of await serverRepository.listAll()) {
    if (!server.runtime_uuid) continue;
    try {
      const assigned = await binding(server);
      if (!assigned) continue;
      const info = await gameInfo(server),
        current = generation(info);
      assignments.push({
        runtimeKey: keyFor(server),
        revision: assigned.revision,
        enabled: assigned.enabled,
        gameRunning:
          info.State.Running &&
          server.desired_state === "running" &&
          assigned.suspendedGeneration !== current &&
          !nativeOperationRunning(server.id),
        gameGeneration: current,
      });
    } catch (error: any) {
      errors.set(server.runtime_uuid, safeError(error));
    }
  }
  await supervisor.reconcile(assignments);
}
export function startMixqueueWorker() {
  const timer = setInterval(() => {
    void serial(reconcile).catch(() => {});
  }, 5000);
  timer.unref();
  return {
    async stop() {
      clearInterval(timer);
      await serial(() => supervisor.close());
    },
  };
}
const publicErrors = new Set([
  "unsupported_server",
  "unsupported_game",
  "missing_game_port",
  "invalid_import",
  "invalid_identity_or_endpoint",
  "invalid_key",
  "invalid_rcon_password",
  "invalid_build",
  "configuration_unavailable",
  "unsafe_storage_path",
  "game_container_missing",
  "game_container_not_owned",
  "game_network_unavailable",
  "runtime_not_installed",
  "game_changed",
  "rcon_password_required",
  "disconnect_before_identity_change",
  "stop_game_before_plugin_install",
  "framework_required",
  "get5_required",
  "plugin_exists_different_version",
  "source_verification_failed",
  "integration_suspended",
  "plugin_not_installed",
  "not_configured",
  "server_not_found",
  "identity_already_connected",
  "plugin_preview_changed",
  "incompatible_game_image",
  "matchbot_install_failed",
  "matchbot_backup_failed",
  "matchbot_assignment_active",
]);
export const safeError = (error: any) =>
  publicErrors.has(error?.message) ? error.message : "operation_failed";

export async function mixqueueStatus(id: number) {
  const server = await load(id);
  let supported = true;
  try {
    mixqueueProfile(server);
  } catch {
    supported = false;
  }
  if (!supported)
    return {
      supported: false,
      node: await mixqueueNodeStatus(),
      configured: false,
      enabled: false,
    };
  const assigned = await binding(server),
    key = keyFor(server);
  const executors = await runtime.list(),
    running = executors.get(key)?.running || false;
  const nodeStatus = await mixqueueNodeStatus();
  const runtimeUpdateRequired = running && executors.get(key)?.image !== await mixqueueImage();
  let state: any = null;
  try {
    state = await readPrivate(
      path.join(directory(key), "state", "status.json"),
    );
  } catch {}
  const fresh =
    running &&
    assigned?.enabled === true &&
    typeof state?.checkedAt === "number" &&
    Date.now() - state.checkedAt >= 0 &&
    Date.now() - state.checkedAt < 15000;
  let pluginInstalled = false;
  let installedPluginVersion: string | null = null;
  const profile = mixqueueProfile(server);
  try {
    const p = mixqueueProfile(server),
      root = await safePath(getServerStoragePaths(id).dataDir, p.base);
    const file = await safePath(
      root,
      p.game === 'cs16' ? 'addons/matchbot/dlls/matchbot_csco_mm.so' : `addons/${p.engine}/plugins/mq2_bridge.smx`,
    );
    pluginInstalled = (await fs.stat(file)).isFile();
    if (p.game === 'cs16') {
      installedPluginVersion = matchbotVersionForHash(createHash('sha256').update(await fs.readFile(file)).digest('hex'));
      pluginInstalled = installedPluginVersion !== null;
      const list = await safePath(root, 'addons/metamod/plugins.ini');
      pluginInstalled = pluginInstalled && (await fs.readFile(list, 'utf8')).split(/\r?\n/).some(line => line.trim() === MATCHBOT_ENTRY);
    }
  } catch {}
  let logs: Array<{ time: number; event: string }> = [];
  try {
    const events = await readPrivate<any>(
      path.join(directory(key), "state", "events.json"),
    );
    if (Array.isArray(events))
      logs = events
        .slice(-50)
        .filter(
          (e) =>
            Number.isFinite(e?.time) &&
            [
              "rcon_or_plugin",
              "journal_or_events",
              "matchmaking_or_command",
              "ready",
              "waiting",
            ].includes(e?.event),
        )
        .map((e) => ({ time: e.time, event: e.event }));
  } catch {}
  return {
    supported,
    node: nodeStatus,
    configured: Boolean(assigned),
    enabled: assigned?.enabled || false,
    serverId: assigned?.serverId || null,
    pluginInstalled,
    plugin: profile.game === 'cs16' ? { name: 'MatchBot CSCO', version: MATCHBOT_VERSION, installedVersion: pluginInstalled ? installedPluginVersion : null, updateAvailable: pluginInstalled && installedPluginVersion !== MATCHBOT_VERSION, minimumWebVersion: MATCHBOT_MIN_WEB_VERSION } : { name: 'MixQueue bridge', version: '0.2.3' },
    pluginOperation: profile.game === 'cs16' ? await matchbotJob(id) : null,
    process: running ? "running" : "stopped",
    runtimeUpdateRequired,
    rcon: fresh && state.rcon === true,
    journal: fresh && state.journal === true,
    heartbeat: fresh && state.heartbeat === true,
    ready: fresh && state.ready === true && pluginInstalled && (profile.game !== 'cs16' || installedPluginVersion === MATCHBOT_VERSION) && !runtimeUpdateRequired && nodeStatus.installed && !nodeStatus.updateAvailable,
    lastCheck: fresh ? state.checkedAt : null,
    error: errors.get(key) || (running ? null : supervisor.status(key).error),
    logs,
  };
}
export async function changeMixqueue(id: number, input: any, actor = 'operator') {
  return serial(async () => {
    const server = await load(id),
      profile = mixqueueProfile(server),
      key = keyFor(server);
    if (
      !input ||
      typeof input !== "object" ||
      ![
        "import",
        "enable",
        "disable",
        "restart",
        "disconnect",
        "plugin",
        "plugin-preview",
      ].includes(input.action)
    )
      throw mqFail("invalid_import", 400);
    if (input.action === 'plugin-preview') return profile.game === 'cs16' ? matchbotPreview(id) : { controller: 'MixQueue bridge', version: '0.2.3' };
    const current = await binding(server);
    if (input.action === "import") {
      const imported = validateMixqueueImport(
        input.configuration,
        profile.game,
      );
      if (current && current.serverId !== imported.serverId)
        throw mqFail("disconnect_before_identity_change");
      for (const other of await serverRepository.listAll()) {
        if (
          other.id !== id &&
          other.runtime_uuid &&
          (await binding(other))?.serverId === imported.serverId
        )
          throw mqFail("identity_already_connected");
      }
      const password =
        imported.rconPassword ||
        (typeof input.rconPassword === "string" ? input.rconPassword : null) ||
        (await readRcon(server));
      if (!password) throw mqFail("rcon_password_required", 400);
      if (password.length > 128 || /[\x00-\x1f"\x7f]/.test(password))
        throw mqFail("invalid_rcon_password", 400);
      await runtime.stop(key);
      await save(server, {
        ...imported,
        rconPassword: password,
        enabled: false,
        revision: randomBytes(16).toString("hex"),
      });
    } else if (input.action === "disconnect") {
      if (current) await save(server, { ...current, enabled: false });
      await runtime.stop(key);
      await fs.rm(directory(key), { recursive: true, force: true });
    } else if (input.action === "plugin") {
      if (profile.game === 'cs16') {
        if ((await gameInfo(server)).State.Running) throw mqFail('stop_game_before_plugin_install');
        await runtime.stop(key);
        await startMatchbotInstall(id, input.fingerprint, actor);
      } else await installPlugin(server);
    } else {
      if (!current) throw mqFail("not_configured");
      const enabled = input.action !== "disable";
      if (enabled && !(await mixqueueImage()))
        throw mqFail("runtime_not_installed");
      if (enabled) {
        try {
          await gamePaths(server);
        } catch {
          throw mqFail("plugin_not_installed");
        }
      }
      // Commit disabled state before revoking the broker to close races with in-flight requests.
      await save(server, { ...current, enabled: false });
      await runtime.stop(key);
      await save(server, {
        ...current,
        enabled,
        revision: randomBytes(16).toString("hex"),
        suspendedGeneration: undefined,
      });
    }
    errors.delete(key);
    supervisor.retry(key);
    await reconcile();
    return mixqueueStatus(id);
  });
}

async function installPlugin(server: GameServerRow) {
  const info = await gameInfo(server);
  if (info.State.Running) throw mqFail("stop_game_before_plugin_install");
  const p = mixqueueProfile(server),
    root = await safePath(getServerStoragePaths(server.id).dataDir, p.base);
  const engine = `addons/${p.engine}`;
  try {
    await safePath(root, engine + "/plugins");
    await safePath(root, engine + "/configs");
  } catch {
    throw mqFail("framework_required");
  }
  try {
    await safePath(root, engine + "/plugins/get5.smx");
  } catch {
    throw mqFail("get5_required");
  }
  const file = "mq2_bridge.smx", data = await verifiedSource(file);
  const plugin = path.join(root, engine, "plugins", file);
  try {
    const stat = await fs.lstat(plugin);
    if (
      !stat.isFile() ||
      createHash("sha256")
        .update(await fs.readFile(plugin))
        .digest("hex") !== createHash("sha256").update(data).digest("hex")
    )
      throw mqFail("plugin_exists_different_version");
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
    await fs.writeFile(plugin, data, { flag: "wx", mode: 0o644 });
    await fs.chown(plugin, 1000, 1000);
  }
  await gamePaths(server, true);

}

export async function suspendMixqueueContainer(containerId: string) {
  await serial(async () => {
    const server = (await serverRepository.listAll()).find(
      (s) => s.docker_container_id === containerId,
    );
    if (!server?.runtime_uuid) return;
    const current = await binding(server);
    if (!current) return;
    await save(server, {
      ...current,
      suspendedGeneration: generation(await gameInfo(server)),
    });
    await runtime.stop(keyFor(server));
  });
}
export async function detachMixqueue(server: GameServerRow) {
  if (!server.runtime_uuid) return;
  await serial(async () => {
    const current = await binding(server);
    if (current) await save(server, { ...current, enabled: false });
    await runtime.stop(keyFor(server));
    await fs.rm(directory(keyFor(server)), { recursive: true, force: true });
  });
}

/** Clone/transfer targets never inherit a queued match or a plugin journal cursor. */
export async function resetClonedMixqueue(server: GameServerRow) {
  let p: ReturnType<typeof mixqueueProfile>;
  try {
    p = mixqueueProfile(server);
  } catch {
    return;
  }
  const root = await safePath(getServerStoragePaths(server.id).dataDir, p.base);
  for (const suffix of ["configs/mq2", "data/mq2"]) {
    try {
      const target = await safePath(root, `addons/${p.engine}/${suffix}`);
      await fs.rm(target, { recursive: true, force: true });
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
