import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { safeFile, textFile } from './addonFiles.js';
import { syncDirectory } from './nativeRestoreJournal.js';

export const MATCHBOT_ENTRY = 'linux addons/matchbot/dlls/matchbot_csco_mm.so';
export const MATCHBOT_BINARY = 'cstrike/addons/matchbot/dlls/matchbot_csco_mm.so';
const staticPaths = new Set([
  'engine_i486.so', 'hlds_linux', 'filesystem_stdio.so', 'cstrike/dlls/cs.so',
  'cstrike/delta.lst', 'cstrike/game.cfg', 'cstrike/game_init.cfg',
  'cstrike/addons/metamod/metamod_i386.so', 'cstrike/addons/metamod/config.ini',
  'cstrike/addons/metamod/plugins.ini', 'cstrike/liblist.gam', '.gamepanel-addons.json',
  MATCHBOT_BINARY, 'cstrike/addons/matchbot/language.txt',
]);
export function matchbotDestination(name: string) {
  return staticPaths.has(name) || /^cstrike\/addons\/amxmodx\/configs\/(?:maps\/)?plugins(?:-[A-Za-z0-9_-]+)?\.ini$/.test(name);
}
// Deliberately narrow: unknown plugins remain enabled and visible in the preview.
// Matching an arbitrary word such as "team" would disable unrelated admin tools.
export function conflictsWithMatchbot(name: string) {
  return /^(?:mq2_match|matchbot|pug(?:mod|_.*)?|automix(?:_.*)?|mix(?:_manager|_system)?|csdm(?:_.*)?|deathmatch(?:_.*)?|(?:auto_?)?respawn(?:_.*)?|(?:auto_?)?team_balance(?:r)?|autobalance|ptb|team_join|team_join_management|mapchooser|nextmap|galileo|deagsmapmanager|map_manager(?:_.*)?)\.amxx$/i.test(name);
}
export function disableConflictingPlugins(text: string) {
  const disabled: string[] = [];
  const content = text.replace(/^([ \t]*)([^;\s][^\r\n]*)/gm, (line, indent, rest) => {
    const plugin = rest.split(/[\s;]/)[0];
    if (!conflictsWithMatchbot(plugin)) return line;
    disabled.push(plugin);
    return `${indent}; ${rest} ; ESERV MatchBot CSCO`;
  });
  return { content, disabled };
}
export function registerMatchbot(text: string) {
  const disabled: string[] = [];
  let found = false;
  const content = text.replace(/^([ \t]*)(linux(?:32)?\s+[^\r\n]*)/gm, (line, indent, rest) => {
    const file = rest.split(/\s+/)[1]?.replace(/^"|"$/g, '');
    if (file === 'addons/matchbot/dlls/matchbot_csco_mm.so' && !found) { found = true; return MATCHBOT_ENTRY; }
    if (file && (file.endsWith('/matchbot_csco_mm.so') || /\/(?:matchbot|pugmod|csdm|respawn)[^/]*\.so$/i.test(file))) {
      disabled.push(file); return `${indent}; ${rest} ; ESERV MatchBot CSCO`;
    }
    return line;
  });
  return { content: found ? content : content.trimEnd() + '\n' + MATCHBOT_ENTRY + '\n', disabled };
}
export async function pluginLists(root: string) {
  const paths = ['cstrike/addons/metamod/plugins.ini'];
  for (const directory of ['cstrike/addons/amxmodx/configs', 'cstrike/addons/amxmodx/configs/maps']) {
    // safeFile validates every ancestor without following game-owned symlinks.
    if (!await safeFile(root, directory + '/plugins.ini')) continue;
    const entries = await fs.readdir(path.join(root, directory)).catch((e: any) => { if (e.code === 'ENOENT') return []; throw e; });
    paths.push(...entries.filter(n => /^plugins(?:-[A-Za-z0-9_-]+)?\.ini$/.test(n)).map(n => directory + '/' + n));
  }
  const result = new Map<string, string>();
  for (const name of paths) result.set(name, await textFile(root, name) || '');
  return result;
}
export const fileHash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
type Entry = { name: string; existed: boolean; sha256: string | null; mode: number; uid: number; gid: number };
type Transaction = { directory: string; entries: Entry[] };
const journalName = '.matchbot-transaction.json';
export async function hasMatchbotTransaction(serverRoot: string) {
  return fs.lstat(path.join(serverRoot, journalName)).then(() => true, (e: any) => { if (e.code === 'ENOENT') return false; throw e; });
}
async function atomicFile(root: string, name: string, bytes: Buffer, metadata: Pick<Entry, 'mode'|'uid'|'gid'>) {
  const target = (await safeFile(root, name, true))!;
  const temporary = target.filename + '.' + randomUUID() + '.tmp';
  const handle = await fs.open(temporary, 'wx', metadata.mode & 0o777);
  try { await handle.writeFile(bytes); await handle.chown(metadata.uid, metadata.gid); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(temporary, target.filename);
  await syncDirectory(path.dirname(target.filename));
}
export async function recoverMatchbotFiles(serverRoot: string) {
  const filename = path.join(serverRoot, journalName);
  const journal: Transaction = JSON.parse(await fs.readFile(filename, 'utf8'));
  if (!/^\.matchbot-recovery-[a-f0-9-]{36}$/.test(journal.directory) || !Array.isArray(journal.entries) || journal.entries.length > 512 || journal.entries.some(e => !matchbotDestination(e.name))) throw new Error('invalid_matchbot_recovery');
  const root = path.join(serverRoot, 'data/serverfiles');
  for (const entry of journal.entries) {
    if (entry.existed) {
      const target = await safeFile(path.join(serverRoot, journal.directory), entry.name);
      if (!target?.stat) throw new Error('incomplete_matchbot_recovery');
      const bytes = await fs.readFile(target.filename);
      if (fileHash(bytes) !== entry.sha256) throw new Error('invalid_matchbot_recovery');
      await atomicFile(root, entry.name, bytes, entry);
    } else {
      const target = await safeFile(root, entry.name);
      if (target?.stat) { await fs.unlink(target.filename); await syncDirectory(path.dirname(target.filename)); }
    }
  }
  await fs.unlink(filename);
  await syncDirectory(serverRoot);
}

/** Commit only approved binaries/lists. Never replace a journal, spool, marker or private config. */
export async function commitMatchbotFiles(serverRoot: string, files: Map<string, Buffer>, afterWrite?: (name: string) => Promise<void>) {
  if (await hasMatchbotTransaction(serverRoot)) throw new Error('matchbot_recovery_required');
  if (!files.size || files.size > 512 || [...files.keys()].some(name => !matchbotDestination(name))) throw new Error('invalid_matchbot_destination');
  const root = path.join(serverRoot, 'data/serverfiles');
  const directory = '.matchbot-recovery-' + randomUUID();
  const recovery = path.join(serverRoot, directory);
  await fs.mkdir(recovery, { mode: 0o700 });
  const entries: Entry[] = [];
  for (const name of files.keys()) {
    const target = await safeFile(root, name);
    const stat = target?.stat;
    const owner = await fs.stat(root);
    const bytes = stat ? await fs.readFile(target!.filename) : null;
    entries.push({ name, existed: Boolean(stat), sha256: bytes ? fileHash(bytes) : null, mode: stat?.mode ?? (/\.so$|^hlds_linux$/.test(name) ? 0o755 : 0o644), uid: stat?.uid ?? owner.uid, gid: stat?.gid ?? owner.gid });
    if (bytes) {
      const backup = (await safeFile(recovery, name, true))!;
      const handle = await fs.open(backup.filename, 'wx', 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      // Each new ancestor must reach disk before the transaction can become visible.
      let parent = path.dirname(backup.filename);
      while (parent.startsWith(recovery)) { await syncDirectory(parent); parent = path.dirname(parent); }
    }
  }
  const filename = path.join(serverRoot, journalName), temporary = filename + '.' + randomUUID();
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify({ directory, entries })); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporary, filename); await syncDirectory(serverRoot);
  try {
    for (const entry of entries) {
      await atomicFile(root, entry.name, files.get(entry.name)!, entry);
      if (fileHash(await fs.readFile(path.join(root, entry.name))) !== fileHash(files.get(entry.name)!)) throw new Error('matchbot_write_verification_failed');
      await afterWrite?.(entry.name);
    }
    // Keep a private rollback manifest after successful installation, without replaying it on boot.
    await fs.copyFile(filename, path.join(recovery, 'manifest.json'));
    const manifest = await fs.open(path.join(recovery, 'manifest.json'), 'r');
    try { await manifest.sync(); } finally { await manifest.close(); }
    await syncDirectory(recovery);
    await fs.unlink(filename); await syncDirectory(serverRoot);
    return directory;
  } catch (error) {
    await recoverMatchbotFiles(serverRoot);
    throw error;
  }
}
