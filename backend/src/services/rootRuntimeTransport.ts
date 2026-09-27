import http from 'node:http';
import https from 'node:https';
import { nodes } from '../nodes/control.js';
import { nodeTls } from '../nodes/transport.js';
import { signNodeRequest } from '../nodes/protocol.js';
export async function rootRuntimeJson(nodeId: string, route: string, actor: string, payload?: unknown, key?: string) {
  const node = await nodes().get(nodeId);
  if (!node?.enabled || !node.key_encrypted) throw Object.assign(new Error('Node unavailable'), { statusCode: 503 });
  const url = new URL(route, node.origin), method = payload === undefined ? 'GET' : 'POST', body = payload === undefined ? undefined : JSON.stringify(payload);
  if (!route.startsWith('/api/servers/') || url.origin !== node.origin) throw new Error('Invalid runtime endpoint');
  return new Promise<any>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, { ...nodeTls(), method,
      headers: { 'x-gamepanel-node-auth': signNodeRequest(nodes().key(node), node.id, method, route, actor),
        ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'idempotency-key': key! } : {}) } }, response => {
      let bytes = 0; const chunks: Buffer[] = [];
      response.on('data', chunk => { bytes += chunk.length; if (bytes > 1024 * 1024) request.destroy(new Error('Node response exceeds limit')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if ((response.statusCode || 500) >= 300) return reject(Object.assign(new Error(typeof value.error === 'string' ? value.error : 'Node request failed'), { statusCode: response.statusCode }));
          resolve(value);
        } catch { reject(new Error('Invalid node response')); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('Node request timed out; inspect the operation before retrying')), 15000);
    request.once('close', () => clearTimeout(timer));
    request.on('error', reject); request.end(body);
  });
}
