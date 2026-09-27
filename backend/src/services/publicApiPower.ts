import type { FleetRow } from '../fleet/store.js';
import { readApiRuntime } from './apiRuntimeTransport.js';
import { enterServerMutation } from './nativeOperationLock.js';
import { serverRepository } from '../database/index.js';
import { executeServerPower, type PowerAction } from '../routes/servers/power.js';
export async function apiPower(row: FleetRow, ownerId: number, operationId: string, action: PowerAction) {
    if (row.node_id !== 'local') {
        const value = await readApiRuntime(row, ownerId, action, ['server.power'], 16384, { key: operationId }) as any;
        if (value?.success !== true) throw new Error('Power action not confirmed');
        return;
    }
    const release = enterServerMutation(row.runtime_id);
    try {
        const server = await serverRepository.findById(row.runtime_id);
        if (server?.runtime_uuid !== row.runtime_key) throw new Error('Runtime identity changed');
        await executeServerPower(row.runtime_id, action, `api-user:${ownerId}`);
    } finally { release(); }
}
