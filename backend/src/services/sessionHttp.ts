import { isPanelAdministrator } from '../utils/accountRole.js';
import type { Request, Response } from 'express';
import { getConfig } from '../config.js';
import { generateToken } from '../utils/auth.js';
import type { DbUserRow } from '../database/repositories/userRepository.js';
import { loginSessions, SESSION_TTL_MS, type LoginSession } from './loginSessions.js';

export const SESSION_COOKIE = '__Secure-gp_session';
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/api/auth' };
export function clearSessionCookie(res: Response) { res.clearCookie(SESSION_COOKIE, cookieOptions); }
export function sessionCookie(req: Request) {
  const entry = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(SESSION_COOKIE + '='));
  return entry?.slice(SESSION_COOKIE.length + 1) || '';
}
// Refresh/logout by cookie must come from the configured application. This is
// separate from bearer APIs: never authorize a mutation just because a cookie exists.
export function trustedSessionRequest(req: Request, res: Response) {
  if (req.headers.origin !== getConfig().frontendUrl || req.headers['x-gp-session'] !== '1') {
    res.status(403).json({ error: 'Invalid session request origin' });
    return false;
  }
  return true;
}
export function sessionAccessToken(user: DbUserRow, session: LoginSession) {
  return generateToken({ userId: user.id, username: user.username, isRoot: isPanelAdministrator(user),
    tokenVersion: user.token_version, sessionId: session.id });
}
export async function issueSession(req: Request, res: Response, user: DbUserRow) {
  const store = await loginSessions();
  const old = await store.fromSecret(sessionCookie(req));
  if (old) await store.revoke(old.user_id, old.id);
  const { session, secret } = await store.create(user.id, user.token_version, req.headers['user-agent'] || 'Browser');
  res.cookie(SESSION_COOKIE, secret, { ...cookieOptions, maxAge: SESSION_TTL_MS });
  return sessionAccessToken(user, session);
}
