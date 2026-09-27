import http from 'node:http';
import https from 'node:https';
import { randomUUID, createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { getDatabase } from '../database/init.js';
import { fleet, refreshFleet } from '../fleet/control.js';
import { nodes } from '../nodes/control.js';
import { nodeTls } from '../nodes/transport.js';
import { signNodeRequest, NODE_ID } from '../nodes/protocol.js';
import { rootRuntimeJson } from './rootRuntimeTransport.js';
import { validateTransferPacket } from './serverTransfer.js';
type TransferJob = { id: string; sourceId: string; targetNode: string; status: string; stage: string; startedAt: string; completedAt?: string; error?: string; targetId?: number; targetRuntimeKey?: string };
let initialized: Promise<void> | undefined;
const active = new Set<string>();
async function store() {
  const db = await getDatabase();
  await (initialized ??= db.exec("CREATE TABLE IF NOT EXISTS server_transfer_jobs (id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, payload_json TEXT NOT NULL, UNIQUE(owner_id,request_key))").then(async () => {
    for (const row of await db.all('SELECT id,payload_json FROM server_transfer_jobs')) {
      const job: TransferJob = JSON.parse(row.payload_json);
      if (job.status === 'running') { job.status = 'interrupted'; job.error = 'Panel restarted. Inspect the destination before starting another transfer; no steps were replayed.'; await db.run('UPDATE server_transfer_jobs SET payload_json=? WHERE id=?', JSON.stringify(job), job.id); }
    }
  }));
  return db;
}
async function save(job: TransferJob) { await (await store()).run('UPDATE server_transfer_jobs SET payload_json=? WHERE id=?', JSON.stringify(job), job.id); }
export async function readTransferJob(id: string) {
  const row = await (await store()).get('SELECT payload_json FROM server_transfer_jobs WHERE id=?', id);
  if (!row) throw Object.assign(new Error('Transfer not found'), { statusCode: 404 });
  return JSON.parse(row.payload_json) as TransferJob;
}
export async function latestTransfer(sourceId: string) {
  const rows = await (await store()).all('SELECT payload_json FROM server_transfer_jobs ORDER BY rowid DESC');
  for (const row of rows) { const job: TransferJob = JSON.parse(row.payload_json); if (job.sourceId === sourceId) return job; }
  return null;
}
async function waitJob(node: string, serverId: number, jobId: string, actor: string) {
  if (!/^[0-9a-f-]{36}$/.test(jobId)) throw new Error('Invalid runtime operation response');
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const { job } = await rootRuntimeJson(node, `/api/servers/${serverId}/backups/jobs/${jobId}`, actor);
    if (job?.status === 'completed') return job;
    if (job?.status !== 'running') throw new Error(job?.error || 'Runtime operation did not complete');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Runtime operation timed out; inspect its recorded result');
}
// TLS streams pass through the control plane with bounded memory. No caller URL,
// redirect, cookie or browser credential is forwarded to either runtime.
export async function streamTransfer(sourceNode: string, targetNode: string, sourcePath: string, targetPath: string, size: number, actor: string) {
  const [source, target] = await Promise.all([nodes().get(sourceNode), nodes().get(targetNode)]);
  if (!source?.enabled || !source.key_encrypted || !target?.enabled || !target.key_encrypted) throw new Error('Transfer node unavailable');
  const sourceUrl = new URL(sourcePath, source.origin), targetUrl = new URL(targetPath, target.origin);
  if (!sourcePath.startsWith('/api/servers/') || !targetPath.startsWith('/api/servers/') || sourceUrl.origin !== source.origin || targetUrl.origin !== target.origin) throw new Error('Invalid transfer endpoints');
  const tls = nodeTls(), sourceKey = nodes().key(source), targetKey = nodes().key(target);
  return new Promise<any>((resolve, reject) => {
    let output: http.ClientRequest | undefined, settled = false;
    const finish = (error?: Error, value?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); if (error) { input.destroy(); output?.destroy(); reject(error); } else resolve(value); };
    const input = (sourceUrl.protocol === 'https:' ? https : http).request(sourceUrl, { ...tls, headers: { 'x-gamepanel-node-auth': signNodeRequest(sourceKey, source.id, 'GET', sourcePath, actor) } }, response => {
      if (response.statusCode !== 200 || Number(response.headers['content-length']) !== size) { response.resume(); finish(new Error('Source archive size or response changed')); return; }
      try {
      output = (targetUrl.protocol === 'https:' ? https : http).request(targetUrl, { ...tls, method: 'PUT', headers: {
        'x-gamepanel-node-auth': signNodeRequest(targetKey, target.id, 'PUT', targetPath, actor), 'content-type': 'application/octet-stream', 'content-length': size,
      } }, result => {
        let bytes = 0; const chunks: Buffer[] = [];
        result.on('data', chunk => { bytes += chunk.length; if (bytes > 16384) finish(new Error('Destination response exceeds limit')); else chunks.push(chunk); });
        result.on('error', error => finish(error));
        result.on('end', () => {
          try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (result.statusCode !== 202) throw new Error(typeof value.error === 'string' ? value.error : 'Destination rejected transfer'); finish(undefined, value); }
          catch (error) { finish(error as Error); }
        });
      });
      output.on('error', error => finish(error));
      void pipeline(response, output).catch(error => finish(error));
      } catch (error) { response.destroy(); finish(error as Error); }
    });
    const timer = setTimeout(() => finish(new Error('Archive transfer exceeded four minutes. Inspect the destination before retrying.')), 240000);
    input.on('error', error => finish(error)); input.end();
  });
}
export async function startTransfer(sourceId: string, input: any, actor: string, ownerId: number, requestKey: string) {
  if (!NODE_ID.test(input?.targetNode) || !/^[A-Za-z0-9_-]{16,128}$/.test(requestKey)) throw Object.assign(new Error('Choose an enrolled destination node and a valid request key'), { statusCode: 400 });
  const db = await store(), fingerprint = createHash('sha256').update(JSON.stringify([sourceId, input])).digest('hex');
  const previous = await db.get('SELECT fingerprint,payload_json FROM server_transfer_jobs WHERE owner_id=? AND request_key=?', ownerId, requestKey);
  if (previous) { if (previous.fingerprint !== fingerprint) throw Object.assign(new Error('Request key already used for a different transfer'), { statusCode: 409 }); return JSON.parse(previous.payload_json); }
  if (active.size >= 4 || active.has(sourceId)) throw Object.assign(new Error('Another transfer is in progress; wait for completion'), { statusCode: 409 });
  const row = await fleet().get(sourceId), targetNode = await nodes().get(input.targetNode);
  if (!row || row.missing || row.node_id === 'local' || row.node_id === input.targetNode || !targetNode?.enabled || !targetNode.key_encrypted) throw Object.assign(new Error('Choose a different enrolled node for this agent server'), { statusCode: 400 });
  const preview = await rootRuntimeJson(row.node_id, `/api/servers/${row.runtime_id}/clone?runtimeKey=${encodeURIComponent(row.runtime_key)}`, actor);
  if (!preview.stopped || preview.fingerprint !== input.fingerprint) throw Object.assign(new Error('Stop the source and refresh the transfer preview'), { statusCode: 409 });
  if (active.size >= 4 || active.has(sourceId)) throw Object.assign(new Error('Another transfer is in progress'), { statusCode: 409 });
  active.add(sourceId);
  const job: TransferJob = { id: randomUUID(), sourceId, targetNode: input.targetNode, status: 'running', stage: 'Exporting offline backup', startedAt: new Date().toISOString() };
  const admitted = await db.run('INSERT OR IGNORE INTO server_transfer_jobs VALUES(?,?,?,?,?)', job.id, ownerId, requestKey, fingerprint, JSON.stringify(job)).catch(error => { active.delete(sourceId); throw error; });
  if (admitted.changes !== 1) {
    active.delete(sourceId);
    const concurrent = await db.get('SELECT fingerprint,payload_json FROM server_transfer_jobs WHERE owner_id=? AND request_key=?', ownerId, requestKey);
    if (concurrent?.fingerprint !== fingerprint) throw Object.assign(new Error('Conflicting transfer request'), { statusCode: 409 });
    return JSON.parse(concurrent.payload_json);
  }
  void (async () => {
    try {
      const exported = await rootRuntimeJson(row.node_id, `/api/servers/${row.runtime_id}/clone/export`, actor, { runtimeKey: row.runtime_key, fingerprint: input.fingerprint }, job.id + '_export');
      const result = await waitJob(row.node_id, row.runtime_id, exported.job.id, actor), exportId = result.result?.exportId;
      if (!/^[0-9a-f-]{36}$/.test(exportId)) throw new Error('Invalid export receipt');
      const packet = validateTransferPacket(await rootRuntimeJson(row.node_id, `/api/servers/${row.runtime_id}/clone/export/${exportId}`, actor));
      if (packet.source.runtime_uuid !== row.runtime_key) throw new Error('Export source changed');
      job.stage = 'Preparing destination'; await save(job);
      const target = await rootRuntimeJson(input.targetNode, '/api/servers/clone-import', actor, { packet, input: { name: input.name, ports: input.ports } }, job.id + '_prepare');
      if (!Number.isSafeInteger(target.targetId) || target.targetId <= 0 || !/^[0-9a-f]{32}$/.test(target.runtimeKey)) throw new Error('Invalid destination identity');
      job.targetId = target.targetId; job.targetRuntimeKey = target.runtimeKey; job.stage = 'Copying and verifying archive'; await save(job);
      const received = await streamTransfer(row.node_id, input.targetNode, `/api/servers/${row.runtime_id}/clone/archive/${exportId}`, `/api/servers/${target.targetId}/clone/receive?runtimeKey=${target.runtimeKey}`, packet.archive.size, actor);
      job.stage = 'Restoring destination'; await save(job);
      await waitJob(input.targetNode, target.targetId, received.job.id, actor);
      job.status = 'completed'; job.stage = 'Destination ready, stopped. Source retained for rollback.'; job.completedAt = new Date().toISOString(); await save(job);
      await refreshFleet().catch(() => {});
    } catch (error) {
      job.status = job.stage === 'Exporting offline backup' ? 'failed' : 'uncertain';
      job.error = (error as Error).message.slice(0, 1000) + (job.status === 'uncertain' ? ' Inspect the destination before retrying; it may contain completed files.' : '');
      job.completedAt = new Date().toISOString(); await save(job);
    } finally { active.delete(sourceId); }
  })().catch(error => console.error('Transfer result persistence failed', job.id, error));
  return job;
}
