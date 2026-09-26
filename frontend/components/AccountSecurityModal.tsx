import { useEffect, useState } from 'react';
import { AppButton, AppModal, AppModalBody, AppModalContent, AppModalHeader, AppModalTitle } from '../src/ui/components';
import { apiClient } from '../utils/api';
import { getStoredToken } from '../utils/api/runtime';
import { ConfirmationModal } from './ConfirmationModal';
type Session = { id: string; label: string; createdAt: number; expiresAt: number; current: boolean };
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/auth/' + path, { method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${getStoredToken() || ''}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Security request failed');
  return result;
}
export function AccountSecurityModal({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<Session[]>([]), [enabled, setEnabled] = useState<boolean | null>(null);
  const [password, setPassword] = useState(''), [code, setCode] = useState(''), [secret, setSecret] = useState('');
  const [codes, setCodes] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [revoke, setRevoke] = useState<Session | null>(null), [disable, setDisable] = useState(false);
  const refresh = async () => {
    const [security, list] = await Promise.all([request<{ mfaEnabled: boolean }>('security'), request<{ sessions: Session[] }>('sessions')]);
    setEnabled(security.mfaEnabled); setSessions(list.sessions);
  };
  useEffect(() => { void refresh().catch(error => setError(error.message)); }, []);
  const change = async (action: 'begin' | 'confirm' | 'disable') => {
    setBusy(true); setError('');
    try {
      const result = await request<{ secret?: string; token?: string; recoveryCodes?: string[] }>('security/' + action, 'POST', { password, code });
      if (result.secret) setSecret(result.secret);
      if (result.token) apiClient.setAuthToken(result.token);
      if (action !== 'begin') { setSecret(''); setCode(''); setPassword(''); setCodes(result.recoveryCodes || []); await refresh(); }
    } catch (error) { setError(error instanceof Error ? error.message : 'Request failed. Refresh before retrying.'); }
    finally { setBusy(false); setDisable(false); }
  };
  return <>
    <AppModal open onOpenChange={open => { if (!open && !busy && !codes.length) onClose(); }}>
      <AppModalContent className="w-[calc(100%-2rem)] max-w-2xl" dismissible={!busy && !codes.length}>
        <AppModalHeader className="p-4"><AppModalTitle>Account security</AppModalTitle></AppModalHeader>
        <AppModalBody className="space-y-5 px-4 pb-4 max-h-[75vh] overflow-y-auto">
          {error && <p role="alert" className="text-red-500">{error}</p>}
          <section className="space-y-3 rounded-xl border border-gray-400/30 p-4">
            <h3 className="font-semibold">Two-factor authentication</h3>
            <p>{enabled === null ? 'Loading…' : enabled ? 'Enabled · authenticator or single-use recovery code required at sign-in.' : 'Not enabled. Protect your account with an authenticator app.'}</p>
            {enabled !== null && <>
              <label className="block text-sm">Current password<input className="block w-full rounded border border-gray-400/40 bg-transparent p-2 mt-1" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
              {secret && <div className="space-y-2 rounded border border-gray-400/40 p-3">
                <p>Add a time-based account in your authenticator: 6 digits, SHA-1, 30 seconds.</p>
                <p>Account: {location.hostname}</p><code className="block break-all select-all">{secret}</code>
                <p>This setup key is shown only during setup. Confirm a generated code to enable protection.</p>
              </div>}
              {(secret || enabled) && <label className="block text-sm">Authenticator or recovery code<input className="block w-full rounded border border-gray-400/40 bg-transparent p-2 mt-1" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} /></label>}
              {!enabled && <AppButton disabled={busy || !password || Boolean(secret && !code)} onClick={() => void change(secret ? 'confirm' : 'begin')}>{secret ? 'Confirm authenticator' : 'Set up authenticator'}</AppButton>}
              {enabled && <AppButton disabled={busy || !password || !code} onClick={() => setDisable(true)}>Disable two-factor authentication</AppButton>}
            </>}
            {codes.length > 0 && <div role="status" className="space-y-2 rounded border border-amber-500 p-3">
              <h4 className="font-semibold">Save your recovery codes now</h4><p>Each code works once. Store them privately outside this device. They cannot be shown again.</p>
              <pre className="text-xs whitespace-pre-wrap break-all select-all">{codes.join('\n')}</pre>
              <AppButton onClick={() => setCodes([])}>I saved these codes</AppButton>
            </div>}
          </section>
          <section className="space-y-3">
            <h3 className="font-semibold">Active sessions</h3><p className="text-sm">Sessions expire after 12 hours. Revoking a session also ends its live connections within a few seconds.</p>
            {sessions.map(session => <article key={session.id} className="rounded-xl border border-gray-400/30 p-3 space-y-2">
              <p className="text-sm break-all">{session.label} {session.current && <strong>· This session</strong>}</p>
              <p className="text-xs">Created {new Date(session.createdAt).toLocaleString()} · Expires {new Date(session.expiresAt).toLocaleString()}</p>
              <AppButton disabled={busy} onClick={() => setRevoke(session)}>Revoke session</AppButton>
            </article>)}
            <AppButton disabled={busy} onClick={() => void refresh().catch(error => setError(error.message))}>Refresh sessions</AppButton>
          </section>
        </AppModalBody>
      </AppModalContent>
    </AppModal>
    <ConfirmationModal isOpen={Boolean(revoke)} onClose={() => setRevoke(null)} title="Revoke session?" message="This device will need to sign in again." confirmText="Revoke"
      onConfirm={async () => { if (!revoke) return; await request('sessions/' + encodeURIComponent(revoke.id), 'DELETE'); if (revoke.current) { apiClient.clearAuth(); location.reload(); } else await refresh(); }} />
    <ConfirmationModal isOpen={disable} onClose={() => setDisable(false)} title="Disable two-factor authentication?" message="Future sign-ins will only require your password. Other sessions will be revoked." confirmText="Disable" onConfirm={() => change('disable')} />
  </>;
}
