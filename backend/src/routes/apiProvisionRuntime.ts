import { Router } from 'express';
import { rootOnly, type AuthenticatedRequest } from '../middleware/auth.js';
import { provisionNative, provisionReceipt } from '../services/apiProvisionRuntime.js';
import { globalSettings } from '../services/globalSettings.js';
export const apiProvisionRuntimeRoutes = Router();
apiProvisionRuntimeRoutes.use(rootOnly);
apiProvisionRuntimeRoutes.get('/allocations', (_req, res) => res.json({ allocations: globalSettings().snapshot().network.allocations }));
apiProvisionRuntimeRoutes.get('/:operationId', async (req, res) => {
    try { res.json(await provisionReceipt(req.params.operationId)); }
    catch { res.status(503).json({ error: 'Receipt unavailable' }); }
});
for (const action of ['plan', 'install']) apiProvisionRuntimeRoutes.post('/' + action, async (req: AuthenticatedRequest, res) => {
    try { res.json(await provisionNative(req.body, req.user!.username, action === 'plan')); }
    catch (e: any) { res.status([400,404,409].includes(e.statusCode) ? e.statusCode : 503).json({ error: action === 'plan' && [400,404,409].includes(e.statusCode) ? e.message : 'Installation request could not be confirmed' }); }
});
