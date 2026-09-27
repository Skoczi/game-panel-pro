import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { addonPreview, safeFile, textFile } from './rehldsAddons.js';
import { REHLDS_MODULES } from './rehldsPackages.js';
import { getServerOrThrow } from './servers.js';
import { getServerStoragePaths } from '../utils/storage.js';
import { createNativeBackup } from './nativeBackups.js';
import { restoreNativeBackup } from './nativeRestore.js';
import { syncDirectory } from './nativeRestoreJournal.js';
import type { ReportProgress } from './operationProgress.js';

const binaries: Record<string, string> = {
  metamod: 'cstrike/addons/metamod/metamod_i386.so',
  amxx: 'cstrike/addons/amxmodx/dlls/amxmodx_mm_i386.so',
  reapi: 'cstrike/addons/amxmodx/modules/reapi_amxx_i386.so',
  reunion: 'cstrike/addons/metamod/reunion/reunion_mm_i386.so',
};
const pluginsPath = 'cstrike/addons/metamod/plugins.ini';
const modulesPath = 'cstrike/addons/amxmodx/configs/modules.ini';
function target(selection: unknown) {
  if (!Array.isArray(selection) || selection.length !== 1 || typeof selection[0] !== 'string' || !Object.prototype.hasOwnProperty.call(binaries, selection[0]))
    throw Object.assign(new Error('This component requires restoring a backup to roll back.'), { statusCode: 400 });
  return selection[0] as string;
}
export async function removalState(root: string, id: string, installed: Record<string, string>) {
  const plugins = await textFile(root, pluginsPath) || '';
  const modules = await textFile(root, modulesPath) || '';
  const present = new Set(Object.keys(installed));
  for (const [name, binary] of Object.entries(binaries)) if ((await safeFile(root, binary))?.stat) present.add(name);
  const dependents = REHLDS_MODULES.filter(m => m.id !== id && present.has(m.id) && m.requires.includes(id));
  let blocked = dependents.length ? `Uninstall first: ${dependents.map(m => m.name).join(', ')}.` : '';
  if (id === 'metamod' && plugins.split(/\r?\n/).some(line => /^\s*(linux|win32)\s+/i.test(line))) blocked = 'Remove registered Metamod plugins first.';
  const registered = plugins.split(/\r?\n/).filter(line => /^\s*linux\s+/i.test(line));
  if (['amxx', 'reunion'].includes(id) && registered.some(line => line.includes(path.posix.basename(binaries[id])) && !line.trim().startsWith('linux ' + binaries[id].slice('cstrike/'.length)))) blocked = 'Custom loader entry. Update it in File Editor first.';
  if (!present.has(id)) blocked = 'No installation found.';
  return { plugins, modules, blocked };
}
export async function removalPreview(serverId: number, selection: unknown) {
  const id = target(selection);
  const base = await addonPreview(serverId, [id]);
  const root = path.join(getServerStoragePaths(serverId).dataDir, 'serverfiles');
  const state = await removalState(root, id, base.installed);
  return { ...base, sources: [], modules: REHLDS_MODULES.filter(m => m.id === id), blocked: state.blocked,
    fingerprint: createHash('sha256').update(JSON.stringify([base.fingerprint, id, state])).digest('hex'),
    changes: ['Create a verified backup', `Remove ${REHLDS_MODULES.find(m => m.id === id)!.name}`, 'Keep configuration and user data', ...(id === 'amxx' ? ['AMXX plugins will stop loading'] : [])] };
}
export async function stageAddonRemoval(root: string, id: string, backup: string) {
  target([id]);
  async function write(relative: string, content: string) {
    const file = (await safeFile(root, relative, true))!;
    const handle = await fs.open(file.filename, 'w', file.stat ? file.stat.mode & 0o777 : 0o644);
    try { await handle.writeFile(content); await handle.chown(file.owner.uid, file.owner.gid); await handle.sync(); }
    finally { await handle.close(); }
    await syncDirectory(path.dirname(file.filename));
  }
  const installed = JSON.parse(await textFile(root, '.gamepanel-addons.json') || '{"modules":{}}');
  const state = await removalState(root, id, installed.modules || {});
  if (state.blocked) throw new Error(state.blocked);
  if (id === 'metamod') {
    const liblist = await textFile(root, 'cstrike/liblist.gam');
    if (!liblist) throw new Error('Missing liblist.gam');
    await write('cstrike/liblist.gam', liblist.replace(/^[ \t]*gamedll_linux\s+.*(?:\r?\n|$)/gm, '').trimEnd() + '\ngamedll_linux "dlls/cs.so"\n');
  }
  if (id === 'amxx' || id === 'reunion') {
    const relative = binaries[id].slice('cstrike/'.length);
    await write(pluginsPath, state.plugins.split('\n').filter(line => {
      const match = /^\s*linux\s+(\S+)/.exec(line); return match?.[1] !== relative;
    }).join('\n'));
  }
  if (id === 'reapi') await write(modulesPath, state.modules.split('\n').filter(line => !/^\s*reapi(?:\s*(?:;.*)?)?\r?$/.test(line)).join('\n'));
  const binary = await safeFile(root, binaries[id]);
  if (binary?.stat) { await fs.unlink(binary.filename); await syncDirectory(path.dirname(binary.filename)); }
  delete installed.modules?.[id];
  await write('.gamepanel-addons.json', JSON.stringify({ ...installed, backup, updatedAt: new Date().toISOString() }));
}
export async function uninstallRehldsAddon(serverId: number, selection: unknown, expected: string, report?: ReportProgress) {
  const preview = await removalPreview(serverId, selection);
  if (preview.blocked || !preview.stopped || preview.fingerprint !== expected) throw Object.assign(new Error(preview.blocked || 'Stop the server and refresh the removal preview'), { statusCode: 409 });
  const id = target(selection), server = await getServerOrThrow(serverId);
  if (!server.docker_container_id) throw new Error('Game container unavailable');
  const runtime = { ...server, docker_container_id: server.docker_container_id };
  const backup = await createNativeBackup(runtime, true, 'Before-addon-removal', report);
  if (!backup.ok || backup.stderr) throw new Error('A verified pre-change backup is required');
  await report?.({ stage: 'staging', message: 'Preparing addon removal', percent: null });
  const result = await restoreNativeBackup(runtime, backup.name, true, async staging => {
    if ((await removalPreview(serverId, selection)).fingerprint !== expected) throw new Error('Configuration changed during backup');
    await report?.({ stage: 'uninstall', message: `Removing ${preview.modules[0].name}`, percent: 0 });
    await stageAddonRemoval(path.join(staging, 'serverfiles'), id, backup.name);
    await report?.({ stage: 'uninstall', message: `Removed ${preview.modules[0].name}`, percent: 100 });
  });
  return { ...result, stdout: `Addon removed: ${preview.modules[0].name}. Rollback backup: ${backup.name}` };
}
