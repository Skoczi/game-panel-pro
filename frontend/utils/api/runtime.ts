const getBrowserOrigin = (): string =>
  typeof window !== 'undefined' ? window.location.origin : '';

const getBrowserProtocol = (): string =>
  typeof window !== 'undefined' ? window.location.protocol : 'http:';

const getBrowserHost = (): string => (typeof window !== 'undefined' ? window.location.host : '');

const getBrowserHostname = (): string =>
  typeof window !== 'undefined' ? window.location.hostname : '';

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '');
const readEnvUrl = (value: string | undefined): string => String(value ?? '').trim();

const browserOrigin = getBrowserOrigin();
const browserHost = getBrowserHost();

export const API_BASE_URL = normalizeBaseUrl(browserOrigin);
export const CATALOG_BASE_URL = normalizeBaseUrl(
  readEnvUrl(import.meta.env.VITE_DB_API_BASE_URL) || API_BASE_URL
);
export const PUBLIC_CONNECTION_HOST = getBrowserHostname();
export const WS_URL = browserHost
  ? `${getBrowserProtocol() === 'https:' ? 'wss:' : 'ws:'}//${browserHost}${ACTIVE_NODE === 'local' ? '/api' : `/api/nodes/${ACTIVE_NODE}/ws`}${ACTIVE_SERVER ? `?server=${ACTIVE_SERVER.id}` : ''}`
  : '';

export const AUTH_TOKEN_KEY = 'auth_token';

const getCookieValue = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
};

export const clearCookieValue = (name: string) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
};

export const getStoredToken = (): string | null => {
  // Migrate cookie-only sessions once, then remove the redundant credential.
  // HTTP/WS requests authenticate explicitly and never need this cookie.
  const token = localStorage.getItem(AUTH_TOKEN_KEY) || getCookieValue(AUTH_TOKEN_KEY);
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  clearCookieValue(AUTH_TOKEN_KEY);
  return token;
};
import { ACTIVE_NODE, ACTIVE_SERVER } from '../nodeContext';
