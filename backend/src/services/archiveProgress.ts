import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { ReportProgress } from './operationProgress.js';

// Count entries without following symlinks, matching tar's default traversal.
export async function countArchiveEntries(root: string, keys: string[]): Promise<number> {
  let total = 0;
  const pending = keys.map(key => path.join(root, key));
  while (pending.length) {
    const entry = pending.pop()!;
    const stat = await fs.lstat(entry);
    total++;
    if (stat.isDirectory()) for (const child of await fs.readdir(entry)) pending.push(path.join(entry, child));
  }
  return total;
}
export async function archiveWithProgress(root: string, keys: string[], output: string, signal: AbortSignal, report: ReportProgress) {
  await report({ stage: 'backup-scan', message: 'Backup: counting entries', percent: null });
  const total = await countArchiveEntries(root, keys);
  await report({ stage: 'backup', message: 'Backup: archiving entries', percent: 0 });
  const child = spawn('tar', ['-czvf', output, '-C', root, '--', ...keys], {
    signal, timeout: 600_000, env: { ...process.env, COPYFILE_DISABLE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-65536); });
  const completed = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(Object.assign(new Error('Backup archive failed'), { code, stderr })));
  });
  // Attach a rejection handler immediately while stdout is still being consumed.
  void completed.catch(() => {});
  let count = 0, last = 0;
  try {
    for await (const _line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      const percent = Math.min(99, Math.floor(++count / Math.max(1, total) * 100));
      if (percent >= last + 5) {
        last = percent;
        await report({ stage: 'backup', message: 'Backup: archiving entries', percent });
      }
    }
    await completed;
    await report({ stage: 'backup', message: 'Backup: archive written', percent: 100 });
  } catch (error) { child.kill('SIGTERM'); await completed.catch(() => {}); throw error; }
}
