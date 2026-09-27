import { useEffect, useId, useState } from 'react';
import { AppButton, AppInput, AppToggle, AppModal, AppModalBody, AppModalContent, AppModalHeader, AppModalTitle } from '../src/ui/components';
import { getStoredToken } from '../utils/api/runtime';
import './api-tokens.css';
import { ConfirmationModal } from './ConfirmationModal';

type Token = { id: string; name: string; scopes: string[]; serverIds: string[]; expiresAt: number; lastUsedAt: number | null; revokedAt: number | null };
type Server = { id: string; name: string; serverNumber?: number };
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, { method, cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${getStoredToken() || ''}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 204) return undefined as T;
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(typeof result.error === 'string' ? result.error : 'Request failed. Refresh before trying again.'), { status: response.status });
  return result;
}

export function ApiTokensModal({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [tokens, setTokens] = useState<Token[]>([]), [servers, setServers] = useState<Server[]>([]);
  const [name, setName] = useState(''), [days, setDays] = useState(30), [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [secret, setSecret] = useState(''), [revoke, setRevoke] = useState<Token | null>(null);
  const [copied, setCopied] = useState(false), [loaded, setLoaded] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [options, setOptions] = useState<{ administrator: boolean; nodes: { id: string; name: string }[]; templates: { id: string; name: string; version: number }[] }>({ administrator: false, nodes: [], templates: [] });
  const [provision, setProvision] = useState(false), [users, setUsers] = useState(false), [members, setMembers] = useState(false), [admins, setAdmins] = useState(false);
  const [nodeIds, setNodeIds] = useState<string[]>([]), [templateIds, setTemplateIds] = useState<string[]>([]);
  const [maxServers, setMaxServers] = useState(5), [maxCpu, setMaxCpu] = useState(2), [maxMemoryMb, setMaxMemoryMb] = useState(2048);
  const [power, setPower] = useState(false);
  const [readResources, setReadResources] = useState(false);
  const [readBackups, setReadBackups] = useState(false), [createBackups, setCreateBackups] = useState(false);
  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const [list, fleet, choices] = await Promise.all([request<{ tokens: Token[] }>('/api/api-tokens'), request<{ servers: Server[] }>('/api/fleet'), request<typeof options>('/api/api-tokens/options')]);
      setOptions(choices);
      setTokens(list.tokens); setServers(fleet.servers); setLoaded(true); setNeedsRefresh(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load API tokens.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const create = async () => {
    if (busy || needsRefresh) return;
    setBusy(true); setError(''); setCopied(false);
    try {
      const result = await request<{ token: Token; secret: string }>('/api/api-tokens', 'POST', {
        name, serverIds: selected, scopes: ['servers.read', ...(readResources ? ['resources.read'] : []),
          ...(readBackups ? ['backups.read'] : []), ...(createBackups ? ['backups.create'] : []), ...(power ? ['servers.power'] : []), ...(createBackups || power || provision ? ['operations.read'] : []), ...(provision ? ['servers.create', 'templates.read', 'nodes.read'] : []), ...(users ? ['users.read', 'users.create'] : []), ...(members ? ['members.read', 'members.write'] : []), ...(admins ? ['game-admins.read', 'game-admins.write'] : [])],
        ...(provision ? { provisioning: { nodeIds, templateIds, maxServers, maxCpu, maxMemoryMb } } : {}), expiresAt: Date.now() + days * 86400000,
      });
      setSecret(result.secret); setTokens(previous => [result.token, ...previous]); setName(''); setSelected([]);
    } catch (cause) {
      const status = (cause as { status?: number })?.status;
      if (status && status >= 400 && status < 500) setError(cause instanceof Error ? cause.message : 'Token request rejected.');
      else { setNeedsRefresh(true); setError('Token creation was not confirmed. Refresh the list and revoke any unwanted token before trying again.'); }
    }
    finally { setBusy(false); }
  };
  const revokeToken = async () => {
    if (!revoke || busy) return;
    setBusy(true); setError('');
    try {
      await request(`/api/api-tokens/${encodeURIComponent(revoke.id)}`, 'DELETE');
      setTokens(previous => previous.map(token => token.id === revoke.id ? { ...token, revokedAt: Date.now() } : token));
    } catch { setError('Revocation was not confirmed. Refresh the token list before trying again.'); }
    finally { setBusy(false); setRevoke(null); }
  };
  return <>
    <AppModal open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <AppModalContent className="gp-api-tokens w-[calc(100%-2rem)] max-w-2xl" dismissible={!busy}>
        <AppModalHeader><AppModalTitle>API tokens</AppModalTitle></AppModalHeader>
        <AppModalBody className="space-y-4 max-h-[75vh] overflow-y-auto">

          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          {secret ? <section aria-label="New token secret" className="space-y-3 rounded-xl border border-gray-300 dark:border-gray-600 p-4">
            <p>Copy and store this token securely. It is shown only once.</p>
            <label className="block" htmlFor={`${id}-secret`}>New API token</label>
            <AppInput id={`${id}-secret`} readOnly value={secret} autoComplete="off" />
            <div className="flex flex-wrap gap-2">
              <AppButton onClick={() => { void navigator.clipboard.writeText(secret).then(() => setCopied(true)).catch(() => setError('Copy unavailable. Select and copy the token field.')); }}>{copied ? 'Copied' : 'Copy token'}</AppButton>
              <AppButton tone="secondary" onClick={() => { setSecret(''); setCopied(false); }}>I have saved the token</AppButton>
            </div>
          </section> : <form className="space-y-3" onSubmit={event => { event.preventDefault(); void create(); }}>
            <div><label htmlFor={`${id}-name`}>Token name</label><AppInput id={`${id}-name`} value={name} maxLength={80} disabled={busy} onChange={event => setName(event.target.value)} placeholder="Monitoring dashboard" /></div>
            <div><label htmlFor={`${id}-days`}>Expires in days</label><AppInput id={`${id}-days`} type="number" min={1} max={365} value={days} disabled={busy} onChange={event => setDays(Number(event.target.value))} /></div>
            <AppToggle checked={power} disabled={busy} onChange={setPower} ariaLabel="Start, stop and restart servers" label="Start, stop and restart servers" />
            <AppToggle checked={readResources} disabled={busy} onChange={setReadResources} ariaLabel="Read resource measurements" label="Read resource measurements" />
            <AppToggle checked={readBackups} disabled={busy} onChange={setReadBackups} ariaLabel="Read backup lists" label="Read backup lists" />
            <AppToggle checked={createBackups} disabled={busy} onChange={setCreateBackups} ariaLabel="Create Native backups and read their status" label="Create Native backups and read their status" />
            <AppToggle checked={admins} disabled={busy} onChange={setAdmins} ariaLabel="Manage AMXX game admins" label="Manage AMXX game admins" />
            {options.administrator && <section className="space-y-3 rounded-xl border border-gray-700 p-4">
              <h3 className="font-medium">Administration</h3>
              <AppToggle checked={users} disabled={busy} onChange={setUsers} ariaLabel="Create panel users" label="Create panel users" />
              <AppToggle checked={members} disabled={busy} onChange={setMembers} ariaLabel="Manage server access" label="Manage server access" />
              <AppToggle checked={provision} disabled={busy} onChange={setProvision} ariaLabel="Install servers" label="Install servers" />
              {provision && <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset disabled={busy}><legend className="mb-2">Nodes</legend>{options.nodes.map(n => <label key={n.id} className="flex items-center gap-2 py-1"><input type="checkbox" checked={nodeIds.includes(n.id)} onChange={e => setNodeIds(v => e.target.checked ? [...v, n.id] : v.filter(id => id !== n.id))} />{n.name}</label>)}</fieldset>
                  <fieldset disabled={busy}><legend className="mb-2">Published templates</legend>{options.templates.filter((t, i, all) => all.findIndex(x => x.id === t.id) === i).map(t => <label key={t.id} className="flex items-center gap-2 py-1"><input type="checkbox" checked={templateIds.includes(t.id)} onChange={e => setTemplateIds(v => e.target.checked ? [...v, t.id] : v.filter(id => id !== t.id))} />{t.name}</label>)}</fieldset>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label>Creation budget<AppInput type="number" min={1} max={100} value={maxServers} disabled={busy} onChange={e => setMaxServers(Number(e.target.value))} /></label>
                  <label>Max vCPU / server<AppInput type="number" min={0.1} step={0.1} max={128} value={maxCpu} disabled={busy} onChange={e => setMaxCpu(Number(e.target.value))} /></label>
                  <label>Max MiB / server<AppInput type="number" min={128} max={1048576} value={maxMemoryMb} disabled={busy} onChange={e => setMaxMemoryMb(Number(e.target.value))} /></label>
                </div>
              </div>}
            </section>}
            <fieldset disabled={busy || loading} className="space-y-2"><legend className="mb-2">Allowed servers · read inventory</legend>
              <div className="max-h-40 overflow-y-auto space-y-2">{servers.map(server => <label key={server.id} className="flex items-center gap-2 break-all">
                <input type="checkbox" checked={selected.includes(server.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, server.id] : previous.filter(value => value !== server.id))} />
                <span>{server.name} <span className="text-xs text-gray-500">{server.id.slice(0, 8)}</span></span>
              </label>)}</div>
              {loaded && !servers.length && <p>No accessible servers.</p>}
            </fieldset>
            <AppButton type="submit" disabled={busy || loading || needsRefresh || !loaded || !name.trim() || (!selected.length && !provision && !users) || (provision && (!nodeIds.length || !templateIds.length || !Number.isInteger(maxServers) || maxServers < 1 || maxServers > 100 || maxCpu < 0.1 || maxCpu > 128 || !Number.isInteger(maxMemoryMb) || maxMemoryMb < 128 || maxMemoryMb > 1048576)) || !Number.isInteger(days) || days < 1 || days > 365}>{busy ? 'Creating…' : 'Create token'}</AppButton>
          </form>}
          <section aria-label="Your API tokens" className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex justify-between items-center"><h3 className="font-medium">Your tokens</h3><AppButton tone="secondary" disabled={loading || busy} onClick={() => void refresh()}>Refresh</AppButton></div>
            {loading && <p role="status">Loading tokens…</p>}
            {loaded && !tokens.length && <p>No API tokens yet.</p>}
            {tokens.map(token => <div key={token.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <div className="min-w-0 text-sm break-words"><p className="font-medium">{token.name}</p><p>{token.revokedAt ? 'Revoked' : token.expiresAt <= Date.now() ? 'Expired' : `Expires ${new Date(token.expiresAt).toLocaleString()}`}</p><p className="text-xs text-gray-500">{token.serverIds.length} server(s) · {token.scopes.join(', ')} · {token.lastUsedAt ? `Last used ${new Date(token.lastUsedAt).toLocaleString()}` : 'Never used'}</p></div>
              {!token.revokedAt && <AppButton tone="critical" disabled={busy} onClick={() => setRevoke(token)} aria-label={`Revoke ${token.name}`}>Revoke</AppButton>}
            </div>)}
          </section>
          <AppButton tone="secondary" disabled={busy} onClick={onClose}>Close</AppButton>
        </AppModalBody>
      </AppModalContent>
    </AppModal>
    {revoke && <ConfirmationModal isOpen onClose={() => { if (!busy) setRevoke(null); }} onConfirm={revokeToken} title="Revoke API token?" message={`Connections using “${revoke.name}” will lose access. This cannot be undone.`} confirmText="Revoke token" />}
  </>;
}
