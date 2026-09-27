import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, FolderLock, RefreshCw } from 'lucide-react';
import { apiClient } from '../../utils/api';
import { AppButton, AppToggle } from '../../src/ui/components';
import { ConfirmationModal } from '../ConfirmationModal';
import './sftp-access.css';

export type SftpStatus = { available: boolean; enabled: boolean; host: string | null; port: number | null; username: string | null; directory: string | null; fingerprint: string | null; reason?: string; password?: string };
export function SftpAccessCard({ serverId, canManage }: { serverId: number; canManage: boolean }) {
  const [data, setData] = useState<SftpStatus | null>(null), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [visible, setVisible] = useState(false), [confirm, setConfirm] = useState<'disable' | 'rotate' | null>(null);
  useEffect(() => {
    let active = true; setData(null); setPassword(''); setError(''); setNotice(''); setVisible(false);
    apiClient.getServerSftp(serverId).then(state => { if (active) setData(state); }).catch(() => { if (active) setError('Could not load SFTP access. Retry to check its current state.'); });
    return () => { active = false; };
  }, [serverId]);
  async function refresh() {
    setBusy(true); setError('');
    try { setData(await apiClient.getServerSftp(serverId)); }
    catch { setError('Could not load SFTP access. Please retry.'); }
    finally { setBusy(false); }
  }
  async function change(action: 'enable' | 'disable' | 'rotate') {
    if (!canManage || busy) return;
    setBusy(true); setError(''); setNotice(''); setPassword(''); setVisible(false);
    try {
      const result = await apiClient.updateServerSftp(serverId, action);
      const { password: issued, ...state } = result; setData(state); setPassword(issued || '');
      setNotice(action === 'disable' ? 'SFTP disabled. Active sessions have been disconnected.' : issued ? 'Copy this password now. It will not be shown again after you leave this page.' : 'SFTP is enabled. Generate a new password if the previous response was interrupted.');
    } catch (e: any) {
      setError(e.response?.data?.error || 'The result is unknown. Refresh status before retrying.');
      try { setData(await apiClient.getServerSftp(serverId)); } catch { setData(null); }
    } finally { setBusy(false); setConfirm(null); }
  }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); }
    catch { setError('Clipboard unavailable. Select and copy the value manually.'); }
  }
  const field = (label: string, value: string) => <div className="gp-sftp-field"><span>{label}</span><div><code>{value}</code><AppButton tone="ghost" aria-label={`Copy ${label}`} onClick={() => void copy(value, label)}><Copy size={16} /></AppButton></div></div>;
  return <section className="gp-settings-card gp-sftp" aria-label="SFTP access">
    <header><div className="gp-sftp-title"><FolderLock size={23} /><div><h4>SFTP access</h4><p>Connect your file client directly to this server’s game files.</p></div></div>
      <div className="gp-sftp-actions"><AppButton tone="ghost" aria-label="Refresh SFTP status" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} /></AppButton>
      <AppToggle ariaLabel="Enable SFTP access" checked={Boolean(data?.enabled)} disabled={busy || (!data?.available && !data?.enabled) || !canManage} onChange={enabled => enabled ? void change('enable') : setConfirm('disable')} /></div></header>
    {error && <p role="alert" className="gp-sftp-error">{error}</p>}
    {!data && !error && <p role="status">Loading SFTP access…</p>}
    {data && !data.available && <p>{data.reason}</p>}
    {data?.available && !data.enabled && <p>SFTP is off. Enable it to generate a separate login and password. No SSH shell access is granted.</p>}
    {data?.available && data.enabled && <>
      <div className="gp-sftp-grid">{field('Address', data.host || '')}{field('Port', String(data.port))}{field('Login', data.username || '')}
        <div className="gp-sftp-field"><span>Password</span><div>{password ? <><input aria-label="SFTP password" autoComplete="off" readOnly type={visible ? 'text' : 'password'} value={password} /><AppButton tone="ghost" aria-label={visible ? 'Hide SFTP password' : 'Show SFTP password'} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</AppButton><AppButton tone="ghost" aria-label="Copy Password" onClick={() => void copy(password, 'Password')}><Copy size={16} /></AppButton></> : <span>Saved securely · generate a new password if needed</span>}</div></div>
      </div>
      <div className="gp-sftp-footer"><span>Game files only · no shell · private backups excluded</span>{canManage && <AppButton disabled={busy} onClick={() => setConfirm('rotate')}>Generate new password</AppButton>}</div>
      {data.fingerprint && <details><summary>SSH host fingerprint</summary><code>{data.fingerprint}</code></details>}
      <p className="gp-sftp-note">This is a separate, shared server credential. Rotate it when someone should no longer have access. Panel logout does not disconnect SFTP.</p>
    </>}
    {notice && <p role="status">{notice}</p>}
    {!canManage && data?.available && <p>Ask an administrator with SFTP management permission to enable access or issue a new password.</p>}
    {confirm && <ConfirmationModal isOpen title={confirm === 'disable' ? 'Disable SFTP access?' : 'Generate a new SFTP password?'} message="Active SFTP sessions will be disconnected. The current password will stop working." confirmText={confirm === 'disable' ? 'Disable SFTP' : 'Generate password'} onConfirm={() => change(confirm)} onClose={() => { if (!busy) setConfirm(null); }} />}
  </section>;
}
