import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { rootOnly, type AuthenticatedRequest } from '../middleware/auth.js';
import { fleet } from '../fleet/control.js';
import { rootRuntimeJson } from '../services/rootRuntimeTransport.js';
import { previewClone, cloneServer } from '../services/serverClone.js';
import { startBackupJob } from '../services/backupJobs.js';
import { enterServerMutation } from '../services/nativeOperationLock.js';
import { sendRouteError } from '../utils/routeErrors.js';
import { nodes } from '../nodes/control.js';
import { startTransfer, readTransferJob, latestTransfer } from '../services/serverTransferControl.js';
export const fleetCloneRoutes = Router();
fleetCloneRoutes.use(rootOnly);
fleetCloneRoutes.get('/:id/clone', async (req: AuthenticatedRequest, res) => {
  try {
    const row = await fleet().get(req.params.id); if (!row || row.missing) return res.status(404).json({ error: 'Server unavailable' });
    res.setHeader('Cache-Control', 'no-store');
    const preview = row.node_id === 'local' ? await previewClone(row.runtime_id, row.runtime_key)
      : await rootRuntimeJson(row.node_id, `/api/servers/${row.runtime_id}/clone?runtimeKey=${encodeURIComponent(row.runtime_key)}`, req.user!.username);
    res.json({ ...preview, transfer: await latestTransfer(row.id), sourceNode: row.node_id, targets: row.node_id === 'local' ? [] : (await nodes().list()).filter(n => n.enabled && n.status !== 'pending' && n.id !== row.node_id).map(n => ({ id: n.id, name: n.name, location: n.location })) });
  } catch (error) { sendRouteError(res, error, { route: 'FLEET:CLONE_PREVIEW', fallbackMessage: 'Clone preview unavailable' }); }
});
fleetCloneRoutes.post('/:id/transfer', async (req: AuthenticatedRequest, res) => {
  try { res.status(202).json({ job: await startTransfer(req.params.id, req.body, req.user!.username, req.user!.userId, String(req.headers['idempotency-key'] || randomUUID())) }); }
  catch (error) { sendRouteError(res, error, { route: 'FLEET:TRANSFER', fallbackMessage: 'Transfer could not start' }); }
});
fleetCloneRoutes.get('/transfers/:jobId', async (req, res) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json({ job: await readTransferJob(req.params.jobId) }); }
  catch (error) { sendRouteError(res, error, { route: 'FLEET:TRANSFER_STATUS', fallbackMessage: 'Transfer status unavailable' }); }
});
fleetCloneRoutes.post('/:id/clone', async (req: AuthenticatedRequest, res) => {
  try {
    const row = await fleet().get(req.params.id); if (!row || row.missing) return res.status(404).json({ error: 'Server unavailable' });
    const input = { ...req.body, runtimeKey: row.runtime_key }, actor = req.user!.username;
    if (row.node_id !== 'local') return res.status(202).json(await rootRuntimeJson(row.node_id, `/api/servers/${row.runtime_id}/clone`, actor, input, String(req.headers['idempotency-key'] || randomUUID())));
    const release = enterServerMutation(row.runtime_id);
    try { res.status(202).json({ job: await startBackupJob(row.runtime_id, 'clone', actor, () => cloneServer(row.runtime_id, row.runtime_key, input, actor)) }); }
    finally { release(); }
  } catch (error) { sendRouteError(res, error, { route: 'FLEET:CLONE_START', fallbackMessage: 'Clone could not start' }); }
});
