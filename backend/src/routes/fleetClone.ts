import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { rootOnly, type AuthenticatedRequest } from '../middleware/auth.js';
import { fleet } from '../fleet/control.js';
import { rootRuntimeJson } from '../services/rootRuntimeTransport.js';
import { previewClone, cloneServer } from '../services/serverClone.js';
import { startBackupJob } from '../services/backupJobs.js';
import { enterServerMutation } from '../services/nativeOperationLock.js';
import { sendRouteError } from '../utils/routeErrors.js';
export const fleetCloneRoutes = Router();
fleetCloneRoutes.use(rootOnly);
fleetCloneRoutes.get('/:id/clone', async (req: AuthenticatedRequest, res) => {
  try {
    const row = await fleet().get(req.params.id); if (!row || row.missing) return res.status(404).json({ error: 'Server unavailable' });
    res.setHeader('Cache-Control', 'no-store');
    res.json(row.node_id === 'local' ? await previewClone(row.runtime_id, row.runtime_key)
      : await rootRuntimeJson(row.node_id, `/api/servers/${row.runtime_id}/clone?runtimeKey=${encodeURIComponent(row.runtime_key)}`, req.user!.username));
  } catch (error) { sendRouteError(res, error, { route: 'FLEET:CLONE_PREVIEW', fallbackMessage: 'Clone preview unavailable' }); }
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
