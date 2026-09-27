import { Router } from 'express';
import { requireServerPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';
import { getGamePlayers } from '../services/gamePlayers.js';
import { sendRouteError } from '../utils/routeErrors.js';

export const gamePlayersRoutes = Router({ mergeParams: true });
gamePlayersRoutes.get('/', requireServerPermission(PERMISSIONS.server.playersRead), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(await getGamePlayers(Number(req.params.id))); }
    catch (error) { sendRouteError(res, error, { route: 'PLAYERS:READ', fallbackMessage: 'Cannot load online players' }); }
});
