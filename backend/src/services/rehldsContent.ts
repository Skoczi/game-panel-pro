import { gameAdminEntries, editGameAdmin } from './gameAdminEntries.js';
import { ensureIsFile } from '../utils/fsBrowser.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nativeGameConfig } from './nativeGameConfig.js';
import { getServerOrThrow } from './servers.js';
import { resolveServerPath, listServerFiles } from './fileExplorer.js';
import { atomicFileWrite, fileVersion } from './atomicFile.js';
import { prepareFileHistory, commitFileHistory, listFileHistory, readFileHistory } from './fileHistory.js';
import { getServerStoragePaths } from '../utils/storage.js';

const files = { rotation: 'mapcycle.txt', admins: 'addons/amxmodx/configs/users.ini', plugins: 'addons/amxmodx/configs/plugins.ini' } as const;
export type RehldsFile = keyof typeof files;
const fail = (message: string, statusCode = 400): never => { throw Object.assign(new Error(message), { statusCode }); };
export function validateRehldsContent(kind: RehldsFile, content: unknown, available: string[]) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > 128 * 1024 || content.includes('\0')) fail('Invalid configuration text');
  const text = content as string;
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith(';') && !line.startsWith('//'));
  if (lines.length > 2000) fail('Too many configuration entries');
  if (kind === 'rotation') {
    if (!lines.length) fail('Choose at least one installed map');
    for (const line of lines) if (!/^[A-Za-z0-9_-]+$/.test(line) || !available.includes(line)) fail('Rotation must contain installed map names, one per line');
  } else if (kind === 'plugins') {
    for (const line of lines) if (!/^[A-Za-z0-9_.-]+\.amxx(?:\s+debug)?$/.test(line) || !available.includes(line.split(/\s+/)[0])) fail('Choose installed AMXX plugins; unsupported syntax can be edited in File Manager');
  } else {
    for (const line of lines) if (!/^"STEAM_[0-5]:[01]:[0-9]{1,12}"\s+""\s+"[a-y]+"\s+"ce"(?:\s*;.*)?$/.test(line)) fail('The form supports Steam ID admins without passwords. Use File Manager to preserve other authentication formats');
  }
  return text.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
}

export async function rehldsScope(serverId: number) {
  const server = await getServerOrThrow(serverId), definition = nativeGameConfig(server);
  if (!definition || !/\/cstrike\/[^/]+\.cfg$/i.test(definition.path)) fail('This server has no supported CS 1.6 / ReHLDS layout', 409);
  return { root: definition!.root, base: path.posix.dirname(definition!.path) };
}
async function availableFiles(serverId: number, kind: RehldsFile, scope: Awaited<ReturnType<typeof rehldsScope>>) {
  if (kind === 'admins') return [];
  const directory = kind === 'rotation' ? 'maps' : 'addons/amxmodx/plugins';
  const entries = (await listServerFiles({ serverId, root: scope.root, path: path.posix.join(scope.base, directory) })).entries;
  return entries.filter(e => e.type === 'file' && (kind === 'rotation' ? /^[A-Za-z0-9_-]+\.bsp$/i : /^[A-Za-z0-9_.-]+\.amxx$/).test(e.name)).map(e => kind === 'rotation' ? e.name.slice(0, -4) : e.name);
}
async function context(serverId: number, key: string) {
  if (!Object.prototype.hasOwnProperty.call(files, key)) fail('Unknown ReHLDS section');
  const kind = key as RehldsFile, scope = await rehldsScope(serverId);
  const target = await resolveServerPath({ serverId, root: scope.root, path: path.posix.join(scope.base, files[kind]) });
  await ensureIsFile(target.absPath, target.rootDir);
  const stat = await fs.lstat(target.absPath).catch(() => null);
  if (!stat?.isFile() || stat.size > 128 * 1024) fail('Configuration unavailable. Install AMXX first or use File Manager to inspect this layout', 409);
  return { kind, scope, target, history: path.join(getServerStoragePaths(serverId).serverRoot, '.file-history') };
}
export async function readRehldsContent(serverId: number, key: string) {
  const ctx = await context(serverId, key), content = await fs.readFile(ctx.target.absPath, 'utf8');
  return { content, version: fileVersion(content), path: ctx.target.apiPath, root: ctx.target.root,
    available: await availableFiles(serverId, ctx.kind, ctx.scope),
    history: await listFileHistory(ctx.history, { root: ctx.target.root, path: ctx.target.apiPath }) };
}
export async function saveRehldsContent(serverId: number, key: string, body: any, actor: string) {
  const ctx = await context(serverId, key), scope = { root: ctx.target.root, path: ctx.target.apiPath };
  const input = body?.restore ? (await readFileHistory(ctx.history, scope, body.restore)).before : body?.content;
  const content = validateRehldsContent(ctx.kind, input, await availableFiles(serverId, ctx.kind, ctx.scope));
  let snapshot: Awaited<ReturnType<typeof prepareFileHistory>> | undefined;
  const version = await atomicFileWrite(ctx.target.absPath, content, typeof body?.version === 'string' ? body.version : '', async previous => {
    // Refuse the write if a recoverable pre-change snapshot cannot be recorded.
    snapshot = await prepareFileHistory(ctx.history, scope, actor, previous, content);
  });
  let warning: string | undefined;
  try { await commitFileHistory(ctx.history, snapshot!); }
  catch { warning = 'Saved; recovery snapshot exists but its commit marker could not be updated.'; }
  return { version, content, snapshotId: snapshot!.id, warning };
}

export async function readGameAdmins(serverId: number) {
  const value = await readRehldsContent(serverId, 'admins');
  return { ...gameAdminEntries(value.content), version: value.version, provider: 'amxx' };
}
export async function writeGameAdmin(serverId: number, body: any, actor: string) {
  const ctx = await context(serverId, 'admins');
  const previous = await fs.readFile(ctx.target.absPath, 'utf8');
  const content = editGameAdmin(previous, body.steamId, body.flags);
  let snapshot: Awaited<ReturnType<typeof prepareFileHistory>> | undefined;
  const version = await atomicFileWrite(ctx.target.absPath, content, typeof body.version === 'string' ? body.version : '', async before => {
    snapshot = await prepareFileHistory(ctx.history, { root: ctx.target.root, path: ctx.target.apiPath }, actor, before, content);
  });
  let warning: string | undefined;
  try { await commitFileHistory(ctx.history, snapshot!); } catch { warning = 'Saved; recovery snapshot requires reconciliation'; }
  return { ...gameAdminEntries(content), version, provider: 'amxx', snapshotId: snapshot!.id, ...(warning ? { warning } : {}) };
}
