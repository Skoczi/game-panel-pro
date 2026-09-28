import { promises as fs } from 'node:fs';
import path from 'node:path';
import { addonPath } from './rehldsPackages.js';

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
