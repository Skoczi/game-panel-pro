import path from 'node:path';
import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

export type SharedReference = { package: string; sha256: string; path: string };
export type SharedPackage = { id: string; name: string; version: string; sha256: string; bytes: number; files: number; createdAt: string; root: string };
export function sharedRoot() {
  const root = process.env.GAMEPANEL_SHARED_FILES_ROOT;
  if (!root || !path.isAbsolute(root)) throw Object.assign(new Error('Shared files storage is not configured on this node'), { statusCode: 409 });
  return root;
}
export function sharedId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value)) throw new Error('Invalid shared package ID');
  return value;
}
export function sharedRelative(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 200 || /[\\\x00-\x1f:]/.test(value) || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid shared package path');
  return value;
}
export function sharedReference(value: unknown): SharedReference {
  const raw = value as SharedReference;
  if (!raw || typeof raw !== 'object' || Object.keys(raw).some(k => !['package', 'sha256', 'path'].includes(k)) || !/^[a-f0-9]{64}$/.test(raw.sha256)) throw new Error('Invalid shared package reference');
  return { package: sharedId(raw.package), sha256: raw.sha256, path: raw.path === '.' ? '.' : sharedRelative(raw.path) };
}
export async function readSharedPackage(id: string): Promise<SharedPackage> {
  const directory = path.join(sharedRoot(), 'packages', sharedId(id));
  if (!(await fs.lstat(directory)).isDirectory()) throw new Error('Invalid shared package directory');
  const data = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')) as SharedPackage;
  if (data.id !== id || !/^[a-f0-9]{64}$/.test(data.sha256) || (data.root !== '.' && sharedRelative(data.root) !== data.root)) throw new Error('Invalid shared package manifest');
  return data;
}
export async function resolveSharedPath(input: SharedReference): Promise<string> {
  const ref = sharedReference(input);
  const pkg = await readSharedPackage(ref.package).catch(() => { throw Object.assign(new Error(`Shared package ${ref.package} is missing or invalid on this node`), { statusCode: 409 }); });
  if (pkg.sha256 !== ref.sha256) throw Object.assign(new Error(`Shared package ${ref.package} checksum differs from the template`), { statusCode: 409 });
  const root = path.join(sharedRoot(), 'packages', pkg.id, 'files');
  const parts = [...(pkg.root === '.' ? [] : pkg.root.split('/')), ...(ref.path === '.' ? [] : ref.path.split('/'))];
  let current = root;
  for (const part of ['', ...parts]) {
    current = path.join(current, part);
    const st = await fs.lstat(current);
    if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Shared mounts require real directories');
  }
  return current;
}
export async function preflightSharedMounts(mounts: Array<{ shared?: SharedReference }>) {
  for (const mount of mounts) if (mount.shared) await resolveSharedPath(mount.shared);
}
export const sharedDependencies = (mounts: Array<{ shared?: SharedReference }>) => [...new Map(mounts.filter(m => m.shared).map(m => [m.shared!.package, { package: m.shared!.package, sha256: m.shared!.sha256 }])).values()].sort((a,b) => a.package.localeCompare(b.package));
export async function recordSharedDependencies(mounts: Array<{ shared?: SharedReference }>, serverfiles: string) {
  const dependencies = sharedDependencies(mounts);
  if (!dependencies.length) return;
  if (await fs.realpath(serverfiles) !== path.resolve(serverfiles) || !(await fs.lstat(serverfiles)).isDirectory()) throw new Error('Shared templates require a real serverfiles directory');
  const temporary = path.join(serverfiles, '.shared-dependencies-' + randomUUID());
  await fs.writeFile(temporary, JSON.stringify(dependencies), {flag:'wx',mode:0o444});
  await fs.rename(temporary, path.join(serverfiles,'.eserv-shared-files.json'));
}
export async function verifySharedBackup(mounts: Array<{ shared?: SharedReference }>, serverfiles: string) {
  const expected = sharedDependencies(mounts);
  const file = path.join(serverfiles, '.eserv-shared-files.json');
  const stat = await fs.lstat(file).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  if (!expected.length && !stat) return;
  if (!stat?.isFile() || stat.size > 16384) throw new Error('Shared package manifest is missing from the backup');
  const actual = JSON.parse(await fs.readFile(file, 'utf8'));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Backup requires different shared packages');
  await preflightSharedMounts(mounts);
}
export async function listSharedPackages() {
  const root = sharedRoot();
  const ids = await fs.readdir(path.join(root, 'packages')).catch(e => { if(e.code === 'ENOENT') return []; throw e; });
  return Promise.all(ids.filter(id => /^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)).map(readSharedPackage));
}

