import { Router } from 'express';
import { rootOnly, type AuthenticatedRequest } from '../middleware/auth.js';
import { cloneServer, previewClone } from '../services/serverClone.js';
import { startBackupJob } from '../services/backupJobs.js';
import { requirePositiveInt } from '../utils/httpValidation.js';
import { sendRouteError } from '../utils/routeErrors.js';
import { exportServer, readExport, prepareTransfer, receiveTransfer } from '../services/serverTransfer.js';
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
serverCloneRoutes.post('/export', async (req: AuthenticatedRequest, res) => {
  try {
    const id = requirePositiveInt(req.params.id, 'Invalid server'), actor = req.user!.username;
    res.status(202).json({ job: await startBackupJob(id, 'clone', actor, () => exportServer(id, req.body?.runtimeKey, req.body?.fingerprint)) });
  } catch (error) { sendRouteError(res, error, { route: 'TRANSFER:EXPORT', fallbackMessage: 'Export could not start' }); }
});
serverCloneRoutes.get('/export/:exportId', async (req: AuthenticatedRequest, res) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json((await readExport(requirePositiveInt(req.params.id, 'Invalid server'), req.params.exportId)).packet); }
  catch (error) { sendRouteError(res, error, { route: 'TRANSFER:MANIFEST', fallbackMessage: 'Export unavailable' }); }
});
serverCloneRoutes.get('/archive/:exportId', async (req: AuthenticatedRequest, res) => {
  try { const value = await readExport(requirePositiveInt(req.params.id, 'Invalid server'), req.params.exportId); res.setHeader('Cache-Control', 'no-store'); res.download(value.archive, value.packet.archive.name); }
  catch (error) { sendRouteError(res, error, { route: 'TRANSFER:ARCHIVE', fallbackMessage: 'Export archive unavailable' }); }
});
serverCloneRoutes.put('/receive', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.is('application/octet-stream')) return res.status(415).json({ error: 'Expected an archive byte stream' });
    const job = await receiveTransfer(requirePositiveInt(req.params.id, 'Invalid server'), String(req.query.runtimeKey || ''), Number(req.headers['content-length']), req, req.user!.username);
    res.status(202).json({ job });
  } catch (error) { sendRouteError(res, error, { route: 'TRANSFER:RECEIVE', fallbackMessage: 'Archive transfer failed' }); }
});
export const cloneImportRoutes = Router();
cloneImportRoutes.post('/', rootOnly, async (req, res) => {
  try { res.status(201).json(await prepareTransfer(req.body?.packet, req.body?.input)); }
  catch (error) { sendRouteError(res, error, { route: 'TRANSFER:PREPARE', fallbackMessage: 'Transfer target could not be prepared' }); }
});
