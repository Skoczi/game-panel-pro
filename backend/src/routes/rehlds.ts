import { addonPreview, installRehldsAddons } from '../services/rehldsAddons.js';
import { REHLDS_MODULES } from '../services/rehldsPackages.js';
import { startBackupJob } from '../services/backupJobs.js';
import { Router } from 'express';
import { requireServerPermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';
import { requirePositiveInt } from '../utils/httpValidation.js';
import { sendRouteError } from '../utils/routeErrors.js';
import { readRehldsContent, saveRehldsContent } from '../services/rehldsContent.js';
export const rehldsRoutes = Router({ mergeParams: true });
rehldsRoutes.get('/addons', requireServerPermission(PERMISSIONS.fs.read), async (req, res) => {
  try { res.setHeader('Cache-Control', 'no-store'); const modules = typeof req.query.modules === 'string' ? req.query.modules.split(',') : ['metamod', 'amxx']; res.json({ ...await addonPreview(requirePositiveInt(req.params.id, 'Invalid server'), modules), catalogue: REHLDS_MODULES }); }
  catch (error) { sendRouteError(res, error, { route: 'REHLDS:PREVIEW', fallbackMessage: 'Cannot preview addons' }); }
});
rehldsRoutes.post('/addons', requireServerPermission(PERMISSIONS.fs.read), requireServerPermission(PERMISSIONS.fs.write), requireServerPermission(PERMISSIONS.backups.create), requireServerPermission(PERMISSIONS.backups.restore), async (req: AuthenticatedRequest, res) => {
  try {
    const id = requirePositiveInt(req.params.id, 'Invalid server'), preview = await addonPreview(id, req.body?.modules);
    if (!preview.stopped || preview.fingerprint !== req.body?.fingerprint) return res.status(409).json({ error: 'Stop the server and refresh the installation preview' });
    const job = await startBackupJob(id, 'addon', req.user?.username || 'Operator', () => installRehldsAddons(id, req.body.modules, preview.fingerprint));
    res.status(202).json({ job });
  } catch (error) { sendRouteError(res, error, { route: 'REHLDS:INSTALL', fallbackMessage: 'Cannot install addons' }); }
});
rehldsRoutes.get('/:section', requireServerPermission(PERMISSIONS.fs.read), async (req, res) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await readRehldsContent(requirePositiveInt(req.params.id, 'Invalid server'), req.params.section)); }
  catch (error) { sendRouteError(res, error, { route: 'REHLDS:READ', fallbackMessage: 'Cannot read ReHLDS configuration' }); }
});
rehldsRoutes.put('/:section', requireServerPermission(PERMISSIONS.fs.read), requireServerPermission(PERMISSIONS.fs.write), async (req: AuthenticatedRequest, res) => {
  try { res.json(await saveRehldsContent(requirePositiveInt(req.params.id, 'Invalid server'), req.params.section, req.body, req.user?.username || 'Operator')); }
  catch (error) { sendRouteError(res, error, { route: 'REHLDS:WRITE', fallbackMessage: 'Cannot save ReHLDS configuration' }); }
});
