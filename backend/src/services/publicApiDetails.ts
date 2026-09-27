import type { FleetRow } from '../fleet/store.js';
import { serverRepository, installProgressRepository } from '../database/index.js';
import { serializeGameServerWithInstallProgress } from '../utils/apiSerialization.js';
import { getMonitoringSummary } from './gameMonitoring.js';
import { inspectContainerRuntime } from '../utils/docker.js';
import { runtimeSummary } from './apiServerDto.js';
import { readApiRuntime } from './apiRuntimeTransport.js';
export async function apiServerDetail(row: FleetRow, actorId: number) {
    if (row.node_id !== 'local') return runtimeSummary((await readApiRuntime(row, actorId, 'detail', [], 262144) as any)?.server);
    const server = await serverRepository.findById(row.runtime_id);
    if (!server || server.runtime_uuid !== row.runtime_key) throw new Error('Runtime identity changed');
    const runtime = server.docker_container_id ? await inspectContainerRuntime(server.docker_container_id).catch(() => null) : null;
    const started = Date.parse(runtime?.startedAt ?? '');
    return runtimeSummary({ ...serializeGameServerWithInstallProgress(server, await installProgressRepository.getByServerId(server.id)),
        uptimeSeconds: Number.isFinite(started) ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : null, monitoring: await getMonitoringSummary(server) });
}
