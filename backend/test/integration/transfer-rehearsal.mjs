// Run only inside the isolated fixture created by eserv_transfer_rehearsal.py.
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const { getConfig } = await import('../../dist/config.js');
// The product database root is /data; give each fixture process its own database.
getConfig().gamepanelDataDir = process.env.GAMEPANEL_APP_ROOT;
const { initializeDatabase, closeDatabase } = await import('../../dist/database/init.js');
const { apiPower } = await import('../../dist/services/publicApiPower.js');
const { serverRepository } = await import('../../dist/database/index.js');
const { docker } = await import('../../dist/utils/docker/client.js');
const role = process.env.TRANSFER_ROLE;
if (role) {
  const db = await initializeDatabase();
  if (role === 'source') {
    const record = JSON.parse(await readFile('/restore-input/recovery.json', 'utf8')), s = record.server, now = new Date().toISOString();
    await db.run(`INSERT INTO game_servers(id,runtime_uuid,name,provider,docker_image,docker_image_digest,docker_container_id,ports_json,mounts_json,env_json,runtime_config_json,provider_metadata_json,status,desired_state,created_at,updated_at) VALUES(8,?,?,?,?,?,?,?,?,?,?,?,'stopped','stopped',?,?)`, record.runtimeUuid, 'Transfer source rehearsal', s.provider, s.dockerImage, process.env.RESTORE_IMAGE, process.env.RESTORE_CONTAINER, JSON.stringify(s.ports), JSON.stringify(s.mounts), JSON.stringify(s.environment), JSON.stringify(s.runtimeConfig), JSON.stringify(s.providerMetadata), now, now);
  }
  const { default: express } = await import('express');
  const { RequestVerifier } = await import('../../dist/nodes/protocol.js');
  const { serverCloneRoutes, cloneImportRoutes } = await import('../../dist/routes/serverClone.js');
  const { createServerPowerRoutes } = await import('../../dist/routes/servers/power.js');
  const { readBackupJob } = await import('../../dist/services/backupJobs.js');
  const { enterServerMutation } = await import('../../dist/services/nativeOperationLock.js');
  const app = express(), verifier = new RequestVerifier();
  app.use((req, res, next) => {
    try { const claim = verifier.verify(req.headers['x-gamepanel-node-auth'], process.env.REHEARSAL_KEY, process.env.GAMEPANEL_NODE_ID, req.method, req.originalUrl); req.user = { userId: 1, username: claim.actor, isRoot: !claim.delegation, delegation: claim.delegation }; next(); }
    catch { res.status(401).json({ error: 'Signature required' }); }
  });
  app.use(express.json());
  app.get('/api/servers', async (_req, res) => { const rows = await db.all('SELECT * FROM game_servers'); res.json({ servers: rows.map(s => ({ id: s.id, runtimeKey: s.runtime_uuid, name: s.name, provider: s.provider, status: s.status })) }); });
  app.use('/api/servers/clone-import', cloneImportRoutes);
  app.use('/api/servers/:id', (req, res, next) => {
    try { if (req.method !== 'GET') { const release = enterServerMutation(Number(req.params.id)); res.once('finish', release); res.once('close', release); } next(); } catch (e) { res.status(409).json({ error: e.message }); }
  });
  app.get('/api/servers/:id/backups/jobs/:job', async (req, res) => { res.json({ job: await readBackupJob(Number(req.params.id), req.params.job) }); });
  app.use('/api/servers/:id/clone', serverCloneRoutes);
  app.use('/api/servers', createServerPowerRoutes());
  const server = app.listen(Number(process.env.PORT), '127.0.0.1');
  process.on('SIGTERM', () => { server.close(); void closeDatabase().then(() => process.exit(0)); });
} else {
  const { initializeNodes, nodes } = await import('../../dist/nodes/control.js');
  const { initializeFleet, fleet, refreshFleet } = await import('../../dist/fleet/control.js');
  const { seal, signNodeRequest } = await import('../../dist/nodes/protocol.js');
  const { startTransfer, readTransferJob, latestTransfer } = await import('../../dist/services/serverTransferControl.js');
  const { rootRuntimeJson } = await import('../../dist/services/rootRuntimeTransport.js');
  const { queryGame } = await import('../../dist/services/gameQuery.js');
  const db = await initializeDatabase(); await initializeNodes();
  const { default: Docker } = await import('dockerode');
  const fixtureDocker = new Docker({ socketPath: '/var/run/docker.sock' });
  const children = [], sourceId = process.env.SOURCE_NODE, targetId = process.env.TARGET_NODE;
  try {
    for (const [role, id, port] of [['source', sourceId, 31001], ['target', targetId, 31002]]) {
      const key = randomUUID() + randomUUID();
      await db.run('INSERT INTO execution_nodes(id,name,origin,location,key_encrypted,created_at) VALUES(?,?,?,?,?,?)', id, role, `http://127.0.0.1:${port}`, 'isolated', seal(key, process.env.JWT_SECRET, id), Date.now());
      const child = spawn(process.execPath, [import.meta.filename], { env: { ...process.env, TRANSFER_ROLE: role, GAMEPANEL_NODE_ID: id, GAMEPANEL_APP_ROOT: process.env.REHEARSAL_ROOT + '/' + role, PORT: String(port), REHEARSAL_KEY: key }, stdio: ['ignore', 'inherit', 'inherit'] });
      children.push(child);
      let ready = false;
      for (let i = 0; i < 60; i++) { try { await rootRuntimeJson(id, '/api/servers/', 'rehearsal'); ready = true; break; } catch { await new Promise(r => setTimeout(r, 250)); } }
      if (!ready) throw new Error(role + ' HTTP runtime unavailable');
      const denied = await fetch(`http://127.0.0.1:${port}/api/servers`); if (denied.status !== 401) throw new Error('Unsigned request accepted');
    }
    await initializeFleet(); await refreshFleet();
    const row = (await fleet().list()).find(r => r.node_id === sourceId);
    if (!row) throw new Error('Source inventory missing');
    const preview = await rootRuntimeJson(sourceId, `/api/servers/8/clone?runtimeKey=${row.runtime_key}`, 'rehearsal');
    for (const protocol of ['tcp', 'udp']) preview.ports[protocol].forEach((p, i) => { p.host = Number(process.env.CLONE_PORT) + i; p.hostIp = '127.0.0.1'; });
    const input = { targetNode: targetId, fingerprint: preview.fingerprint, ports: preview.ports, name: 'Transferred rehearsal' }, key = randomUUID();
    const job = await startTransfer(row.id, input, 'rehearsal', 1, key);
    const replay = await startTransfer(row.id, input, 'rehearsal', 1, key); if (replay.id !== job.id) throw new Error('Duplicate transfer admitted');
    let result;
    for (let i = 0; i < 600; i++) { result = await readTransferJob(job.id); if (result.status !== 'running') break; await new Promise(r => setTimeout(r, 1000)); }
    if (result.status !== 'completed') throw new Error('Transfer failed: ' + result.error);
    if ((await latestTransfer(row.id)).id !== job.id || result.targetRuntimeKey === row.runtime_key) throw new Error('Transfer receipt/identity invalid');
    const containers = await fixtureDocker.listContainers({ all: true });
    const target = containers.find(c => c.Labels['gamepanel.node'] === targetId);
    if (!target) throw new Error('Destination container missing');
    const container = fixtureDocker.getContainer(target.Id);
    if ((await container.inspect()).State.Running) throw new Error('Destination auto-started');
    if ((await fixtureDocker.getContainer(process.env.RESTORE_CONTAINER).inspect()).State.Running) throw new Error('Source auto-started');
    const powerRow = { node_id: targetId, runtime_id: result.targetId, runtime_key: result.targetRuntimeKey };
    console.log('Scoped API start');
    await apiPower(powerRow, 1, randomUUID(), 'start');
    console.log('Scoped API start confirmed');
    const runtime = await container.inspect(), address = runtime.NetworkSettings.Networks[process.env.GAMEPANEL_GAMES_NETWORK].IPAddress;
    let info;
    for (let i = 0; i < 30; i++) { try { info = await queryGame(address, preview.ports.udp[0].container, 1000); break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
    if (!info) throw new Error('Transferred game did not answer A2S');
    console.log('Scoped API stop');
    await apiPower(powerRow, 1, randomUUID(), 'stop');
    console.log('Scoped API stop confirmed');
    if ((await container.inspect()).State.Running) throw new Error('API stop failed');
    console.log('Scoped API restart');
    await apiPower(powerRow, 1, randomUUID(), 'restart');
    console.log('Scoped API restart confirmed');
    if (!(await container.inspect()).State.Running) throw new Error('API restart failed');
    console.log(JSON.stringify({ scopedApiPowerVerified: true, transfer: 'completed', signedHttp: true, checksumVerified: true, duplicateNotReplayed: true, receiptPersistent: true, newIdentity: true, bothInitiallyStopped: true, gameAnswered: true }));
    await writeFile(process.env.REHEARSAL_ROOT + '/result.json', JSON.stringify({ completed: true, game: info }));
  } finally { for (const child of children) child.kill('SIGTERM'); await Promise.all(children.map(c => new Promise(r => c.once('exit', r)))); await closeDatabase(); }
}
