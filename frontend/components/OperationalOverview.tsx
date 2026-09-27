import { useEffect, useState } from 'react';
import { nodesRequest, type ExecutionNode, type LocalNode } from '../utils/nodesApi';
import { runtimePrefix } from '../utils/nodeContext';

type Check = { serverId?: number; category?: string; key: string; title: string; detail: string; status: 'ok' | 'warning' | 'critical' | 'unknown'; observedAt: number };
type Runtime = { id: string; name: string; checks: Check[]; version?: string; commit?: string };
const requirements: Record<string, string> = { operationalHealth: 'Operational checks', nativeBackupPolicy: 'External backup policy', nativeRestoreRecovery: 'Restore recovery', alertRelay: 'Alert delivery' };
const labels = { ok: 'OK', warning: 'Warning', critical: 'Critical', unknown: 'Unknown' };
const colors = { ok: 'text-green-700 dark:text-green-400', warning: 'text-amber-700 dark:text-amber-400', critical: 'text-red-700 dark:text-red-400', unknown: 'text-gray-600 dark:text-gray-400' };

export function OperationalOverview({ scope = 'all', servers = [] }: { scope?: string; servers?: Array<{ runtimeId?: number; displayId?: string; node: { id?: string } }> }) {
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const fleet = await nodesRequest<{ nodes: ExecutionNode[]; local?: LocalNode }>('/api/nodes');
        const nodes = [{ id: 'local', name: fleet.local?.name || 'Panel', enabled: 1, status: 'online' }, ...fleet.nodes];
        const result: Runtime[] = [];
        // Bound fan-out; failure of one runtime must not hide other hosts.
        for (let i = 0; i < nodes.length; i += 4) {
          result.push(...await Promise.all(nodes.slice(i, i + 4).filter(n => n.enabled && (scope === 'all' || scope === n.id)).map(async node => {
            const base: Runtime = { id: node.id, name: node.name, checks: [] };
            const problem = (key: string, title: string, detail: string, status: Check['status'] = 'unknown') => ({ key, title, detail, status, observedAt: Date.now() });
            if (node.status !== 'online') return { ...base, checks: [problem('offline', 'Node unavailable', 'Restore the node connection to resume checks.', 'critical')] };
            try {
              const prefix = runtimePrefix(node.id);
              const health = await nodesRequest<{ version: string; commit?: string; capabilities?: Record<string, number> }>(`${prefix}/api/health`);
              base.version = health.version; base.commit = health.commit;
              for (const [key, title] of Object.entries(requirements)) if (health.capabilities?.[key] !== 1) base.checks.push(problem(key, title, 'Update the agent to support this check.', 'warning'));
              if (health.capabilities?.operationalHealth === 1) {
                const operational = await nodesRequest<{ checks: Check[] }>(`${prefix}/api/system/operational-health`);
                base.checks.push(...operational.checks);
                if (!operational.checks.length) base.checks.push(problem('empty', 'Waiting for measurements', 'The runtime has not produced operational measurements yet.'));
              }
              return base;
            } catch { return { ...base, checks: [...base.checks, problem('unavailable', 'Measurements unavailable', 'Refresh or check the runtime connection.')] }; }
          })));
        }
        if (active) { setRuntimes(result); setError(false); }
      } catch { if (active) setError(true); }
      finally { if (active) { setLoading(false); timer = setTimeout(refresh, 60000); } }
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [scope, revision]);
  const destination = (nodeId: string, check: Check) => {
    const server = servers.find(s => s.node.id === nodeId && s.runtimeId === check.serverId);
    const number = /^SRV-([1-9]\d*)$/.exec(server?.displayId || '')?.[1];
    return number ? `/s/${number}/${check.category === 'backup' ? 'backups' : check.category === 'schedule' ? 'schedules' : 'console'}` : null;
  };
  const issues = runtimes.flatMap(runtime => runtime.checks.filter(check => check.status !== 'ok').map(check => ({ ...check, node: runtime.name, id: runtime.id })));
  return <section aria-label="Operational health" className="gp-workflow gp-operational mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold">Needs attention{!loading && !error ? ` · ${issues.length}` : ''}</h2>
      <button type="button" className="gp-fleet-button" onClick={() => { setLoading(true); setRevision(v => v + 1); }}>Refresh checks</button>
    </div>
    {loading && <p role="status" className="mt-2 text-sm">Checking runtimes…</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-600">Could not refresh operational health. Previous measurements may be stale.</p>}
    {!loading && !error && !issues.length && <p className="mt-2 text-sm text-green-700 dark:text-green-400">All checks passed · {runtimes.length} nodes</p>}
    {!!issues.length && <ul className="mt-3 space-y-2">{issues.map(issue => <li key={`${issue.id}:${issue.key}`} className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
      <p className="break-words font-medium"><span className={colors[issue.status]}>{labels[issue.status]}</span> · {issue.node} · {issue.title}</p>
      <p className="mt-1 break-words">{issue.detail}</p>
      {destination(issue.id, issue) && <a className="mt-2 inline-block underline" href={destination(issue.id, issue)!}>Open {issue.category === 'backup' ? 'backups' : issue.category === 'schedule' ? 'schedules' : 'console'}</a>}
    </li>)}</ul>}
    <details className="mt-3 text-sm"><summary className="cursor-pointer">All checks</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{runtimes.map(runtime => <div key={runtime.id} className="min-w-0 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        <p className="break-words font-medium">{runtime.name} · {runtime.version || 'Version unavailable'}{runtime.commit ? ` · ${runtime.commit.slice(0, 7)}` : ''}</p>
        <ul className="mt-2 space-y-2">{runtime.checks.map(check => <li key={check.key}><span className={colors[check.status]}>{labels[check.status]}</span> · {check.title}<p className="break-words text-gray-600 dark:text-gray-400">{check.detail}</p><time className="text-xs text-gray-500" dateTime={new Date(check.observedAt).toISOString()}>{new Date(check.observedAt).toLocaleString()}</time></li>)}</ul>
      </div>)}</div>
    </details>
  </section>;
}
