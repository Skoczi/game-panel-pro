import { useEffect, useState } from 'react';
import { apiClient, type BackupJob } from '../../utils/api';
import { openFleet } from '../../utils/nodeContext';
import { AppButton } from '../../src/ui/components';
type Ports = Record<'tcp' | 'udp', Array<{ host: number; container: number; hostIp?: string; label: string }>>;
export function CloneManager({ fleetId, serverId }: { fleetId: string; serverId: number }) {
  const [preview, setPreview] = useState<any>(null), [ports, setPorts] = useState<Ports>({ tcp: [], udp: [] });
  const [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [review, setReview] = useState(false), [revision, setRevision] = useState(0);
  const [targetNode, setTargetNode] = useState(''), [transfer, setTransfer] = useState<any>(null);
  const [job, setJob] = useState<BackupJob | null>(null);
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setReview(false);
    apiClient.previewClone(fleetId).then(value => { if (active) { setPreview(value); setTransfer(value.transfer || null); setPorts(value.ports); setName(value.name.slice(0, 44) + ' clone'); } }).catch(e => { if (active) setError(e.response?.data?.error || 'Clone preview unavailable. Check agent support.'); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [fleetId, revision]);
  useEffect(() => {
    if (job?.status !== 'running') return;
    let active = true; const timer = setInterval(() => { apiClient.readBackupJob(serverId, job.id).then(value => { if (active) setJob(value); }).catch(() => { if (active) setError('Operation status unavailable. Inspect Backups before retrying.'); }); }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [serverId, job?.id, job?.status]);
  useEffect(() => {
    if (transfer?.status !== 'running') return;
    let active = true; const timer = setInterval(() => { apiClient.readTransfer(transfer.id).then(value => { if (active) setTransfer(value); }).catch(() => { if (active) setError('Transfer status unavailable. Inspect the destination before retrying.'); }); }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [transfer?.id, transfer?.status]);
  const locked = busy || job?.status === 'running' || transfer?.status === 'running';
  return <section aria-label="Clone server" className="space-y-4">
    <p>Copy from a verified offline backup to this node or another enrolled node. Choose a new name and unused public ports. Configuration and credentials are copied. Both servers remain stopped.</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {preview && <>
      <label className="block">Destination node<select aria-label="Destination node" className="block w-full rounded border bg-transparent p-2" disabled={locked} value={targetNode} onChange={e => { setTargetNode(e.target.value); setReview(false); }}><option value="">This node (clone)</option>{(preview.targets || []).map((node: any) => <option key={node.id} value={node.id}>{node.name} · {node.location}</option>)}</select></label>
      {targetNode && <p>The destination needs the same reviewed runtime and installer images. Choose an IP and unused ports allocated to that node. The source is retained for rollback; start the destination only after reviewing the result.</p>}
      {!preview.stopped && <p>Stop the source in its console, then refresh this preview.</p>}
      <label className="block">Clone name<input aria-label="Clone name" className="block w-full rounded border bg-transparent p-2" maxLength={50} value={name} disabled={locked} onChange={e => { setName(e.target.value); setReview(false); }} /></label>
      {(['tcp', 'udp'] as const).map(protocol => ports[protocol].map((port, index) => <div className="flex flex-wrap gap-2 rounded border p-2" key={protocol + index}>
        <span>{protocol.toUpperCase()} · container {port.container}</span>
        <label>Public IP<input aria-label={`${protocol} ${index} public IP`} className="block max-w-full rounded border bg-transparent p-1" value={port.hostIp || ''} disabled={locked} onChange={e => { setPorts(value => ({ ...value, [protocol]: value[protocol].map((p, i) => i === index ? { ...p, hostIp: e.target.value } : p) })); setReview(false); }} /></label>
        <label>Public port<input aria-label={`${protocol} ${index} public port`} className="block w-28 rounded border bg-transparent p-1" type="number" min={1025} max={65535} value={port.host} disabled={locked} onChange={e => { setPorts(value => ({ ...value, [protocol]: value[protocol].map((p, i) => i === index ? { ...p, host: Number(e.target.value) } : p) })); setReview(false); }} /></label>
      </div>))}
      {review && <div className="rounded border p-3"><p>Clone: {name}</p><ul>{preview.changes.map((item: string) => <li key={item}>{item}</li>)}</ul><p>After starting the clone, verify the game query, credentials and any URLs pointing to the source. Delete only the clone if you want to roll back.</p></div>}
      <div className="flex flex-wrap gap-2"><AppButton disabled={locked} onClick={() => setRevision(v => v + 1)}>Refresh clone preview</AppButton><AppButton disabled={locked || !preview.stopped || name.trim().length < 3} onClick={async () => {
        if (!review) { setReview(true); return; }
        setBusy(true); setError('');
        try { const input = { name, ports, fingerprint: preview.fingerprint }; if (targetNode) { const result = await apiClient.startTransfer(fleetId, { ...input, targetNode }); setTransfer(result.job); setJob(null); } else { const result = await apiClient.startClone(fleetId, input); setJob(result.job); setTransfer(null); } setReview(false); }
        catch (e: any) { setError(e.response?.data?.error || 'Clone request failed. Inspect operations before retrying.'); }
        finally { setBusy(false); }
      }}>{review ? (targetNode ? 'Create backup and transfer' : 'Create backup and clone') : 'Review clone'}</AppButton></div>
    </>}
    {transfer && <div role="status" className="break-words"><p>Transfer: {transfer.status}. {transfer.stage}</p>{transfer.error && <p>{transfer.error}</p>}{transfer.targetId && <p>Destination runtime: {transfer.targetId}. Both copies have separate identities.</p>}<AppButton onClick={() => openFleet()}>Open Game Servers</AppButton></div>}
    {job && <p role="status" className="break-words">Clone: {job.status}. {job.error || job.result?.stdout}</p>}
  </section>;
}
