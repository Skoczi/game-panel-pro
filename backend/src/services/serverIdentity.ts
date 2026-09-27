import { randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import type { Database } from 'sqlite';
import { agentIdentity, isAgent } from '../agent/identity.js';
import { FleetStore } from '../fleet/store.js';
import { signNodeRequest } from '../nodes/protocol.js';
import { nodeTls } from '../nodes/transport.js';

// All creation paths (install, clone and transfer) pass through the repository.
// A failed allocation must never fall back to the node's SQLite sequence.
export async function allocateServerIdentity(db: Database): Promise<{ id: number; runtimeKey: string }> {
    const runtimeKey = randomBytes(16).toString('hex');
    if (!isAgent()) {
        const store = new FleetStore(db);
        await store.initialize();
        return store.reserve('local', runtimeKey);
    }
    const identity = agentIdentity();
    const route = `/api/nodes/${identity.nodeId}/server-identities/${runtimeKey}`;
    const url = new URL(route, identity.panel);
    const value = await new Promise<any>((resolve, reject) => {
        const req = (url.protocol === 'https:' ? https : http).request(url, {
            ...nodeTls(), method: 'POST', headers: {
                'Content-Length': '0',
                'x-gamepanel-node-auth': signNodeRequest(identity.key, identity.nodeId, 'POST', route, 'server-identity'),
            },
        }, res => {
            if (res.statusCode !== 200) { res.resume(); reject(new Error('Central server identity unavailable')); return; }
            let body = '';
            res.on('data', chunk => {
                body += chunk.toString();
                if (body.length > 4096) req.destroy(new Error('Invalid identity response'));
            });
            res.on('error', reject);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid identity response')); } });
        });
        const deadline = setTimeout(() => req.destroy(new Error('Central identity allocation timed out')), 10000);
        req.once('close', () => clearTimeout(deadline));
        req.once('error', reject);
        req.end();
    });
    if (!Number.isSafeInteger(value?.id) || value.id < 101 || value.runtimeKey !== runtimeKey)
        throw new Error('Invalid central server identity');
    return { id: value.id, runtimeKey };
}
