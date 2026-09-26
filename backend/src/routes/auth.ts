import { Router, type Request, type Response } from 'express';
import { LoginRateLimit } from '../services/loginRateLimit.js';
import { type AuthenticatedRequest, authMiddleware, requireGlobalPermission } from '../middleware/auth.js';
import { comparePasswords, hashPassword } from '../utils/auth.js';
import { loginSessions } from '../services/loginSessions.js';
import { mfaStore } from '../services/mfa.js';
import { clearSessionCookie, issueSession, sessionAccessToken, sessionCookie, trustedSessionRequest } from '../services/sessionHttp.js';
import { userRepository, serverMemberRepository } from '../database/index.js';
import { asNonEmptyString } from './users.js';
import { sendRouteError } from '../utils/routeErrors.js';
import { PERMISSIONS } from '../permissions.js';
import { requireBodyObject } from '../utils/httpValidation.js';

const router = Router();
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

function isStrongEnoughPassword(password: string): boolean {
  return password.length >= 8;
}

function normalizeUsername(value: string): string {
  return value.trim();
}

function isValidUsername(value: string): boolean {
  return value.length > 0 && value.length <= 12;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const arr = value
    .filter((x) => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (arr.length !== value.length) return null;
  return arr;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const LOGIN_RATE_WINDOW_MS = readPositiveIntEnv('LOGIN_RATE_WINDOW_MS', 15 * 60_000);
const LOGIN_RATE_MAX_ATTEMPTS = readPositiveIntEnv('LOGIN_RATE_MAX_ATTEMPTS', 10);
const LOGIN_RATE_BLOCK_MS = readPositiveIntEnv('LOGIN_RATE_BLOCK_MS', 15 * 60_000);

const loginRateByIp = new LoginRateLimit(readPositiveIntEnv('LOGIN_RATE_IP_MAX_ATTEMPTS', 100), LOGIN_RATE_WINDOW_MS, LOGIN_RATE_BLOCK_MS);
const loginRateByIdentifier = new LoginRateLimit(LOGIN_RATE_MAX_ATTEMPTS, LOGIN_RATE_WINDOW_MS, LOGIN_RATE_BLOCK_MS);

function ensureLoginRateLimit(req: Request, res: Response, identifier: string): boolean {
  // Express only reads forwarding information when trust proxy is configured.
  const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
  const sourceRetry = loginRateByIp.take(ip);
  const retryAfterSeconds = sourceRetry || loginRateByIdentifier.take(identifier.toLowerCase());
  if (!retryAfterSeconds) return true;
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.status(429).json({ error: 'Too many login attempts', retryAfterSeconds });
  return false;
}

// POST /api/auth/register
router.post(
  '/register',
  authMiddleware,
  requireGlobalPermission(PERMISSIONS.users.manage),
  async (req: Request, res: Response) => {
    try {
      const body = requireBodyObject(req.body);
      const username = asNonEmptyString(body.username);
      const password = asNonEmptyString(body.password);
      const confirmPassword = asNonEmptyString(body.confirmPassword);

      const globalPermissionsRaw = body.globalPermissions;

      let globalPermissions: string[] | undefined = undefined;

      if (globalPermissionsRaw !== undefined) {
        const parsed = asStringArray(globalPermissionsRaw);

        if (parsed === null) {
          return res.status(400).json({ error: 'globalPermissions must be an array of strings' });
        }

        if (parsed.includes('*')) {
          return res.status(400).json({ error: 'Wildcard permission "*" is reserved for root' });
        }

        globalPermissions = parsed;
      }

      if (!username || !password || !confirmPassword) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const normalizedUsername = normalizeUsername(username);
      if (!isValidUsername(normalizedUsername)) {
        return res.status(400).json({ error: 'Username must be between 1 and 12 characters' });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
      }

      if (!isStrongEnoughPassword(password)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const existingByUsername = await userRepository.findByUsername(normalizedUsername);
      if (existingByUsername) {
        return res.status(409).json({ error: 'Username already exists' });
      }

      const passwordHash = await hashPassword(password);

      // Create user (enabled by default)
      const userId = await userRepository.create(normalizedUsername, passwordHash, {
        globalPermissions,
      });

      const user = await userRepository.findById(userId!);
      if (!user) {
        throw new Error('Created user could not be loaded');
      }

      return res.status(201).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          isRoot: Boolean(user.is_root),
          isEnabled: Boolean(user.is_enabled),
          globalPermissions,
        },
      });
    } catch (error) {
      return sendRouteError(res, error, {
        route: 'ROUTE:AUTH:REGISTER',
        fallbackMessage: 'Registration failed',
      });
    }
  }
);

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const body = requireBodyObject(req.body);
    const identifier = asNonEmptyString(body.username);
    const password = asNonEmptyString(body.password);

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const normalizedIdentifier = normalizeUsername(identifier);
    if (!isValidUsername(normalizedIdentifier)) {
      return res.status(400).json({ error: 'Username must be between 1 and 12 characters' });
    }

    if (!ensureLoginRateLimit(req, res, normalizedIdentifier)) {
      return;
    }

    const user = await userRepository.findByUsername(normalizedIdentifier);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_enabled) {
      return res.status(403).json({ error: 'Account disabled' });
    }

    const validPassword = await comparePasswords(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const mfa = await mfaStore();
    if (await mfa.enabled(user.id)) {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!code || !await mfa.verify(user.id, code)) {
          return res.status(401).json({ error: code ? 'Invalid or already used authenticator/recovery code' : 'Authenticator code required', mfaRequired: true });
      }
    }
    loginRateByIdentifier.clear(normalizedIdentifier.toLowerCase());

    const token = await issueSession(req, res, user);

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        isRoot: Boolean(user.is_root),
        isEnabled: Boolean(user.is_enabled),
      },
      token,
    });
  } catch (error) {
    return sendRouteError(res, error, {
      route: 'ROUTE:AUTH:LOGIN',
      fallbackMessage: 'Login failed',
    });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const user = await userRepository.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isRoot = Boolean(user.is_root);

    const globalPermissions = isRoot
      ? ['*']
      : await userRepository.getGlobalPermissions(userId);

    const serverRows = await serverMemberRepository.listByUser(userId);

    const serverPermissions = serverRows.map((r) => {
      let permissions: string[] = [];
      try {
        const parsed = JSON.parse(r.permissions_json ?? '[]');
        if (Array.isArray(parsed)) permissions = parsed.filter((x) => typeof x === 'string');
      } catch {
        // Keep an empty permission list if parsing fails.
      }

      return {
        serverId: r.server_id,
        permissions,
      };
    });

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        isRoot,
        isEnabled: Boolean(user.is_enabled),
      },
      permissions: {
        global: globalPermissions,
        servers: serverPermissions,
      },
    });
  } catch (error) {
    return sendRouteError(res, error, {
      route: 'ROUTE:AUTH:ME',
      fallbackMessage: 'Failed to fetch user',
    });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = requireBodyObject(req.body);
    const currentPassword = asNonEmptyString(body.currentPassword);
    const newPassword = asNonEmptyString(body.newPassword);
    const confirmPassword = asNonEmptyString(body.confirmPassword);

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }

    if (!isStrongEnoughPassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const user = await userRepository.findById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await comparePasswords(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = await hashPassword(newPassword);
    await userRepository.updatePassword(req.user!.userId, newPasswordHash);

    const refreshed = await userRepository.findById(req.user!.userId);
    await (await loginSessions()).revokeAll(req.user!.userId);
    const token = refreshed ? await issueSession(req, res, refreshed) : undefined;

    return res.json({ success: true, message: 'Password changed successfully', token });
  } catch (error) {
    return sendRouteError(res, error, {
      route: 'ROUTE:AUTH:CHANGE_PASSWORD',
      fallbackMessage: 'Failed to change password',
    });
  }
});

