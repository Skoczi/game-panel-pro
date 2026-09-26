import { restartServer } from '../../services/restartServer.js';
import { applyPendingServerConfiguration, refreshNativeStartupCompatibility } from '../../services/serverReconfiguration.js';
import { Router, type Response } from 'express';
import {
    type AuthenticatedRequest,
    requireServerPermission,
} from '../../middleware/auth.js';
import * as dockerUtils from '../../utils/docker.js';
import {
    actionsRepository,
    serverRepository,
} from '../../database/index.js';
import { assertHostPortsAvailableForServer } from '../../services/hostPortAvailability.js';
import {
    afterOvhcloudServerStopped,
    getServerStopTimeoutSeconds,
    startOvhcloudServerIfHandled,
} from '../../services/ovhcloudLifecycle.js';
import { parseStoredPorts } from '../../providers/runtimeConfig.js';
import {
    beginServerTransition,
    clearServerTransition,
    POWER_TRANSITION_TIMEOUT_MS,
    reconcileServerStatus,
} from '../../services/serverTransitions.js';
import { logError } from '../../utils/logger.js';
import { sendRouteError } from '../../utils/routeErrors.js';
import { PERMISSIONS } from '../../permissions.js';
import type { GameServerRow } from '../../types/gameServer.js';
import { assertCanPowerServer } from '../../services/serverActionPolicy.js';
import {
    completeDockerPowerTransition,
    parseServerId,
} from './shared.js';

type GameServerWithContainer = GameServerRow & {
    docker_container_id: string;
};

async function getServerForPowerAction(serverId: number): Promise<GameServerWithContainer> {
    const server = await serverRepository.findById(serverId);

    if (!server) {
        throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    }

    assertCanPowerServer(server);

    if (!server.docker_container_id) {
        throw Object.assign(new Error('Server has no container'), { statusCode: 400 });
    }

    return server as GameServerWithContainer;
}

export type PowerAction = 'start' | 'stop' | 'restart';
/** Shared by session routes and scoped API power; caller holds the server mutation lock. */
export async function executeServerPower(serverId: number, action: PowerAction, actor: string) {
    try {
        let message: string;
        if (action === 'start') {
            let server = await getServerForPowerAction(serverId);
            const currentStatus = await dockerUtils.checkContainerStatus(server.docker_container_id);
            if (currentStatus !== 'running') {
                await applyPendingServerConfiguration(serverId);
                await refreshNativeStartupCompatibility(serverId);
                server = await getServerForPowerAction(serverId);
                await assertHostPortsAvailableForServer({ ports: parseStoredPorts(server), excludeServerId: serverId, excludeContainerIds: [server.docker_container_id] });
            }
            await serverRepository.updateDesiredState(serverId, 'running');
            await beginServerTransition(serverId, 'starting', { timeoutMs: POWER_TRANSITION_TIMEOUT_MS, timeoutBehavior: 'reconcile', pollDockerHealth: true });
            if (currentStatus !== 'running' && !await startOvhcloudServerIfHandled(serverId, server)) await dockerUtils.startContainer(server.docker_container_id);
            await completeDockerPowerTransition(serverId);
            message = 'Server start initiated';
        } else if (action === 'stop') {
            const server = await getServerForPowerAction(serverId);
            await serverRepository.updateDesiredState(serverId, 'stopped');
            await beginServerTransition(serverId, 'stopping', { timeoutMs: POWER_TRANSITION_TIMEOUT_MS, timeoutBehavior: 'reconcile', pollDockerHealth: false });
            if (await dockerUtils.checkContainerStatus(server.docker_container_id) === 'running') await dockerUtils.stopContainer(server.docker_container_id, getServerStopTimeoutSeconds(server));
            await afterOvhcloudServerStopped(serverId, server);
            await reconcileServerStatus(serverId);
            message = 'Server stopped';
        } else if (action === 'restart') {
            message = await restartServer(serverId) ? 'Saved settings applied; server restarted' : 'Server restart initiated';
        } else throw new Error('Invalid power action');
        await actionsRepository.create(serverId, 'info', message, actor);
        return { success: true, message };
    } catch (error) {
        clearServerTransition(serverId);
        await reconcileServerStatus(serverId).catch(e => logError('POWER:RECONCILE', e, { serverId }));
        throw error;
    }
}
export function createServerPowerRoutes(): Router {
    const router = Router();
    for (const action of ['start', 'stop', 'restart'] as const) router.post(`/:id/${action}`, requireServerPermission(PERMISSIONS.server.power), async (req: AuthenticatedRequest, res: Response) => {
        try {
            const id = parseServerId(req.params.id);
            if (!id) return res.status(400).json({ error: 'Invalid server id' });
            return res.json(await executeServerPower(id, action, req.user?.username || ''));
        } catch (error) { return sendRouteError(res, error, { route: `SERVERS:${action}`, fallbackMessage: `Failed to ${action} server`, logContext: { serverId: req.params.id } }); }
    });
    return router;
}
