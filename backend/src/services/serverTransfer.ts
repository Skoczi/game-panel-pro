import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { cloneSource, cloneFingerprint, archiveHash, prepareCloneTarget, populateClone, failClone } from './serverClone.js';
import { serverRepository } from '../database/index.js';
import { createNativeBackup, nativeBackupDirectory } from './nativeBackups.js';
import { getServerStoragePaths, ensureServerDataDirs } from '../utils/storage.js';
import { checkContainerStatus } from '../utils/docker.js';
import { docker } from '../utils/docker/client.js';
import { acquireNativeOperation } from './nativeOperationLock.js';
import { withStorageReserve } from './storageReserve.js';
import { syncDirectory } from './nativeRestoreJournal.js';
import { startBackupJob } from './backupJobs.js';
import type { GameServerRow } from '../types/gameServer.js';
export type TransferPacket = { version: 1; exportId: string; source: GameServerRow; archive: { name: string; size: number; sha256: string } };
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/;
export function validateTransferPacket(input: unknown): TransferPacket {
  const p = input as TransferPacket;
  if (!p || p.version !== 1 || !uuid.test(p.exportId) || !/^[a-f0-9]{32}$/.test(p.source?.runtime_uuid || '') || !p.archive || typeof p.archive.name !== 'string' || p.archive.name.length > 240 || !/^native-[A-Za-z0-9_.-]+\.tar\.gz$/.test(p.archive.name) || !/^[a-f0-9]{64}$/.test(p.archive.sha256) || !Number.isSafeInteger(p.archive.size) || p.archive.size <= 0 || p.archive.size > 50 * 1024 ** 3) throw Object.assign(new Error('Invalid transfer manifest'), { statusCode: 400 });
  return p;
}
export async function exportServer(id: number, runtimeKey: string, fingerprint: string) {
  const { server } = await cloneSource(id, runtimeKey);
  if (cloneFingerprint(server) !== fingerprint || !['exited', 'created'].includes(await checkContainerStatus(server.docker_container_id))) throw new Error('Stop the source and refresh the transfer preview');
  if ((await docker.getContainer(server.docker_container_id).inspect()).Image !== server.docker_image_digest) throw new Error('Source image changed');
  const backup = await createNativeBackup(server, true, 'Before-transfer');
  if (!backup.ok || backup.stderr) throw new Error('Verified transfer backup failed');
  if (cloneFingerprint((await serverRepository.findById(id))!) !== fingerprint || !['exited', 'created'].includes(await checkContainerStatus(server.docker_container_id))) throw new Error('Source changed during export');
  const filename = path.join(await nativeBackupDirectory(server), backup.name);
  const packet: TransferPacket = { version: 1, exportId: randomUUID(), source: server, archive: { name: backup.name, size: (await fs.stat(filename)).size, sha256: await archiveHash(filename) } };
  const directory = path.join(getServerStoragePaths(id).serverRoot, '.clone-exports');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await fs.lstat(directory)).isDirectory()) throw new Error('Invalid export directory');
  const file = await fs.open(path.join(directory, packet.exportId + '.json'), 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(packet)); await file.sync(); } finally { await file.close(); }
  await syncDirectory(directory);
  return { ok: true, exitCode: 0, stdout: 'Transfer backup verified. Source remains stopped.', exportId: packet.exportId };
}
export async function readExport(id: number, exportId: string) {
  if (!uuid.test(exportId)) throw new Error('Invalid export identity');
  const file = path.join(getServerStoragePaths(id).serverRoot, '.clone-exports', exportId + '.json');
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('Export manifest unavailable');
  const packet = validateTransferPacket(JSON.parse(await fs.readFile(file, 'utf8')));
  const current = await serverRepository.findById(id);
  if (!current || current.runtime_uuid !== packet.source.runtime_uuid) throw new Error('Export source identity changed');
  const archive = path.join(await nativeBackupDirectory(current), packet.archive.name), archiveStat = await fs.lstat(archive);
  if (!archiveStat.isFile() || archiveStat.size !== packet.archive.size) throw new Error('Export archive changed or was removed');
  return { packet, archive };
}
export async function prepareTransfer(packetInput: unknown, input: unknown) {
  const packet = validateTransferPacket(packetInput), target = await prepareCloneTarget(packet.source, input);
  try {
    const server = (await serverRepository.findById(target.targetId))!;
    if (server.runtime_uuid === packet.source.runtime_uuid) throw new Error('Destination identity was not renewed');
    await ensureServerDataDirs(server.id);
    const runtime = JSON.parse(server.runtime_config_json || '{}');
    runtime.cloneImport = { ...packet.archive, exportId: packet.exportId };
    await serverRepository.update(server.id, { runtime_config_json: JSON.stringify(runtime) });
    return { targetId: server.id, runtimeKey: server.runtime_uuid };
  } catch (error) { await failClone(target.targetId); throw error; }
  finally { target.release(); }
}
export async function receiveTransfer(id: number, runtimeKey: string, size: number, input: Readable, actor: string) {
  const release = acquireNativeOperation(id, true);
  let admitted = false;
  try {
    const server = await serverRepository.findById(id), runtime = JSON.parse(server?.runtime_config_json || '{}'), expected = runtime.cloneImport;
    if (!server || server.runtime_uuid !== runtimeKey || server.status !== 'creating' || runtime.nativeInterrupted || !expected || expected.size !== size) throw new Error('Transfer target identity, size or state changed');
    admitted = true;
    const directory = await nativeBackupDirectory(server), archive = path.join(directory, expected.name), temporary = archive + '.partial';
    let bytes = 0;
    const limit = new Transform({ transform(chunk, _encoding, done) { bytes += chunk.length; done(bytes > size ? new Error('Transfer exceeds expected size') : null, chunk); } });
    await withStorageReserve(directory, signal => pipeline(input, limit, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }), { signal }));
    if (bytes !== size || await archiveHash(temporary) !== expected.sha256) throw new Error('Transfer checksum or size mismatch');
    const file = await fs.open(temporary, 'r+'); try { await file.sync(); } finally { await file.close(); }
    await fs.rename(temporary, archive); await syncDirectory(directory);
    release();
    return await startBackupJob(id, 'clone', actor, async () => {
      try { return await populateClone(id, archive, expected.sha256, actor); }
      catch (error) { await failClone(id); throw error; }
    });
  } catch (error) { if (admitted) await failClone(id); throw error; }
  finally { release(); }
}
