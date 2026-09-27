import type { GameTemplate, GameConfigField } from './types.js';

const field = (key: string, label: string, type: GameConfigField['type'] = 'text', min?: number, max?: number): GameConfigField =>
    ({ key, label, type, description: '', apply: 'restart', ...(min !== undefined ? { min, max, step: 1 } : {}) });

export const HLTV_TEMPLATE: GameTemplate = {
    schemaVersion: 2, name: 'Counter-Strike 1.6 · HLTV', description: '', author: 'Skoczi',
    source: 'Valve HLTV / SteamCMD', icon: 'counter-strike',
    runtime: { provider: 'external', image: 'gamepanel-runtime:source-v1', catalogId: 'hltv', gameServerName: '', architectures: ['x64'], identity: { user: '1000', uid: 1000, gid: 1000 } },
    ports: [{ key: 'tv', label: 'HLTV / RCON', protocol: 'udp', container: 27020, suggested: 27020, env: 'SERVER_PORT', linuxgsmKey: '' }],
    variables: [
        { key: 'TARGET_SERVER', label: 'Game server IP:port', type: 'string', required: true, secret: false, default: '' },
        { key: 'RECORD_DEMOS', label: 'Record demos automatically (true / false)', type: 'boolean', required: true, secret: false, default: 'false' },
    ],
    mounts: [{ key: 'data', containerPath: '/data' }],
    configFiles: [{ root: 'data', path: '/serverfiles/hltv.cfg', label: 'HLTV settings' }],
    gameConfig: {
        format: 'valve-cfg', root: 'data', path: '/serverfiles/hltv.cfg',
        sections: [
            { id: 'broadcast', label: 'Broadcast', description: '', fields: [field('hostname', 'Broadcast name'), field('name', 'In-game name'), field('connect', 'Game server IP:port'), field('maxclients', 'Spectator slots', 'number', 0, 255), field('delay', 'Delay (seconds)', 'number', 0, 3600), field('autoretry', 'Reconnect automatically', 'boolean')] },
            { id: 'access', label: 'Access', description: '', fields: [field('serverpassword', 'Game server password', 'password'), field('spectatorpassword', 'Spectator password', 'password'), field('adminpassword', 'HLTV RCON password', 'password')] },
        ],
    },
    lifecycle: {
        startup: ['/usr/local/lib/gamepanel/hltv-start'], installerImage: 'gamepanel-installer:source-v1',
        install: [{ name: 'Install HLTV', argv: ['/usr/local/lib/gamepanel/hltv-install', 'install'], timeoutSeconds: 1800 }],
        update: [{ name: 'Update HLTV', argv: ['/usr/local/lib/gamepanel/hltv-install', 'update'], timeoutSeconds: 1800 }],
        workdir: '/data', stopCommand: 'quit', stopSignal: 'SIGINT', stopTimeoutSeconds: 30,
    },
};
