import { preflightSharedMounts } from './sharedFiles.js';
import { inspectNativeImage } from './nativeImages.js';
import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { serverRepository, actionsRepository } from '../database/index.js';
import { nativeServerTemplate, createNativeBackup, nativeBackupDirectory } from './nativeBackups.js';
import { restoreNativeBackup } from './nativeRestore.js';
import { recordNativeBackup } from './nativeProtection.js';
import { acquireNativeOperation } from './nativeOperationLock.js';
import { enterPortAllocationMutation } from './portAllocationLock.js';
import { assertHostPortsAvailableForServer } from './hostPortAvailability.js';
import { assertCpuBinding } from './cpuTopology.js';
import { withStorageReserve } from './storageReserve.js';
import { ensureServerMountDirs, getServerStoragePaths } from '../utils/storage.js';
import { nativeContainerOptions } from '../templates/nativeContract.js';
import { buildAndValidateOpenPortMappings, assertHostPortsAbove1024, collectHostPortsByProto } from '../utils/ports.js';
import { parseStoredEnv, parseStoredMounts, parseStoredPorts, parseStoredHealthcheck, parseStoredResourceLimits } from '../providers/runtimeConfig.js';
import * as dockerUtils from '../utils/docker.js';
import { docker } from '../utils/docker/client.js';
import { syncDirectory } from './nativeRestoreJournal.js';
import type { GameServerRow } from '../types/gameServer.js';

