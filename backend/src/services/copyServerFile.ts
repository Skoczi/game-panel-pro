import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveServerPath } from './fileExplorer.js';
import { ensureIsDir, ensureIsFile } from '../utils/fsBrowser.js';

export async function copyServerFile(serverId: number, from: string, to: string, root?: string, toRoot?: string) {
  const source = await resolveServerPath({ serverId, root, path: from });
  const target = await resolveServerPath({ serverId, root: toRoot || root, path: to });
  await ensureIsFile(source.absPath, source.rootDir);
  await ensureIsDir(path.dirname(target.absPath), target.rootDir);
  if (target.apiPath === '/' || source.absPath === target.absPath) throw Object.assign(new Error('Choose a different destination filename'), { statusCode: 409 });
  const temporary = path.join(path.dirname(target.absPath), `.gp-copy-${randomUUID()}`);
  try {
    const input = await fs.open(source.absPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await input.stat();
      if (!stat.isFile()) throw Object.assign(new Error('Only regular files can be copied'), { statusCode: 400 });
      const output = await fs.open(temporary, 'wx', stat.mode & 0o777);
      try {
        const buffer = Buffer.alloc(1024 * 1024);
        let position = 0;
        while (position < stat.size) {
          const { bytesRead } = await input.read(buffer, 0, Math.min(buffer.length, stat.size - position), position);
          if (!bytesRead) throw Object.assign(new Error('Source file changed. Try again.'), { statusCode: 409 });
          await output.writeFile(buffer.subarray(0, bytesRead));
          position += bytesRead;
        }
        const latest = await input.stat();
        if (latest.size !== stat.size || latest.mtimeMs !== stat.mtimeMs) throw Object.assign(new Error('Source file changed. Try again.'), { statusCode: 409 });
        await output.chown(stat.uid, stat.gid);
        await output.chmod(stat.mode & 0o777);
        await output.sync();
      } finally { await output.close(); }
    } finally { await input.close(); }
    // Publish only a complete copy; link fails rather than overwriting any existing entry.
    await fs.link(temporary, target.absPath);
    return { root: target.root, path: target.apiPath, sourceRoot: source.root, sourcePath: source.apiPath };
  } catch (error: any) {
    if (error.code === 'EEXIST') throw Object.assign(new Error('A file with this name already exists'), { statusCode: 409 });
    throw error;
  } finally { await fs.unlink(temporary).catch(() => {}); }
}
