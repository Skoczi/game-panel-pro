import { AppSelect, AppToggle } from '../src/ui/components';
import type { GameTemplate } from '../utils/gameTemplates';
export function TemplateMonitoringEditor({ draft, change }: { draft: GameTemplate; change: (patch: Partial<GameTemplate>) => void }) {
    const ports = draft.ports.filter(p => p.protocol === 'udp');
    return <div className="space-y-5">
        <h3 className="text-lg font-semibold">Game monitoring</h3>
        <p className="text-sm text-slate-500">Default A2S monitoring for new servers.</p>
        <AppToggle label="Enable monitoring by default" checked={Boolean(draft.monitoring)} disabled={!ports.length && !draft.monitoring} onChange={enabled => change({ monitoring: enabled ? { protocol: 'a2s', queryPort: ports[0].key } : undefined })} />
        {draft.monitoring && <>
            <p>A2S · Counter-Strike 1.6 / ReHLDS and compatible Source games</p>
            <AppSelect controlLabel="Template query port" value={draft.monitoring.queryPort} options={ports.map(p => ({ value: p.key, label: `${p.label} · UDP ${p.container}` }))} onChange={queryPort => change({ monitoring: { protocol: 'a2s', queryPort } })} />
            {!ports.some(p => p.key === draft.monitoring?.queryPort) && <p role="alert">Choose an existing UDP port before saving this template.</p>}
            <p className="text-sm text-slate-500">Defaults: 30s interval · 90s startup grace · 3 failures per incident</p>
        </>}
        {!ports.length && <p>Add a UDP port in Network before enabling game monitoring.</p>}
    </div>;
}
