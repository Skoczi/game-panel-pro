export const PANEL_PATHS: Record<string, string> = {
  'game-servers': '/',
  'admin-users': '/users',
  nodes: '/nodes',
  'game-templates': '/templates',
  settings: '/settings',
  'host-status': '/host-status',
};

export function panelTab(path = location.pathname): string | null {
  const normalized = path.replace(/\/$/, '') || '/';
  return Object.entries(PANEL_PATHS).find(([, value]) => value === normalized)?.[0] ?? null;
}

export function panelUrl(tab: string): string {
  return PANEL_PATHS[tab] || '/';
}

export function readPanelTab(): string {
  return panelTab() || 'game-servers';
}
