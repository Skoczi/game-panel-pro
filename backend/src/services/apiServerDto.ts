import { isIP } from 'node:net';
const text = (v: unknown, max = 128): string | null => typeof v === 'string' ? v.slice(0, max) : null;
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
/** Whitelist at both boundaries: never retain environment, paths, commands or runtime credentials. */
export function runtimeSummary(value: any) {
    const ports: Array<{ protocol: 'tcp' | 'udp'; ip: string; port: number; label: string | null }> = [];
    for (const protocol of ['udp', 'tcp'] as const) for (const p of Array.isArray(value?.ports?.[protocol]) ? value.ports[protocol] : []) {
        if (typeof p.hostIp === 'string' && isIP(p.hostIp) && p.hostIp !== '0.0.0.0' && Number.isInteger(p.host) && p.host > 0 && p.host <= 65535)
            ports.push({ protocol, ip: p.hostIp, port: p.host, label: text(p.label) });
    }
    const s = value?.providerMetadata?.template;
    const m = value?.monitoring, i = value?.installProgress;
    return {
        runtimeStatus: ['running','stopped','creating','installing','starting','stopping','restarting','unhealthy','failed'].includes(value?.status) ? value.status as string : null,
        ports, template: s && typeof s.id === 'string' && Number.isSafeInteger(s.version) ? { id: s.id, version: s.version, name: text(s.document?.name) } : null,
        limits: { cpu: number(value?.resourceLimits?.cpu), memoryMb: number(value?.resourceLimits?.memoryMb) },
        desiredState: ['running', 'stopped'].includes(value?.desiredState) ? value.desiredState as string : null,
        uptimeSeconds: value?.status === 'running' ? number(value?.uptimeSeconds) : null,
        installation: i ? { status: text(i.status), percent: number(i.progress), updatedAt: text(i.updatedAt), completedAt: text(i.completedAt) } : null,
        game: m ? { supported: m.enabled === true, state: text(m.state), checkedAt: text(m.checkedAt),
            staleAfterSeconds: number(m.staleAfterSeconds), latencyMs: number(m.latencyMs),
            map: text(m.info?.map), players: number(m.info?.players), maxPlayers: number(m.info?.maxPlayers) } : null,
    };
}
export type RuntimeSummary = ReturnType<typeof runtimeSummary>;
export function freshSummary(summary: RuntimeSummary | null, available: boolean) {
    if (!summary) return null;
    const m = summary.game;
    const stale = !available || Boolean(m?.checkedAt && Date.now() - Date.parse(m.checkedAt) > (m.staleAfterSeconds ?? 75) * 1000);
    return { ...summary, runtimeStatus: available ? summary.runtimeStatus : null, uptimeSeconds: available ? summary.uptimeSeconds : null,
        game: m ? { ...m, ...(stale ? { state: 'stale', players: null, maxPlayers: null, map: null, latencyMs: null } : {}) } : null };
}
