import { gameDisplayName } from './gameDisplayName';

export type FleetLayout = {
  sortVersion?: 2;
  view?: 'cards' | 'table';
  order: string[];
  sort: 'address' | 'custom' | 'name' | 'type' | 'location' | 'status';
  direction?: 'asc' | 'desc';
  group: 'none' | 'type';
  type: string;
  status: string;
};
export const defaultFleetLayout = (): FleetLayout => ({
  sortVersion: 2,
  order: [],
  sort: 'address',
  direction: 'asc',
  group: 'none',
  type: '',
  status: '',
});
export const fleetLayoutKey = (userId: number) => `gamepanel_fleet_layout_v1:${userId}`;
export function readFleetLayout(userId: number): FleetLayout {
  const result = defaultFleetLayout();
  try {
    const stored = JSON.parse(localStorage.getItem(fleetLayoutKey(userId)) || 'null');
    if (!stored || typeof stored !== 'object') return result;
    if (stored.view === 'table' || stored.view === 'cards') result.view = stored.view;
    if (stored.direction === 'asc' || stored.direction === 'desc')
      result.direction = stored.direction;
    if (Array.isArray(stored.order))
      result.order = [
        ...new Set<string>(
          stored.order
            .filter((id: unknown) => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id))
            .slice(0, 10000)
        ),
      ];
    if (['address', 'custom', 'name', 'type', 'location', 'status'].includes(stored.sort))
      result.sort = stored.sort;
    // The former default had no explicit order to preserve.
    if (stored.sortVersion !== 2 && result.sort === 'custom' && result.order.length === 0) {
      result.sort = 'address';
      result.direction = 'asc';
    }
    if (['none', 'type'].includes(stored.group)) result.group = stored.group;
    for (const key of ['type', 'status'] as const)
      if (typeof stored[key] === 'string' && stored[key].length < 400) result[key] = stored[key];
  } catch {
    /* Unavailable or damaged browser storage never blocks the workspace. */
  }
  return result;
}
export function compareFleetAddresses(a?: string, b?: string): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  const split = (address: string) => {
    const colon = address.lastIndexOf(':');
    return [address.slice(0, colon), Number(address.slice(colon + 1))] as const;
  };
  const [hostA, portA] = split(a), [hostB, portB] = split(b);
  return hostA.localeCompare(hostB, 'en', { numeric: true }) || portA - portB;
}
export function fleetGame(
  server: { provider: string; catalogId?: string | null },
  names: Record<string, string>
) {
  if (server.provider === 'native')
    return {
      key: `native:${server.catalogId || 'unknown'}`,
      label: gameDisplayName(server.catalogId || 'Native Runtime'),
    };
  if (server.catalogId)
    return {
      key: `${server.provider}:${server.catalogId}`,
      label: names[server.catalogId] || server.catalogId.replace(/[-_]/g, ' '),
    };
  return {
    key: `${server.provider}:unknown`,
    label:
      server.provider === 'external' ? 'Custom image' : `${server.provider} · Unspecified game`,
  };
}
