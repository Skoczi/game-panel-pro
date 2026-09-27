import type { ReportProgress } from './operationProgress.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { getServerOrThrow } from './servers.js';
import { rehldsScope } from './rehldsContent.js';
import { getServerStoragePaths } from '../utils/storage.js';
import { checkContainerStatus } from '../utils/docker.js';
import { createNativeBackup } from './nativeBackups.js';
import { restoreNativeBackup } from './nativeRestore.js';
import { REHLDS_MODULES, packageSources, selectedModules, downloadAddonFiles, addonPath } from './rehldsPackages.js';
import { syncDirectory } from './nativeRestoreJournal.js';

export async function safeFile(root: string, relative: string, create = false) {
  addonPath(relative);
  const owner = await fs.lstat(root); if (!owner.isDirectory()) throw new Error('Invalid game root');
  let current = root;
  const parts = relative.split('/');
  for (const component of parts.slice(0, -1)) {
    current = path.join(current, component);
    let stat = await fs.lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat && create) { await fs.mkdir(current, { mode: 0o755 }); await fs.chown(current, owner.uid, owner.gid); stat = await fs.lstat(current); }
    if (!stat) return null;
    if (!stat.isDirectory()) throw new Error('Addon destination crosses a link or non-directory');
  }
  const filename = path.join(root, ...parts), stat = await fs.lstat(filename).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (stat && !stat.isFile()) throw new Error('Addon destination must be a regular file');
  return { filename, stat, owner };
}
export async function textFile(root: string, filename: string) {
  const target = await safeFile(root, filename);
  if (!target?.stat) return null;
  if (target.stat.size > 128 * 1024) throw new Error('Addon configuration too large');
  return fs.readFile(target.filename, 'utf8');
}
export async function addonPreview(serverId: number, selection: unknown) {
  const modules = selectedModules(selection), scope = await rehldsScope(serverId), server = await getServerOrThrow(serverId);
  if (scope.root !== 'data' || scope.base !== '/serverfiles/cstrike') throw Object.assign(new Error('Addon installation requires the standard data/serverfiles/cstrike layout'), { statusCode: 409 });
  const root = path.join(getServerStoragePaths(serverId).dataDir, 'serverfiles');
  const liblist = await textFile(root, 'cstrike/liblist.gam');
  if (!liblist) throw new Error('Missing liblist.gam');
  const gameDlls = [...liblist.matchAll(/^[ \t]*gamedll_linux\s+"([^"]+)"/gm)].map(m => m[1]);
  if (gameDlls.some(dll => !['dlls/cs.so', 'addons/metamod/metamod_i386.so'].includes(dll))) throw Object.assign(new Error('Custom game loader detected. Review liblist.gam before installing this pack'), { statusCode: 409 });
  const installedText = await textFile(root, '.gamepanel-addons.json');
  let installed: Record<string, string> = {};
  if (installedText) { const value = JSON.parse(installedText); if (value?.modules && typeof value.modules === 'object') installed = value.modules; }
  const fingerprint = createHash('sha256').update(JSON.stringify([server.runtime_uuid, modules, liblist, installedText, packageSources])).digest('hex');
  return { fingerprint, modules: REHLDS_MODULES.filter(m => modules.includes(m.id)), installed,
    stopped: Boolean(server.docker_container_id && ['exited', 'created', 'dead'].includes(await checkContainerStatus(server.docker_container_id))),
    changes: ['Create a verified backup before changing files', 'Install pinned Linux binaries and missing default files', 'Preserve existing addon configuration and data', 'Register selected modules in liblist.gam and Metamod', 'Keep the server stopped; restore the pre-change backup to roll back'],
    sources: packageSources.filter(s => modules.includes(s.module)).map(s => ({ url: s.url, sha256: s.sha256 })) };
}
export async function stageAddonFiles(root: string, files: Map<string, Buffer>, modules: string[], versions: Record<string, string>, backup: string, report?: ReportProgress) {
  async function write(relative: string, bytes: Buffer) {
    const target = (await safeFile(root, relative, true))!;
    const handle = await fs.open(target.filename, 'w', /\.so$|^hlds_linux$/.test(relative) ? 0o755 : 0o644);
    try { await handle.writeFile(bytes); await handle.chown(target.owner.uid, target.owner.gid); await handle.sync(); }
    finally { await handle.close(); }
    await syncDirectory(path.dirname(target.filename));
  }
  const moduleFor = (name: string) => name.includes('/metamod/reunion/') || name === 'cstrike/reunion.cfg' ? 'reunion'
    : name.includes('/metamod/') ? 'metamod' : name.includes('reapi') ? 'reapi'
    : name.includes('/amxmodx/') ? 'amxx' : name.startsWith('cstrike/') ? 'regamedll' : 'rehlds';
  for (const name of files.keys()) await safeFile(root, name);
  for (const module of modules) {
    const entries = [...files].filter(([name]) => moduleFor(name) === module);
    const moduleName = REHLDS_MODULES.find(m => m.id === module)!.name;
    await report?.({ stage: `install-${module}`, message: `Installing ${moduleName}`, percent: 0 });
    let processed = 0, last = 0;
    for (const [relative, original] of entries) {
    const target = await safeFile(root, relative, true);
    const preserve = target?.stat && (/\.(ini|cfg)$/.test(relative) || /\/amxmodx\/(configs|data)\//.test(relative));
    let bytes = original;
    if (relative.endsWith('/configs/users.ini')) bytes = Buffer.from(original.toString('utf8').replace(/^"loopback".*$/gm, '; Add Steam ID administrators through the panel.'));
    if (relative === 'cstrike/reunion.cfg') bytes = Buffer.from(original.toString('utf8').replace(/^SteamIdHashSalt\s*=.*$/m, 'SteamIdHashSalt = ' + randomBytes(32).toString('hex')));
    if (!preserve) await write(relative, bytes);
    const percent = Math.floor(++processed / entries.length * 100);
    if (percent >= last + 10) { last = percent; await report?.({ stage: `install-${module}`, message: `Installing ${moduleName}`, percent }); }
    }
    await report?.({ stage: `install-${module}`, message: `${moduleName} files ready`, percent: 100 });
  }
  await report?.({ stage: 'configure', message: 'Registering addon modules', percent: null });
  if (modules.includes('metamod')) {
    const liblist = (await textFile(root, 'cstrike/liblist.gam'))!;
    await write('cstrike/liblist.gam', Buffer.from(liblist.replace(/^[ \t]*gamedll_linux\s+.*(?:\r?\n|$)/gm, '').trimEnd() + '\ngamedll_linux "addons/metamod/metamod_i386.so"\n'));
    const filename = 'cstrike/addons/metamod/plugins.ini';
    let plugins = await textFile(root, filename) || '';
    for (const [id, entry] of [['amxx', 'linux addons/amxmodx/dlls/amxmodx_mm_i386.so'], ['reunion', 'linux addons/metamod/reunion/reunion_mm_i386.so']]) {
      if (modules.includes(id) && !plugins.split(/\r?\n/).some(line => line.trim() === entry)) plugins = plugins.trimEnd() + '\n' + entry + '\n';
    }
    await write(filename, Buffer.from(plugins));
  }
  if (modules.includes('reapi')) {
    const filename = 'cstrike/addons/amxmodx/configs/modules.ini';
    const content = await textFile(root, filename) || '';
    if (!content.split(/\r?\n/).some(line => line.trim() === 'reapi')) await write(filename, Buffer.from(content.trimEnd() + '\nreapi\n'));
  }
  await write('.gamepanel-addons.json', Buffer.from(JSON.stringify({ modules: versions, backup, installedAt: new Date().toISOString() })));
}
export async function installRehldsAddons(serverId: number, selection: unknown, expected: string, report?: ReportProgress) {
  await report?.({ stage: 'prepare', message: 'Preparing addon installation', percent: null });
  const preview = await addonPreview(serverId, selection);
  if (!preview.stopped || preview.fingerprint !== expected) throw Object.assign(new Error('Stop the server and refresh the installation preview'), { statusCode: 409 });
  const modules = preview.modules.map(m => m.id), files = await downloadAddonFiles(modules, report);
  const server = await getServerOrThrow(serverId);
  if (!server.docker_container_id) throw new Error('Game container unavailable');
  const runtime = { ...server, docker_container_id: server.docker_container_id };
  if ((await addonPreview(serverId, modules)).fingerprint !== expected) throw new Error('Configuration changed during package preparation');
  const backup = await createNativeBackup(runtime, true, 'Before-ReHLDS-addons', report);
  if (!backup.ok || backup.stderr) throw new Error('A verified pre-change backup is required');
  const versions = { ...preview.installed, ...Object.fromEntries(preview.modules.map(m => [m.id, m.version])) };
  await report?.({ stage: 'staging', message: 'Preparing isolated game files', percent: null });
  const result = await restoreNativeBackup(runtime, backup.name, true, async staging => {
    if ((await addonPreview(serverId, modules)).fingerprint !== expected) throw new Error('Configuration changed during backup');
    await stageAddonFiles(path.join(staging, 'serverfiles'), files, modules, versions, backup.name, report);
    await report?.({ stage: 'commit', message: 'Applying addon installation', percent: null });
  });
  return { ...result, stdout: `Addons installed. Server remains stopped. Rollback backup: ${backup.name}` };
}
