import { Router } from 'express';
import { rootOnly, type AuthenticatedRequest } from '../middleware/auth.js';
import { cloneServer, previewClone } from '../services/serverClone.js';
import { startBackupJob } from '../services/backupJobs.js';
import { requirePositiveInt } from '../utils/httpValidation.js';
import { sendRouteError } from '../utils/routeErrors.js';
export const serverCloneRoutes = Router({ mergeParams: true });
serverCloneRoutes.use(rootOnly);
serverCloneRoutes.get('/', async (req: AuthenticatedRequest, res) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await previewClone(requirePositiveInt(req.params.id, 'Invalid server'), String(req.query.runtimeKey || ''))); }
  catch (error) { sendRouteError(res, error, { route: 'CLONE:PREVIEW', fallbackMessage: 'Clone preview unavailable' }); }
});
serverCloneRoutes.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const id = requirePositiveInt(req.params.id, 'Invalid server'), input = req.body;
    const preview = await previewClone(id, input?.runtimeKey);
    if (!preview.stopped || preview.fingerprint !== input?.fingerprint) return res.status(409).json({ error: 'Stop the source and refresh the clone preview' });
    const actor = req.user?.username || 'Operator';
    res.status(202).json({ job: await startBackupJob(id, 'clone', actor, () => cloneServer(id, input.runtimeKey, input, actor)) });
  } catch (error) { sendRouteError(res, error, { route: 'CLONE:START', fallbackMessage: 'Clone could not start' }); }
});
