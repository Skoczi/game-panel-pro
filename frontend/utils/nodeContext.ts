import { clearAppCache } from './appStorage';
import { panelTab } from './panelLinks';
import { fileLocationUrl } from './fileLocationUrl';
import { appRootPath, serverNumber, shortServerRoute, shortServerUrl } from './serverLinks';

const KEY = 'gamepanel_active_node';
const SERVER_KEY = 'gamepanel_active_server';
const ADMIN_KEY = 'gamepanel_admin_runtime';
// A shared administration URL must never inherit a previously opened game runtime.
if (panelTab() && !location.hash.startsWith('#/nodes/') && !new URLSearchParams(location.search).has('server')) {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(SERVER_KEY);
  sessionStorage.removeItem(ADMIN_KEY);
}
const valid = /^(?:local|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export type ServerContext = {
  displayId?: string;
  id: string;
  nodeId: string;
  runtimeId: number;
  name: string;
  location: string;
  nodeName: string;
  permissions: string[];
  placementRevision: number;
};
export const ACTIVE_SERVER: ServerContext | null = (() => {
  try {
    const value = JSON.parse(sessionStorage.getItem(SERVER_KEY) || 'null');
    return value &&
      valid.test(value.id) &&
      value.id !== 'local' &&
      valid.test(value.nodeId) &&
      Number.isSafeInteger(value.runtimeId) &&
      value.runtimeId > 0
      ? value
      : null;
  } catch {
    return null;
  }
})();
export const ADMIN_RUNTIME = sessionStorage.getItem(ADMIN_KEY) === '1';
export const ACTIVE_NODE = (() => {
  try {
    const value = ACTIVE_SERVER?.nodeId || (ADMIN_RUNTIME ? sessionStorage.getItem(KEY) : null);
    return value && valid.test(value) ? value : 'local';
  } catch {
    return 'local';
  }
})();
export function selectNode(id: string, preserveServerPage = false) {
  if (!valid.test(id)) throw new Error('Invalid node');
  if (!preserveServerPage) {
    window.dispatchEvent(new CustomEvent('gp:node-scope', { detail: id }));
    openFleet();
    return;
  }
  // An explicit Open servers action must also leave the Nodes tab for the current runtime.
  // Per-tab identity. A full reload closes sockets and discards every server-ID cache.
  sessionStorage.setItem(KEY, id);
  sessionStorage.setItem(ADMIN_KEY, '1');
  sessionStorage.removeItem(SERVER_KEY);
  const hash =
    preserveServerPage && location.hash.startsWith(`#/nodes/${id}/servers/`) ? location.hash : '';
  history.replaceState(null, '', `${appRootPath()}${hash}`);
  clearAppCache();
  window.location.reload();
}
export function clearNodeSelection() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(SERVER_KEY);
  sessionStorage.removeItem(ADMIN_KEY);
}
export function openServer(context: ServerContext) {
  clearNodeSelection();
  sessionStorage.setItem(SERVER_KEY, JSON.stringify(context));
  const hash = location.hash.startsWith(`#/nodes/${context.nodeId}/servers/${context.runtimeId}/`)
    ? location.hash
    : '';
  const number = serverNumber(context.displayId);
  const requested = shortServerRoute();
  const tab = requested?.tab || hash.split('/').pop() || 'console';
  const destination = new URL(number ? shortServerUrl(number, tab) : `${appRootPath()}?server=${encodeURIComponent(context.id)}${hash}`, location.origin);
  if (tab === 'filemanager' && (requested?.number === number || (!number && !!hash))) {
    const query = new URLSearchParams(location.search);
    for (const key of ['root', 'path']) {
      const value = query.get(key);
      if (value !== null) destination.searchParams.set(key, value);
    }
  }
  const writeLocation = requested || new URLSearchParams(location.search).has('server') || hash ? 'replaceState' : 'pushState';
  history[writeLocation](
    null,
    '',
    fileLocationUrl(destination)
  );
  clearAppCache();
  window.location.reload();
}
export function openFleet() {
  navigateToFleet(false);
}
export function redirectToFleet() {
  navigateToFleet(true);
}
function navigateToFleet(replace: boolean) {
  clearNodeSelection();
  if (location.href !== new URL(appRootPath(), location.origin).href) history[replace ? 'replaceState' : 'pushState'](null, '', appRootPath());
  clearAppCache();
  window.location.reload();
}
export function runtimeUrl(url: string, nodeId = ACTIVE_NODE): string {
  if (nodeId === 'local') return url;
  if (!valid.test(nodeId)) throw new Error('Invalid node');
  if (/^\/api\/servers(?:\/|$)/.test(url) || url === '/api/system/bind-addresses')
    return `/api/nodes/${nodeId}/runtime${url}`;
  return url;
}
export const runtimePrefix = (id: string) => (id === 'local' ? '' : `/api/nodes/${id}/runtime`);
