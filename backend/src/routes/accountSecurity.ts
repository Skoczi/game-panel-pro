import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { userRepository } from '../database/index.js';
import { comparePasswords } from '../utils/auth.js';
import { loginSessions } from '../services/loginSessions.js';
import { mfaStore } from '../services/mfa.js';
import { issueSession } from '../services/sessionHttp.js';
import { ApiRateLimit } from '../services/apiRateLimit.js';
import { logError, logInfo } from '../utils/logger.js';
const router = Router(), attempts = new ApiRateLimit(5, 60000);
router.use(authMiddleware);
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.get('/', async (req: AuthenticatedRequest, res) => {
  try { return res.json({ mfaEnabled: await (await mfaStore()).enabled(req.user!.userId) }); }
  catch { return res.status(503).json({ error: 'Security settings unavailable' }); }
});
router.post('/:action', async (req: AuthenticatedRequest, res) => {
  const limit = attempts.take(String(req.user!.userId));
  if (!limit.allowed) { res.setHeader('Retry-After', String(limit.retryAfterSeconds)); return res.status(429).json({ error: 'Too many security changes. Try again later.' }); }
  try {
    const action = req.params.action;
    if (!['begin', 'confirm', 'disable'].includes(action)) return res.status(404).json({ error: 'Not found' });
    const user = await userRepository.findById(req.user!.userId);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!user || !password || !await comparePasswords(password, user.password_hash)) return res.status(403).json({ error: 'Current password is incorrect' });
    const store = await mfaStore();
    if (action === 'begin') return res.json({ secret: await store.begin(user.id) });
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    let recoveryCodes: string[] | undefined;
    if (action === 'confirm') recoveryCodes = await store.confirm(user.id, code);
    else {
      if (!await store.verify(user.id, code)) return res.status(403).json({ error: 'Invalid or already used authenticator/recovery code' });
      await store.disable(user.id);
    }
    await (await loginSessions()).revokeAll(user.id);
    logInfo('ACCOUNT:SECURITY', action === 'confirm' ? 'MFA enabled; prior sessions revoked' : 'MFA disabled; prior sessions revoked', { userId: user.id });
    return res.json({ success: true, recoveryCodes, token: await issueSession(req, res, user) });
  } catch (error) {
    const expected = ['MFA is already enabled', 'Setup expired. Start again.', 'Invalid authenticator code', 'Setup changed. Refresh before retrying.'];
    if (error instanceof Error && expected.includes(error.message)) return res.status(400).json({ error: error.message });
    logError('ACCOUNT:SECURITY', error, { userId: req.user?.userId });
    return res.status(503).json({ error: 'Security change could not be confirmed. Refresh settings before retrying.' });
  }
});
export default router;