export function cloneFingerprint(server: GameServerRow) {
  return createHash('sha256').update(JSON.stringify([server.runtime_uuid, server.docker_container_id, server.docker_image_digest,
    server.env_json, server.mounts_json, server.ports_json, server.resource_limits_json, server.runtime_config_json, server.provider_metadata_json])).digest('hex');
}
export async function cloneSource(id: number, runtimeKey: string) {
  const server = await serverRepository.findById(id);
  if (!server || server.runtime_uuid !== runtimeKey || !server.docker_container_id) throw Object.assign(new Error('Source server identity changed'), { statusCode: 409 });
  const template = nativeServerTemplate(server);
  if (!template || template.mounts.filter(m => !m.shared).length !== 1 || template.mounts[0].key !== 'data' || template.mounts[0].containerPath !== '/data') throw Object.assign(new Error('Cloning requires a Native server using the single /data mount'), { statusCode: 400 });
  if (parseStoredMounts(server).filter(m => !m.shared).length !== 1 || parseStoredMounts(server)[0].key !== 'data' || parseStoredMounts(server)[0].containerPath !== '/data') throw new Error('Source mounts differ from the supported template');
  const metadata = JSON.parse(server.provider_metadata_json || '{}');
  const runtime = JSON.parse(server.runtime_config_json || '{}');
  if (runtime.nativeInterrupted || runtime.nativeOperation) throw Object.assign(new Error('Complete source maintenance recovery before cloning'), { statusCode: 409 });
  if (metadata.pendingConfiguration) throw Object.assign(new Error('Apply or discard pending server settings before cloning'), { statusCode: 409 });
  return { server: { ...server, docker_container_id: server.docker_container_id }, template };
}
export async function previewClone(id: number, runtimeKey: string) {
  const { server } = await cloneSource(id, runtimeKey);
  return { fingerprint: cloneFingerprint(server), name: server.name, ports: parseStoredPorts(server),
    stopped: ['exited', 'created'].includes(await dockerUtils.checkContainerStatus(server.docker_container_id)),
    image: server.docker_image_digest, changes: ['Create a verified offline backup', 'Reserve different public ports and a new server identity', 'Copy game files and configuration, including credentials', 'Leave both servers stopped; start the clone deliberately', 'The source remains available for rollback'] };
}
export async function archiveHash(filename: string) {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(filename)) hash.update(chunk); return hash.digest('hex');
}
export function clonePorts(source: GameServerRow, input: unknown) {
  const { ports } = buildAndValidateOpenPortMappings({ portsPayload: input as any });
  assertHostPortsAbove1024(collectHostPortsByProto(ports));
  const template = nativeServerTemplate(source)!;
  nativeContainerOptions(template, parseStoredEnv(source), ports);
  return ports;
}
// Reserve a new identity only after validating the destination's image and ports.
export async function prepareCloneTarget(server: GameServerRow, input: any) {
  const template = nativeServerTemplate(server);
  if (!template || template.mounts.filter(m => !m.shared).length !== 1 || template.mounts[0].key !== 'data' || template.mounts[0].containerPath !== '/data') throw new Error('Only Native single-data-mount servers can be transferred');
  if (typeof input?.name !== 'string' || input.name.trim().length < 3 || input.name.trim().length > 50 || /[\0\r\n]/.test(input.name)) throw new Error('Clone name must contain 3–50 characters');
  const name = input.name.trim(), ports = clonePorts(server, input.ports), resources = parseStoredResourceLimits(server);
  await preflightSharedMounts(template.mounts);
  await assertCpuBinding(resources);
  if (!/^sha256:[a-f0-9]{64}$/.test(server.docker_image_digest || '')) throw new Error('A pinned runtime image is required');
  const image = await inspectNativeImage(server.docker_image_digest!, 'Clone runtime');
  const runtime = JSON.parse(server.runtime_config_json || '{}');
  if (runtime.nativeInstallerImage) await inspectNativeImage(runtime.nativeInstallerImage, 'Clone installer');
  delete runtime.nativeInterrupted; delete runtime.cloneImport;
  runtime.nativeOperation = 'clone';
  const allocation = enterPortAllocationMutation();
  try {
    await assertHostPortsAvailableForServer({ ports });
    if (await serverRepository.findByName(name)) throw new Error('A server with this name already exists');
    const targetId = await serverRepository.create({ name, provider: server.provider, catalogId: server.catalog_id, dockerImage: server.docker_image, dockerImageDigest: image,
      ports, healthcheck: parseStoredHealthcheck(server), resourceLimits: resources, mounts: template.mounts, env: parseStoredEnv(server),
      runtimeConfig: runtime, providerMetadata: JSON.parse(server.provider_metadata_json || '{}'), initialStatus: 'creating', desiredState: 'stopped' });
    const release = acquireNativeOperation(targetId);
    return { targetId, release };
  } finally { allocation(); }
}
export async function failClone(targetId: number) {
  const failed = await serverRepository.findById(targetId);
  if (!failed) return;
  const runtime = JSON.parse(failed.runtime_config_json || '{}'); delete runtime.nativeOperation; runtime.nativeInterrupted = true;
  await serverRepository.update(targetId, { runtime_config_json: JSON.stringify(runtime), desired_state: 'stopped' });
  await serverRepository.markFailed(targetId, 'Clone/transfer incomplete; delete this target or inspect and recover it. The source is unchanged.');
}
// Caller owns the target operation lock. Transfer uploads can already reside in
// the target backup directory; local clones copy an immutable source archive.
export async function populateClone(targetId: number, sourceArchive: string, checksum: string, actor: string) {
  const server = await serverRepository.findById(targetId);
  if (!server || server.status !== 'creating' || !server.runtime_uuid) throw new Error('Transfer target changed');
  const template = nativeServerTemplate(server)!;
  const ports = parseStoredPorts(server), metadata = JSON.parse(server.provider_metadata_json || '{}');
  const mounts = await ensureServerMountDirs(targetId, template.mounts);
  await fs.chown(getServerStoragePaths(targetId).dataDir, template.runtime.identity!.uid, template.runtime.identity!.gid);
  await fs.mkdir(path.join(getServerStoragePaths(targetId).dataDir, 'serverfiles'), { recursive: true, mode: 0o755 });
  const directory = await nativeBackupDirectory(server), name = path.basename(sourceArchive), targetArchive = path.join(directory, name);
  if (sourceArchive !== targetArchive) {
    const temporary = targetArchive + '.partial';
    await withStorageReserve(directory, signal => pipeline(createReadStream(sourceArchive), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }), { signal }));
    if (await archiveHash(temporary) !== checksum) throw new Error('Clone backup checksum mismatch');
    const handle = await fs.open(temporary, 'r+'); try { await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, targetArchive); await syncDirectory(directory);
  } else if (await archiveHash(targetArchive) !== checksum) throw new Error('Transfer checksum mismatch');
  await recordNativeBackup(targetArchive, false);
  const created = await dockerUtils.createContainer({ provider: server.provider, catalogId: server.catalog_id, image: server.docker_image_digest!, env: parseStoredEnv(server), mounts, ports,
    healthcheck: parseStoredHealthcheck(server), resourceLimits: parseStoredResourceLimits(server), restartPolicy: 'no', start: false,
    native: nativeContainerOptions(template, parseStoredEnv(server), ports, metadata.startupCommand, metadata.customParams) }, targetId, dockerUtils.buildManagedContainerName(targetId, server.name));
  await serverRepository.updateDockerInfo(targetId, created.id, created.name);
  const restored = await restoreNativeBackup({ ...server, docker_container_id: created.id }, name, true);
  if (!restored.ok) throw new Error('Clone restore failed');
  const runtime = JSON.parse(server.runtime_config_json || '{}'); delete runtime.nativeOperation; delete runtime.cloneImport;
  await serverRepository.update(targetId, { status: 'stopped', container_status: 'created', runtime_config_json: JSON.stringify(runtime) });
  await actionsRepository.create(targetId, 'success', `Clone/transfer completed; backup checksum ${checksum}; unique identity and reviewed ports. Target remains stopped.`, actor);
  return { ok: true, exitCode: 0, stdout: `Clone "${server.name}" created (runtime ${targetId}). Target remains stopped. Refresh Game Servers to open it.`, targetServerId: targetId, targetRuntimeKey: server.runtime_uuid };
}
// The source is held by startBackupJob. The new identity gets its own operation lock.
export async function cloneServer(id: number, runtimeKey: string, input: any, actor: string) {
  const { server } = await cloneSource(id, runtimeKey);
  if (cloneFingerprint(server) !== input.fingerprint || !['exited', 'created'].includes(await dockerUtils.checkContainerStatus(server.docker_container_id))) throw Object.assign(new Error('Stop the source and refresh the clone preview'), { statusCode: 409 });
  const sourceContainer = await docker.getContainer(server.docker_container_id).inspect();
  if (server.docker_image_digest !== sourceContainer.Image) throw new Error('Source container differs from its pinned image');
  const target = await prepareCloneTarget(server, input);
  try {
    const backup = await createNativeBackup(server, true, 'Before-clone');
    if (!backup.ok || backup.stderr) throw new Error('Verified offline clone backup could not be created');
    if (cloneFingerprint((await serverRepository.findById(id))!) !== input.fingerprint || !['exited', 'created'].includes(await dockerUtils.checkContainerStatus(server.docker_container_id))) throw new Error('Source changed during clone preparation');
    const sourceArchive = path.join(await nativeBackupDirectory(server), backup.name);
    const result = await populateClone(target.targetId, sourceArchive, await archiveHash(sourceArchive), actor);
    if (result.targetRuntimeKey === runtimeKey) throw new Error('Clone identity allocation failed');
    return result;
  } catch (error) { await failClone(target.targetId); throw error; }
  finally { target.release(); }
}