// ZIP extraction is streamed and published by rename only after every file succeeds.
// No links, device files, duplicate paths, traversal or replacement of an existing version.
export async function importSharedZip(zipPath: string, input: { id: string; name: string; version: string; root?: string }, progress = (_bytes: number) => {}) {
  const id = sharedId(input.id), root = input.root || '.';
  if (root !== '.') sharedRelative(root);
  if (!input.name?.trim() || input.name.length > 100 || !input.version?.trim() || input.version.length > 60) throw new Error('Enter package name and version');
  const packages = path.join(sharedRoot(), 'packages');
  await fs.mkdir(packages, { recursive: true });
  const destination = path.join(packages, id);
  if (await fs.lstat(destination).catch(() => null)) throw new Error('This package version already exists');
  const stat = await fs.lstat(zipPath);
  if (!stat.isFile() || stat.size > 100 * 1024 ** 3) throw new Error('Invalid or oversized ZIP');
  const stage = await fs.mkdtemp(path.join(packages, '.import-'));
  let bytes = 0, files = 0;
  try {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(zipPath)) hash.update(chunk);
    const sha256 = hash.digest('hex');
    const space = await fs.statfs(packages), budget = Number(space.bavail) * Number(space.bsize) - 2 * 1024 ** 3;
    const seen = new Set<string>();
    await fs.mkdir(path.join(stage, 'files'));
    await new Promise<void>((resolve, reject) => yauzl.open(zipPath, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const fail = (e: unknown) => { zip.close(); reject(e); };
      zip.on('error', fail); zip.on('end', resolve);
      zip.on('entry', entry => { void (async () => {
        const name = sharedRelative(entry.fileName.replace(/\/$/, ''));
        const mode = entry.externalFileAttributes >>> 16, type = mode & 0o170000;
        if (seen.has(name) || seen.size >= 200000 || (type && type !== 0o040000 && type !== 0o100000)) throw new Error('Unsupported or duplicate ZIP entry');
        seen.add(name);
        bytes += entry.uncompressedSize;
        if (bytes > Math.min(budget, 200 * 1024 ** 3)) throw new Error('Not enough space for this package');
        const target = path.join(stage, 'files', name);
        if (entry.fileName.endsWith('/')) await fs.mkdir(target, { recursive: true, mode: 0o755 });
        else {
          await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
          const stream = await new Promise<NodeJS.ReadableStream>((ok, no) => zip.openReadStream(entry, (e, s) => e || !s ? no(e) : ok(s)));
          await pipeline(stream, createWriteStream(target, { flags: 'wx', mode: mode & 0o111 ? 0o555 : 0o444 }));
          files++;
        }
        progress(bytes); zip.readEntry();
      })().catch(fail); });
      zip.readEntry();
    }));
    if (!files || !(await fs.lstat(path.join(stage, 'files', root))).isDirectory()) throw new Error('Package root does not exist');
    const manifest: SharedPackage = { id, name: input.name.trim(), version: input.version.trim(), root, sha256, bytes, files, createdAt: new Date().toISOString() };
    // Retain the exact source archive alongside the extracted package for independent
    // package backups. Hard-link on the same filesystem to avoid a second ZIP copy.
    await fs.link(zipPath, path.join(stage, 'source.zip')).catch(async e => {
      if (e.code !== 'EXDEV') throw e;
      await fs.copyFile(zipPath, path.join(stage, 'source.zip'));
    });
    await fs.chmod(path.join(stage, 'source.zip'), 0o444);
    await fs.writeFile(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o444 });
    await fs.rename(stage, destination);
    return manifest;
  } catch(error) { await fs.rm(stage, {recursive:true, force:true}); throw error; }
}

type Upload = { id: string; input: {id: string; name: string; version: string; root?: string}; total: number; offset: number; status: 'uploading' | 'importing' | 'completed' | 'failed'; bytes: number; error?: string; locked?: boolean };
const uploads = new Map<string, Upload>();
export function sharedUploads() { return [...uploads.values()].map(({locked, ...entry}) => entry); }
export async function beginSharedUpload(input: any) {
  sharedId(input?.id); if (!Number.isSafeInteger(input?.total) || input.total < 22 || input.total > 100 * 1024 ** 3) throw new Error('Invalid ZIP size');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || typeof input.version !== 'string' || !input.version.trim() || input.version.length > 60) throw new Error('Enter package name and version');
  if (input.root && input.root !== '.') sharedRelative(input.root);
  if ((await listSharedPackages()).some(p => p.id === input.id)) throw new Error('This package version already exists');
  if ([...uploads.values()].some(u => u.status === 'uploading' || u.status === 'importing')) throw new Error('Finish the current package import first');
  const id = randomUUID(), directory = path.join(sharedRoot(), 'inbox');
  await fs.mkdir(directory, {recursive:true});
  const space = await fs.statfs(directory);
  if (Number(space.bavail) * Number(space.bsize) < input.total + 2 * 1024 ** 3) throw new Error('Not enough storage for the ZIP');
  const upload: Upload = { id, input: {id:input.id,name:input.name,version:input.version,root:input.root}, total:input.total,offset:0,status:'uploading',bytes:0 };
  await fs.writeFile(path.join(directory, id + '.zip'), '', {flag:'wx',mode:0o600});
  uploads.set(id, upload); return upload;
}
export async function cancelSharedUpload(id: string) {
  const upload = uploads.get(id);
  if (!upload || upload.locked || upload.status === 'importing' || upload.status === 'completed') throw new Error('This upload cannot be cancelled');
  await fs.rm(path.join(sharedRoot(), 'inbox', id + '.zip'), {force:true});
  uploads.delete(id); return {ok:true};
}
export async function sharedUploadChunk(id: string, offset: unknown, base64: unknown) {
  const upload = uploads.get(id);
  if (!upload || upload.status !== 'uploading' || upload.locked || offset !== upload.offset || typeof base64 !== 'string' || base64.length > 1400000) throw new Error('Upload offset changed; reload and retry');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > 1024 * 1024 || upload.offset + bytes.length > upload.total) throw new Error('Invalid upload chunk');
  upload.locked = true;
  try { await fs.appendFile(path.join(sharedRoot(), 'inbox', id + '.zip'), bytes); upload.offset += bytes.length; }
  finally { upload.locked = false; }
  return { offset: upload.offset };
}
export function finishSharedUpload(id: string) {
  const u = uploads.get(id);
  if (!u || u.locked || u.status !== 'uploading' || u.offset !== u.total) throw new Error('ZIP upload is incomplete');
  u.status = 'importing';
  void importSharedZip(path.join(sharedRoot(), 'inbox', id + '.zip'), u.input, bytes => { u.bytes = bytes; }).then(() => { u.status = 'completed'; }).catch(e => { u.status = 'failed'; u.error = e.message; });
  return { id, status: u.status };
}
