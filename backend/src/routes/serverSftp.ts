import { Router } from 'express';
import { requireServerPermission } from '../middleware/auth.js';
import { serverSftpStatus, updateServerSftp } from '../services/serverSftp.js';
import { sendRouteError } from '../utils/routeErrors.js';
import { requirePositiveInt } from '../utils/httpValidation.js';

export const serverSftpRoutes = Router({ mergeParams: true });
serverSftpRoutes.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
serverSftpRoutes.get('/', requireServerPermission('fs.read'), async (req, res) => {
  try { res.json(await serverSftpStatus(requirePositiveInt(req.params.id, 'Invalid server id'))); }
  catch (error) { sendRouteError(res, error, { route: 'SFTP:READ', fallbackMessage: 'Cannot load SFTP status' }); }
});
serverSftpRoutes.post('/', requireServerPermission('sftp.manage'), requireServerPermission('fs.read'), requireServerPermission('fs.write'), async (req, res) => {
  try { res.json(await updateServerSftp(requirePositiveInt(req.params.id, 'Invalid server id'), req.body)); }
  catch (error) { sendRouteError(res, error, { route: 'SFTP:CHANGE', fallbackMessage: 'Cannot change SFTP access' }); }
});