router.post('/session', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!trustedSessionRequest(req, res)) return;
  try {
    const session = await (await loginSessions()).fromSecret(sessionCookie(req));
    const user = session ? await userRepository.findById(session.user_id) : undefined;
    if (!session || !user?.is_enabled || user.token_version !== session.token_version) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Session expired or revoked' });
    }
    return res.json({ token: sessionAccessToken(user, session) });
  } catch {
    return res.status(503).json({ error: 'Session service unavailable' });
  }
});

router.post('/logout', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!trustedSessionRequest(req, res)) return;
  try {
    const store = await loginSessions(), session = await store.fromSecret(sessionCookie(req));
    if (session) await store.revoke(session.user_id, session.id);
    clearSessionCookie(res);
    return res.json({ success: true });
  } catch {
    return res.status(503).json({ error: 'Sign-out could not be confirmed. Please retry.' });
  }
});

router.get('/sessions', authMiddleware, async (req: AuthenticatedRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const rows = await (await loginSessions()).list(req.user!.userId);
    return res.json({ sessions: rows.map(row => ({ id: row.id, label: row.label,
      createdAt: row.created_at, expiresAt: row.expires_at, current: row.id === req.user!.sessionId })) });
  } catch { return res.status(503).json({ error: 'Unable to list sessions' }); }
});
router.delete('/sessions/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    await (await loginSessions()).revoke(req.user!.userId, req.params.id);
    if (req.params.id === req.user!.sessionId) clearSessionCookie(res);
    return res.json({ success: true });
  } catch { return res.status(503).json({ error: 'Unable to revoke session' }); }
});

export default router;
