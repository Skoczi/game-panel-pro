import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getServerOrThrow } from './servers.js';
import { getServerStoragePaths } from '../utils/storage.js';
import { runtimeLabels } from '../utils/docker/ownership.js';
import { createNativeBackup } from './nativeBackups.js';
import { addonPreview, safeFile, stageAddonFiles } from './rehldsAddons.js';
import { downloadAddonFiles } from './rehldsPackages.js';
import { blockNativeServer } from './nativeOperationLock.js';
import { mqDocker, verifiedSource, sourceHashes, mqRoot, privateJson, readPrivate } from './mixqueueNode.js';
import { mqFail } from './mixqueueContract.js';
import { startBackupJob, readBackupJob } from './backupJobs.js';
import { commitMatchbotFiles, disableConflictingPlugins, fileHash, hasMatchbotTransaction, MATCHBOT_BINARY, pluginLists, registerMatchbot } from './matchbotFiles.js';

const dependencies = ['rehlds', 'metamod', 'regamedll'];
export const MATCHBOT_VERSION = '0.4.0';
const jobPath = (id: number) => path.join(getServerStoragePaths(id).serverRoot, '.mixqueue-plugin-job.json');
export async function matchbotJob(id: number) {
  const ref = await readPrivate<{ id: string }>(jobPath(id));
  if (!ref) return null;
  const job = await readBackupJob(id, ref.id);
  // Never return native command output, private files or exception details.
  const codes = ['incompatible_game_image', 'plugin_preview_changed', 'stop_game_before_plugin_install', 'matchbot_backup_failed', 'source_verification_failed'];
  return { id: job.id, status: job.status, progress: job.progress, error: job.status === 'failed' || job.status === 'interrupted' ? codes.includes(job.error || '') ? job.error : 'matchbot_install_failed' : null };
}
export async function matchbotPreview(id: number) {
  const preview = await addonPreview(id, dependencies), server = await getServerOrThrow(id);
  if (!server.docker_container_id) throw mqFail('game_container_missing');
  const info = await mqDocker.getContainer(server.docker_container_id).inspect();
  const root = path.join(getServerStoragePaths(id).dataDir, 'serverfiles');
  const lists = await pluginLists(root);
  let activeAssignment = false;
  for (const name of ['active.txt', 'active-matchbot.txt']) {
    const marker = await safeFile(root, 'cstrike/addons/amxmodx/configs/mq2/' + name);
    if (marker?.stat && marker.stat.size > 0) activeAssignment = true;
  }
  const conflicts = [...lists].flatMap(([file, text]) => (file.endsWith('/metamod/plugins.ini') ? registerMatchbot(text) : disableConflictingPlugins(text)).disabled.map(plugin => ({ file: file.replace(/^cstrike\//, ''), plugin })));
  return {
    version: MATCHBOT_VERSION, controller: 'MatchBot CSCO', stopped: preview.stopped, activeAssignment,
    fingerprint: fileHash(Buffer.from(JSON.stringify([preview.fingerprint, info.Image, [...lists], sourceHashes['matchbot_csco_mm.so']]))),
    dependencies: preview.modules.map(m => ({ name: m.name, version: m.version })), conflicts,
  };
}
export function supportsMatchbotLibc(output: string) {
  const match = /glibc\s+(\d+)\.(\d+)/i.exec(output);
  return Boolean(match && (Number(match[1]) > 2 || Number(match[1]) === 2 && Number(match[2]) >= 36));
}
async function checkImage(image: string, id: number) {
  const probe = await mqDocker.createContainer({
    Image: image, Entrypoint: [], WorkingDir: '/', User: '1000:1000',
    // Run the 32-bit loader itself: the host's glibc is not evidence of container compatibility.
    Cmd: ['/bin/sh', '-c', 'getconf GNU_LIBC_VERSION && /lib/ld-linux.so.2 --version'],
    Labels: { ...runtimeLabels(), 'gamepanel.managed': 'true', 'gamepanel.oneshot': 'true', 'gamepanel.nativeOperation': 'matchbot-check', 'gamepanel.serverId': String(id) },
    HostConfig: { NetworkMode: 'none', ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'], Memory: 64 * 1024 ** 2, PidsLimit: 32, RestartPolicy: { Name: 'no' }, LogConfig: { Type: 'local', Config: { 'max-size': '1m', 'max-file': '2' } } },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await probe.start();
    const result = await Promise.race([probe.wait(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(mqFail('incompatible_game_image')), 15000); })]);
    const output = await probe.logs({ stdout: true, stderr: true, tail: 12 });
    if (result.StatusCode !== 0 || !supportsMatchbotLibc(String(output))) throw mqFail('incompatible_game_image');
  } finally {
    if (timer) clearTimeout(timer);
    await probe.remove({ force: true });
  }
}

export async function startMatchbotInstall(id: number, expected: unknown, actor: string) {
  const preview = await matchbotPreview(id);
  if (!preview.stopped) throw mqFail('stop_game_before_plugin_install');
  if (preview.activeAssignment) throw mqFail('matchbot_assignment_active');
  if (typeof expected !== 'string' || expected !== preview.fingerprint) throw mqFail('plugin_preview_changed');
  const job = await startBackupJob(id, 'addon', actor, async report => {
    const paths = getServerStoragePaths(id), root = path.join(paths.dataDir, 'serverfiles');
    let staging: string | undefined;
    try {
      const server = await getServerOrThrow(id);
      if (!server.docker_container_id) throw mqFail('game_container_missing');
      const info = await mqDocker.getContainer(server.docker_container_id).inspect();
      if (info.State.Running) throw mqFail('stop_game_before_plugin_install');
      await report({ stage: 'compatibility', message: 'Checking MatchBot compatibility', percent: null });
      await checkImage(info.Image, id);
      const binary = await verifiedSource('matchbot_csco_mm.so');
      const language = await verifiedSource('matchbot-language.txt');
      const files = await downloadAddonFiles(dependencies, report);
      const current = await matchbotPreview(id);
      if (!current.stopped || current.activeAssignment || current.fingerprint !== expected) throw mqFail('plugin_preview_changed');
      // Executor has already stopped. Snapshot credentials/spool privately; these are NEVER a rollback target.
      if (server.runtime_uuid && /^[a-f0-9]{32}$/.test(server.runtime_uuid)) {
        const source = path.join(mqRoot, 'servers', server.runtime_uuid);
        if (await fs.stat(source).then(() => true, () => false)) {
          const snapshot = path.join(paths.serverRoot, '.mixqueue-private-' + randomUUID());
          await fs.mkdir(snapshot, { mode: 0o700 });
          for (const name of ['binding.json', 'state']) {
            const from = path.join(source, name);
            if (await fs.stat(from).then(() => true, () => false)) await fs.cp(from, path.join(snapshot, name), { recursive: true, errorOnExist: true });
          }
        }
      }
      const backup = await createNativeBackup({ ...server, docker_container_id: server.docker_container_id }, true, 'Before-MatchBot-CSCO', report);
      if (!backup.ok || backup.stderr) throw mqFail('matchbot_backup_failed');
      await report({ stage: 'staging', message: 'Preparing MatchBot CSCO', percent: null });
      staging = await fs.mkdtemp(path.join(paths.serverRoot, '.matchbot-stage-'));
      const lists = await pluginLists(root);
      const seeds = new Set([...files.keys(), ...lists.keys(), 'cstrike/liblist.gam', '.gamepanel-addons.json', 'cstrike/addons/matchbot/language.txt']);
      for (const name of seeds) {
        const source = await safeFile(root, name);
        if (!source?.stat) continue;
        const target = (await safeFile(staging, name, true))!;
        await fs.copyFile(source.filename, target.filename);
      }
      const addon = await addonPreview(id, dependencies);
      await stageAddonFiles(staging, files, dependencies, { ...addon.installed, ...Object.fromEntries(addon.modules.map(m => [m.id, m.version])), matchbot: MATCHBOT_VERSION }, backup.name, report);
      const plan = new Map<string, Buffer>();
      for (const name of seeds) {
        const target = await safeFile(staging, name);
        if (target?.stat) plan.set(name, await fs.readFile(target.filename));
      }
      plan.set(MATCHBOT_BINARY, binary);
      // Preserve operator translations while pinning the production controller binary.
      if (!plan.has('cstrike/addons/matchbot/language.txt')) plan.set('cstrike/addons/matchbot/language.txt', language);
      for (const [name, text] of lists) plan.set(name, Buffer.from(name.endsWith('/metamod/plugins.ini') ? registerMatchbot(text).content : disableConflictingPlugins(text).content));
      for (const [name, bytes] of plan) {
        const target = await safeFile(root, name);
        if (target?.stat && fileHash(await fs.readFile(target.filename)) === fileHash(bytes)) plan.delete(name);
      }
      const last = await matchbotPreview(id);
      if (!last.stopped || last.activeAssignment || last.fingerprint !== expected) throw mqFail('plugin_preview_changed');
      await report({ stage: 'commit', message: 'Applying MatchBot CSCO', percent: null });
      // Transport directories are required even when this game has never had AMXX installed.
      for (const relative of ['cstrike/addons/amxmodx/configs/mq2/active-matchbot.txt', 'cstrike/addons/amxmodx/data/mq2/events.jsonl']) await safeFile(root, relative, true);
      await commitMatchbotFiles(paths.serverRoot, plan);
      if (fileHash(await fs.readFile(path.join(root, MATCHBOT_BINARY))) !== sourceHashes['matchbot_csco_mm.so']) throw mqFail('source_verification_failed');
      return { ok: true, exitCode: 0, stdout: 'MatchBot CSCO 0.4.0 installed. Server remains stopped.' };
    } catch (error: any) {
      if (await hasMatchbotTransaction(paths.serverRoot)) blockNativeServer(id, 'MatchBot recovery required. Restart the node agent to recover.');
      // Paths, configuration values and raw Docker errors never enter job logs/API.
      throw mqFail(['incompatible_game_image', 'plugin_preview_changed', 'stop_game_before_plugin_install', 'matchbot_backup_failed', 'source_verification_failed'].includes(error?.message) ? error.message : 'matchbot_install_failed');
    } finally {
      if (staging) await fs.rm(staging, { recursive: true, force: true });
    }
  });
  await privateJson(jobPath(id), { id: job.id });
}
