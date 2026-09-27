import { Router } from 'express';
import { requireServerPermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { readGameAdmins, writeGameAdmin } from '../services/rehldsContent.js';
export const gameAdminRoutes = Router({ mergeParams: true });
gameAdminRoutes.use(requireServerPermission('fs.read'));
gameAdminRoutes.get('/', async (req: AuthenticatedRequest, res) => {
    try { res.json(await readGameAdmins(Number(req.params.id))); }
    catch (e: any) { res.status([400,404,409].includes(e.statusCode) ? e.statusCode : 503).json({ error: 'Game admin configuration unavailable' }); }
});
gameAdminRoutes.put('/', requireServerPermission('fs.write'), async (req: AuthenticatedRequest, res) => {
    try { res.json(await writeGameAdmin(Number(req.params.id), req.body, req.user!.username)); }
    catch (e: any) { res.status([400,404,409].includes(e.statusCode) ? e.statusCode : 503).json({ error: 'Could not save admin; check version, Steam ID and flags' }); }
});
