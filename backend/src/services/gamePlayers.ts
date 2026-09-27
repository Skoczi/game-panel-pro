import Docker from 'dockerode';
import { getConfig } from '../config.js';
import { serverRepository } from '../database/index.js';
import { getMonitoringSettings } from './gameMonitoring.js';
import { parseStoredPorts } from '../providers/runtimeConfig.js';
import { ownsContainer } from '../utils/docker/ownership.js';
import { queryGamePlayers } from './gameQuery.js';
import type { GameServerRow } from '../types/gameServer.js';
import type { GamePlayersSnapshot } from '../templates/types.js';

const inspector = new Docker({ socketPath: getConfig().dockerSocket, timeout: 5000 });
const cache = new Map<number, { key: string; expires: number; result: Promise<GamePlayersSnapshot> }>();
let active = 0;
const snapshot = (state: GamePlayersSnapshot['state'], players: GamePlayersSnapshot['players'] = null): GamePlayersSnapshot =>
    ({ state, players, checkedAt: new Date().toISOString() });
const identity = (server: GameServerRow) => JSON.stringify([server.docker_container_id, server.updated_at, server.status, server.desired_state, server.ports_json]);

// Called only after membership and players.read authorization, including on remote agents.
export async function getGamePlayers(id: number): Promise<GamePlayersSnapshot> {
    const server = await serverRepository.findById(id);
    if (!server) throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    const { config } = await getMonitoringSettings(id);
    if (!config.enabled || config.protocol !== 'a2s' || config.queryPort === null) return snapshot('unsupported');
    if (server.desired_state === 'stopped' || server.status === 'stopped') return snapshot('stopped');
    if (server.status !== 'running' || !server.docker_container_id) return snapshot('unavailable');
    const key = `${identity(server)}:${config.queryPort}`;
    const existing = cache.get(id);
    if (existing?.key === key && existing.expires > Date.now()) return existing.result;
    if (active >= 8) return snapshot('unavailable');
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    active++;
    const result = (async () => {
        try {
            const port = parseStoredPorts(server).udp.find(p => p.container === config.queryPort);
            if (!port) return snapshot('unavailable');
            const runtime = await inspector.getContainer(server.docker_container_id!).inspect();
            if (!ownsContainer(runtime.Config.Labels || {})) return snapshot('unavailable');
            if (!runtime.State.Running) return snapshot('stopped');
            if (runtime.State.Paused) return snapshot('unavailable');
            const host = runtime.NetworkSettings.Networks[getConfig().gamesNetwork]?.IPAddress;
            if (!host) return snapshot('unavailable');
            const players = await queryGamePlayers(host, port.container);
            const fresh = await serverRepository.findById(id);
            if (!fresh || identity(fresh) !== identity(server)) return snapshot('unavailable');
            return snapshot('online', players);
        } catch { return snapshot('unavailable'); }
        finally { active--; }
    })();
    const entry = { key, result, expires: Date.now() + 10000 };
    cache.set(id, entry);
    // Cache successes and failures briefly; coalesce simultaneous viewers on this node.
    void result.then(() => { entry.expires = Date.now() + 5000; });
    return result;
}
