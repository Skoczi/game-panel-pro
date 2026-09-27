import http from 'node:http';
import https from 'node:https';
import { nodes } from '../nodes/control.js';
import { nodeTls } from '../nodes/transport.js';
import { signNodeRequest } from '../nodes/protocol.js';
import type { Delegation } from '../nodes/delegation.js';
import { apiFail } from './apiProvisioning.js';
/** Only reviewed routes are admitted, with no redirects or caller-selected origins. */
export async function apiNodeRequest(nodeId: string, route: string, actorId: number, method = 'GET', payload?: unknown, key?: string, delegation?: Delegation): Promise<any> {
    if (!/^\/api\/(runtime-provisioning\/(plan|install|allocations|[0-9a-f-]{36})|servers\/[1-9][0-9]*\/game-admins)$/.test(route)) throw new Error('Unsupported node request');
    const node = await nodes().get(nodeId);
    if (!node?.enabled || !node.key_encrypted) apiFail(503, 'Node unavailable');
    const url = new URL(route, node!.origin);
    if (url.origin !== node!.origin) throw new Error('Invalid origin');
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    return new Promise((resolve, reject) => {
        const req = (url.protocol === 'https:' ? https : http).request(url, { method, ...nodeTls(), headers: {
            'x-gamepanel-node-auth': signNodeRequest(nodes().key(node!), nodeId, method, route, `api-user:${actorId}`, delegation),
            ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}),
            ...(key ? { 'idempotency-key': key } : {}),
        } }, res => {
            const chunks: Buffer[] = []; let size = 0;
            res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 262144) req.destroy(new Error('Response exceeds limit')); else chunks.push(chunk); });
            res.on('error', reject);
            res.on('end', () => {
                try { const value = JSON.parse(Buffer.concat(chunks).toString());
                    if (res.statusCode !== 200) reject(Object.assign(new Error(typeof value.error === 'string' && [400,409].includes(res.statusCode!) ? value.error : 'Node request unavailable'), { statusCode: [400,409].includes(res.statusCode!) ? res.statusCode : 503 }));
                    else resolve(value);
                } catch { reject(new Error('Invalid node response')); }
            });
        });
        const timer = setTimeout(() => req.destroy(new Error('Node request timed out')), 45000);
        req.once('close', () => clearTimeout(timer)); req.once('error', reject); req.end(body);
    });
}
