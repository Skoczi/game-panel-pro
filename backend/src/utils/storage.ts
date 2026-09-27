import { resolveSharedPath, type SharedReference } from '../services/sharedFiles.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getConfig } from '../config.js';

const { gamepanelServersDir } = getConfig();

type ServerStoragePaths = {
  serverRoot: string;
  dataDir: string;
  backupDir: string;
};

export type ServerMountPath = {
  key: string;
  hostPath: string;
  readOnly?: boolean;
  containerPath: string;
};

export type ServerMountOwnership = {
  uid: number;
  gid: number;
};

export function getServerStoragePaths(storageKey: string | number): ServerStoragePaths {
  const serverRoot = path.join(gamepanelServersDir, String(storageKey));

  return {
    serverRoot,
    dataDir: path.join(serverRoot, 'data'),
    backupDir: path.join(serverRoot, 'backup'),
  };
}

export async function ensureServerDataDirs(storageKey: string | number): Promise<ServerStoragePaths> {
  const id =
    typeof storageKey === 'number'
      ? storageKey
      : Number.parseInt(String(storageKey), 10);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid storageKey/serverId: ${String(storageKey)}`);
  }

  const paths = getServerStoragePaths(id);

  await fs.mkdir(paths.dataDir, { recursive: true });
  await fs.mkdir(paths.backupDir, { recursive: true });

  return paths;
}

function assertValidServerId(storageKey: string | number, action: string): number {
  const id =
    typeof storageKey === 'number'
      ? storageKey
      : Number.parseInt(String(storageKey), 10);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid storageKey/serverId ${action}: ${String(storageKey)}`);
  }

  return id;
}

function getServerMountDir(serverId: number, key: string): string {
  const paths = getServerStoragePaths(serverId);
  return path.join(paths.serverRoot, key);
}

async function chownRecursive(target: string, ownership: ServerMountOwnership): Promise<void> {
  const st = await fs.lstat(target);
  if (st.isSymbolicLink()) return;

  await fs.chown(target, ownership.uid, ownership.gid);

  if (!st.isDirectory()) return;

  const entries = await fs.readdir(target);
  await Promise.all(entries.map((entry) => chownRecursive(path.join(target, entry), ownership)));
}

export async function ensureServerMountDirs(
  storageKey: string | number,
  mounts: Array<{ key: string; containerPath: string; shared?: SharedReference }>,
  ownership?: ServerMountOwnership
): Promise<ServerMountPath[]> {
  const id = assertValidServerId(storageKey, 'for mount creation');
  const paths = getServerStoragePaths(id);
  const rootResolved = path.resolve(paths.serverRoot);

  await fs.mkdir(paths.serverRoot, { recursive: true });

  const resolved: ServerMountPath[] = [];

  for (const mount of mounts) {
    if (mount.shared) {
      const parent = mounts.find(m => !m.shared && mount.containerPath.startsWith(m.containerPath + '/'));
      if (parent) {
        const privateRoot = path.join(rootResolved, parent.key);
        const relative = path.posix.relative(parent.containerPath, mount.containerPath);
        if (relative.split('/').some(p => !p || p === '..' || p === '.')) throw new Error('Invalid nested mount destination');
        let placeholder = privateRoot;
        if (!(await fs.lstat(placeholder)).isDirectory()) throw new Error('Invalid private mount directory');
        for (const part of relative.split('/')) {
          placeholder = path.join(placeholder, part);
          await fs.mkdir(placeholder).catch(e => { if (e.code !== 'EEXIST') throw e; });
          if (!(await fs.lstat(placeholder)).isDirectory()) throw new Error('Nested mount parents must be real directories');
          if (ownership) await fs.chown(placeholder, ownership.uid, ownership.gid);
        }
      }
      resolved.push({ key: mount.key, hostPath: await resolveSharedPath(mount.shared), containerPath: mount.containerPath, readOnly: true });
      continue;
    }
    const hostPath = getServerMountDir(id, mount.key);
    const hostResolved = path.resolve(hostPath);

    if (!hostResolved.startsWith(rootResolved + path.sep)) {
      throw new Error(`Refusing to create mount outside server root: ${hostResolved}`);
    }

    await fs.mkdir(hostResolved, { recursive: true });
    if (ownership) {
      await chownRecursive(hostResolved, ownership);
    }

    resolved.push({
      key: mount.key,
      hostPath: hostResolved,
      containerPath: mount.containerPath,
    });
  }

  return resolved;
}

export async function removeServerDataDir(storageKey: string | number): Promise<void> {
  const id = assertValidServerId(storageKey, 'for deletion');

  const target = path.join(gamepanelServersDir, String(id));
  const rootResolved = path.resolve(gamepanelServersDir);
  const targetResolved = path.resolve(target);

  if (!targetResolved.startsWith(rootResolved + path.sep)) {
    throw new Error(`Refusing to delete outside servers dir: ${targetResolved}`);
  }

  await fs.rm(targetResolved, { recursive: true, force: true });
}

const MOUNT_KEY_RE = /^[a-zA-Z0-9_-]{1,40}$/;

export async function removeServerMountDir(storageKey: string | number, key: string): Promise<void> {
  const id = assertValidServerId(storageKey, 'for mount deletion');
  if (!MOUNT_KEY_RE.test(key)) {
    throw new Error(`Invalid mount key for deletion: ${key}`);
  }

  const paths = getServerStoragePaths(id);
  const rootResolved = path.resolve(paths.serverRoot);
  const targetResolved = path.resolve(path.join(paths.serverRoot, key));

  if (!targetResolved.startsWith(rootResolved + path.sep)) {
    throw new Error(`Refusing to delete mount outside server root: ${targetResolved}`);
  }

  await fs.rm(targetResolved, { recursive: true, force: true });
}
