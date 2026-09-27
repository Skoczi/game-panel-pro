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

let accessToken: string | null = null;
export const setMemoryToken = (token: string | null) => { accessToken = token; };

export const clearCookieValue = (name: string) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
};

export const getStoredToken = (): string | null => {
  // Legacy bearer tokens are no longer accepted as browser sessions. The only
  // persistent credential is the server's HttpOnly refresh cookie.
  localStorage.removeItem(AUTH_TOKEN_KEY);
  clearCookieValue(AUTH_TOKEN_KEY);
  return accessToken;
};
import { ACTIVE_NODE, ACTIVE_SERVER } from '../nodeContext';
