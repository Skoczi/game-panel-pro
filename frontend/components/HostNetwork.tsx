import { useEffect, useState } from 'react';
import { Network, Plus, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react';
import { nodesRequest } from '../utils/nodesApi';
import { AppButton } from '../src/ui/components';
import './host-network.css';

type Entry = { name: string; parent: string; ip: string; mac: string; status?: string; persistent?: boolean };
type State = { available: boolean; reason?: string; revision: number; parents: string[]; entries: Entry[]; discovered: Entry[]; autostart: boolean };
type Plan = { add: Entry[]; remove: Entry[]; keep: Entry[] };
const clean = ({ name, parent, ip, mac }: Entry) => ({ name, parent, ip, mac });
export function HostNetwork({ nodeId, onDirtyChange }: { nodeId: string; onDirtyChange: (dirty: boolean) => void }) {
  const endpoint = (nodeId === 'local' ? '' : `/api/nodes/${nodeId}/runtime`) + '/api/system/host-network';
  const [state, setState] = useState<State | null>(null), [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [plan, setPlan] = useState<Plan | null>(null);
  const [draft, setDraft] = useState({ ip: '', mac: '', parent: '' });
  const changed = Boolean(state && JSON.stringify(entries.map(clean)) !== JSON.stringify(state.entries.map(clean)));
  const dirty = changed || Boolean(draft.ip || draft.mac);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { let active = true; nodesRequest<State>(endpoint).then(value => { if (active) { setState(value); setEntries(value.entries); setDraft({ ip: '', mac: '', parent: value.parents[0] || '' }); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [endpoint]);
  async function refresh() {
    setBusy(true); setError(''); setPlan(null);
    try { const value = await nodesRequest<State>(endpoint); setState(value); setEntries(value.entries); setDraft({ ip: '', mac: '', parent: value.parents[0] || '' }); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  function add() {
    if (!draft.ip.trim() || !draft.mac.trim() || !draft.parent) return;
    let n = 1; const occupied = [...entries, ...(state?.discovered || [])]; while (occupied.some(e => e.name === `esip${n}`)) n++;
    setEntries([...entries, { name: `esip${n}`, parent: draft.parent, ip: draft.ip.trim(), mac: draft.mac.trim().toLowerCase() }]);
    setDraft({ ...draft, ip: '', mac: '' }); setPlan(null); setNotice('');
  }
  async function submit(preview: boolean) {
    setBusy(true); setError(''); setNotice('');
    try {
      const body = { revision: state!.revision, entries: entries.map(clean) };
      if (preview) setPlan(await nodesRequest<Plan>(endpoint + '/preview', body));
      else {
        const value = await nodesRequest<State>(endpoint, body, 'PUT'); setState(value); setEntries(value.entries); setPlan(null);
        setNotice('Saved on the machine. These addresses will be restored at boot before Docker and the panel start.');
      }
    } catch (e: any) { setError(e.message); setPlan(null); } finally { setBusy(false); }
  }
  return <section className="gp-host-network" aria-label="Additional IP interfaces">
    <header><div className="gp-host-network-title"><Network size={25} /><div><h2>Additional IP addresses</h2><p>Persistent macvlan interfaces on this machine.</p></div></div><AppButton disabled={busy || dirty} onClick={() => void refresh()}><RefreshCw size={16} /> Refresh</AppButton></header>
    {error && <p role="alert" className="gp-host-network-error">{error}</p>}
    {!state && !error && <p role="status">Loading host network…</p>}
    {state && !state.available && <p>{state.reason}</p>}
    {state?.available && <>
      <div className="gp-host-network-boot"><CheckCircle2 size={18} /><span>{state.autostart ? 'Autostart enabled · independent of the panel' : 'Autostart is not enabled — host administrator action required'}</span></div>
      <p className="gp-host-network-hint">Use the additional IPv4 and virtual MAC assigned by your provider. After saving an address, configure its permitted game ports in IP allocations.</p>
      <div className="gp-host-network-list">{entries.map(e => <article key={e.name}>
        <div><strong>{e.ip}</strong><span>{e.name} · {e.parent}</span></div><code>{e.mac}</code>
        <span className={`gp-host-network-status ${e.status === 'active' ? 'is-active' : ''}`}>{e.status === 'active' ? 'Active · saved for boot' : e.persistent ? 'Needs attention · saved for boot' : 'Pending save'}</span>
        <AppButton tone="ghost" aria-label={`Remove ${e.ip}`} disabled={busy} onClick={() => { setEntries(entries.filter(x => x.name !== e.name)); setPlan(null); setNotice(''); }}><Trash2 size={16} /></AppButton>
      </article>)}</div>
      {!entries.length && <p>No additional IPs are managed by the panel yet.</p>}
      {state.discovered.some(e => !entries.some(x => x.name === e.name)) && <div className="gp-host-network-import"><div><strong>Existing interfaces detected</strong><p>Import their current IP and MAC without disconnecting them. Changes are applied only after review.</p></div><AppButton disabled={busy} onClick={() => { setEntries([...entries, ...state.discovered.filter(e => !entries.some(x => x.name === e.name))]); setPlan(null); }}>Import existing interfaces</AppButton></div>}
      <form className="gp-host-network-form" onSubmit={e => { e.preventDefault(); add(); }}>
        <label>Additional IPv4<input value={draft.ip} placeholder="51.83.150.150" disabled={busy} onChange={e => setDraft({ ...draft, ip: e.target.value })} /></label>
        <label>Virtual MAC<input value={draft.mac} placeholder="02:00:00:00:00:00" disabled={busy} onChange={e => setDraft({ ...draft, mac: e.target.value })} /></label>
        <label>Parent interface<select value={draft.parent} disabled={busy} onChange={e => setDraft({ ...draft, parent: e.target.value })}>{state.parents.map(p => <option key={p}>{p}</option>)}</select></label>
        <AppButton type="submit" disabled={busy || !draft.ip || !draft.mac || !draft.parent}><Plus size={16} /> Add to changes</AppButton>
      </form>
      {plan && <div className="gp-host-network-preview" role="region" aria-label="Network changes preview"><h3>Review network changes</h3><p>Add or import: {plan.add.map(e => e.ip).join(', ') || 'none'}</p><p>Remove: {plan.remove.map(e => e.ip).join(', ') || 'none'}</p><p>Keep: {plan.keep.length} addresses. Configuration is saved locally and applied immediately.</p><AppButton tone="primary" disabled={busy} onClick={() => void submit(false)}>Save on machine</AppButton><AppButton disabled={busy} onClick={() => setPlan(null)}>Cancel review</AppButton></div>}
      {!plan && <AppButton tone="primary" disabled={busy || Boolean(draft.ip || draft.mac)} onClick={() => void submit(true)}>{changed ? 'Review changes' : 'Check and restore saved interfaces'}</AppButton>}
      {dirty && <AppButton disabled={busy} onClick={() => void refresh()}>Discard changes and reload</AppButton>}
      {notice && <p role="status">{notice}</p>}
    </>}
  </section>;
}
