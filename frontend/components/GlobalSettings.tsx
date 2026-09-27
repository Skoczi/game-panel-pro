import { AppOptionSelect } from '../src/ui/components/AppOptionSelect';
import { SignedWebhookSettings } from './SignedWebhookSettings';
import { NotificationSettings } from './NotificationSettings';
import { confirmDialog } from '../utils/confirmDialog';
import { useEffect, useState } from 'react';
import { Network, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { apiClient } from '../utils/api';
import {
  DEFAULT_APPEARANCE,
  type Allocation,
  type Assignment,
  type GlobalSettings as Settings,
} from '../types/globalSettings';
import { PanelBrand } from './PanelBrand';
import { nodesRequest } from '../utils/nodesApi';
import { AppSelect, AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalBody } from '../src/ui/components';
import type { LoginTheme } from '../types/globalSettings';
import './login-theme.css';

const blank: Allocation = { ip: '', alias: '', tcp: '', udp: '' };
const field =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-[#0f1723] dark:text-white';
const card =
  'rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#111827]';
const button =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800';

type NodeSettings = Pick<Settings, 'revision' | 'network'> & {
  assignments: Assignment[];
  pending: boolean;
};
export function GlobalSettings({
  nodeId,
  nodeName,
  onDirtyChange,
  managedAddresses,
  embedded = false,
}: { nodeId?: string; nodeName?: string; onDirtyChange?: (dirty: boolean) => void; managedAddresses?: { ip: string; status?: string; mac?: string }[] | null; embedded?: boolean } = {}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { if (notice !== 'Saved.') return; const timer = window.setTimeout(() => setNotice(''), 4000); return () => window.clearTimeout(timer); }, [notice]);
  const [draft, setDraft] = useState<Allocation>(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const closeAllocation = () => { setAllocationOpen(false); setEditing(null); setDraft(blank); };
  const [pending, setPending] = useState(false);
  const [savedAllocationIps, setSavedAllocationIps] = useState<string[]>([]);
  useEffect(() => {
    onDirtyChange?.(dirty || Object.values(draft).some(Boolean));
  }, [dirty, draft, onDirtyChange]);

  async function load() {
    setBusy(true);
    setError('');
    try {
      if (nodeId) {
        const value = await nodesRequest<NodeSettings>(`/api/nodes/${nodeId}/allocations`);
        setSettings({
          revision: value.revision,
          network: value.network,
          appearance: DEFAULT_APPEARANCE,
        });
        setAssignments(value.assignments);
        setSavedAllocationIps(value.network.allocations.map(a => a.ip));
        setPending(value.pending);
      } else {
        const { assignments: used, ...value } = await apiClient.getGlobalSettings();
        setSettings(value);
        setAssignments(used);
      }
      setDirty(false);
      setDraft(blank);
      setEditing(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Cannot load settings. Root administrator access is required.'
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  function update(value: Settings) {
    setSettings(value);
    setDirty(true);
    setNotice('');
  }
  async function uploadLogo(file?: File, target: 'logo' | 'favicon' = 'logo') {
    if (!file || !settings) return;
    if (!['image/png', 'image/jpeg', 'image/webp', ...(target === 'favicon' ? ['image/x-icon', 'image/vnd.microsoft.icon'] : [])].includes(file.type) || file.size > 256 * 1024) {
      setError(`Choose a PNG, JPEG, WebP${target === 'favicon' ? ' or ICO' : ''} image up to 256 KiB.`);
      return;
    }
    setBusy(true);
    try {
      const logo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setSettings((current) =>
        current ? { ...current, appearance: { ...current.appearance, [target]: logo } } : current
      );
      setDirty(true);
      setNotice('');
      setError('');
    } catch {
      setError('Cannot read this image.');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!settings) return;
    if (managedAddresses !== undefined && settings.network.allocations.some(a => !savedAllocationIps.includes(a.ip) && !managedAddresses?.some(e => e.ip === a.ip))) {
      setError('A new allocation no longer has a saved host address. Refresh Host addresses and review the list before saving.'); return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (nodeId) {
        const saved = await nodesRequest<NodeSettings>(
          `/api/nodes/${nodeId}/allocations`,
          { network: settings.network, revision: settings.revision },
          'PUT'
        );
        setSettings({ ...settings, revision: saved.revision, network: saved.network });
        setAssignments(saved.assignments);
        setSavedAllocationIps(saved.network.allocations.map(a => a.ip));
        setPending(saved.pending);
      } else setSettings(await apiClient.saveGlobalSettings(settings));
      setDirty(false);
      setNotice(embedded ? 'Saved.' : 'Settings saved. Changes are active.');
      if (!nodeId) window.dispatchEvent(new Event('panel-settings-changed'));
    } catch (reason) {
      const message = (reason as { response?: { data?: { error?: string } } }).response?.data
        ?.error;
      setError(
        message ||
          (reason instanceof Error
            ? reason.message
            : 'Cannot save settings. Your changes remain in the form.')
      );
      if (nodeId) {
        try {
          setPending(
            (await nodesRequest<NodeSettings>(`/api/nodes/${nodeId}/allocations`)).pending
          );
        } catch {
          setPending(true);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function retryPending() {
    if (!nodeId) return;
    setBusy(true);
    setError('');
    try {
      const saved = await nodesRequest<NodeSettings>(`/api/nodes/${nodeId}/allocations/retry`, {});
      setSettings({
        revision: saved.revision,
        network: saved.network,
        appearance: DEFAULT_APPEARANCE,
      });
      setAssignments(saved.assignments);
      setSavedAllocationIps(saved.network.allocations.map(a => a.ip));
      setPending(saved.pending);
      setDirty(false);
      setNotice('Pending save resolved. Current node settings loaded.');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Save is still unconfirmed. Reservations remain held.'
      );
    } finally {
      setBusy(false);
    }
  }

  function addAllocation(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    const row = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [key, value.trim()])
    ) as Allocation;
    const unchangedExisting = editing !== null && settings.network.allocations[editing]?.ip === row.ip;
    if (managedAddresses !== undefined && !unchangedExisting && !managedAddresses?.some(e => e.ip === row.ip)) {
      setError('Choose an address saved in Host addresses above. Save or import the IP there first.'); return;
    }
    if (
      settings.network.allocations.some((item, index) => item.ip === row.ip && index !== editing)
    ) {
      setError('This IP is already listed. Edit its ranges instead.');
      return;
    }
    const allocations = [...settings.network.allocations];
    if (editing === null) allocations.push(row);
    else allocations[editing] = row;
    update({ ...settings, network: { ...settings.network, allocations } });
    setDraft(blank);
    setEditing(null);
    setAllocationOpen(false);
    setError('');
  }

  return (
    <div className="space-y-6 text-gray-900 dark:text-gray-100">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="gp-page-title">
            {embedded ? 'Network & IPs' : nodeId ? `${nodeName || 'Node'} · Allocations` : 'Panel Settings'}
          </h1>

        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
          )}
          <button
            className={button}
            disabled={busy}
            onClick={async () => {
              if ((!dirty && !Object.values(draft).some(Boolean)) || await confirmDialog('Discard unsaved changes and reload?')) {
                setNotice('');
                void load();
              }
            }}
          >
            Reload
          </button>
          <button
            className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            disabled={busy || !dirty || pending}
            onClick={() => void save()}
          >
            <Save size={16} />
            {busy ? 'Working…' : 'Save changes'}
          </button>
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200"
        >
          {notice}
        </div>
      )}
      {pending && (
        <div className="rounded-xl border border-amber-400 p-4 text-sm">
          <p>Save not confirmed. IPs remain reserved; Retry checks the original request.</p>
          <button className={`${button} mt-3`} disabled={busy} onClick={() => void retryPending()}>
            Retry pending save
          </button>
        </div>
      )}
      {!settings && !error && <p>Loading settings…</p>}
      {!nodeId && settings && <><NotificationSettings /><SignedWebhookSettings /></>}
      {settings && (
        <fieldset disabled={busy} className="min-w-0 space-y-6">
          {!nodeId && (
            <>
              <section className={card}>
                <h2 className="text-lg font-semibold">Branding &amp; login page</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Visible before sign-in. Plain text only; no credentials.</p>
                <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-2">
                  <div className="min-w-0 space-y-4">
                    <div className="space-y-1">
                      <span className="block text-sm">Login page theme</span>
                      <AppSelect
                        className="gp-resources-select w-full"
                        controlLabel="Login page theme"
                        value={settings.appearance.loginTheme || 'light'}
                        onChange={(value) =>
                          update({
                            ...settings,
                            appearance: { ...settings.appearance, loginTheme: value as LoginTheme },
                          })
                        }
                        options={[
                          { value: 'light', label: 'Light' },
                          { value: 'dark', label: 'Dark' },
                          { value: 'system', label: 'System preference' },
                        ]}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Applies before sign-in only. The panel keeps each user's own theme.
                      </p>
                    </div>
                    {(['siteName', 'siteSubtitle', 'loginDescription', 'loginFooter'] as const).map(
                      (key) => (
                        <label className="block text-sm" key={key}>
                          {
                            {
                              siteName: 'Site name',
                              siteSubtitle: 'Subtitle (optional)',
                              loginDescription: 'Login description (optional)',
                              loginFooter: 'Login footer text',
                            }[key]
                          }
                          <input
                            className={`${field} mt-1`}
                            value={settings.appearance[key]}
                            maxLength={key === 'siteName' ? 80 : key === 'siteSubtitle' ? 120 : 240}
                            onChange={(event) =>
                              update({
                                ...settings,
                                appearance: { ...settings.appearance, [key]: event.target.value },
                              })
                            }
                          />
                        </label>
                      )
                    )}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={settings.appearance.showLoginFooter}
                        onChange={(event) =>
                          update({
                            ...settings,
                            appearance: {
                              ...settings.appearance,
                              showLoginFooter: event.target.checked,
                            },
                          })
                        }
                      />
                      Show login footer
                    </label>
                    <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                      <label className="block text-sm">Favicon HTTPS URL
                        <input type="url" className={`${field} mt-1`} maxLength={2048} placeholder="https://example.com/icon.png" value={settings.appearance.favicon?.startsWith('data:') ? '' : settings.appearance.favicon || ''} onChange={event => update({ ...settings, appearance: { ...settings.appearance, favicon: event.target.value } })} />
                      </label>
                      <label className="block text-sm">Upload favicon
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico" className="mt-2 block w-full text-sm" onChange={event => { void uploadLogo(event.target.files?.[0], 'favicon'); event.target.value = ''; }} />
                      </label>
                      <p className="text-xs text-gray-500">PNG, ICO, JPEG or WebP · up to 256 KiB</p>
                      {settings.appearance.favicon && <div className="flex items-center gap-3"><img src={settings.appearance.favicon} alt="Favicon preview" className="h-8 w-8 object-contain" /><button type="button" className={button} onClick={() => update({ ...settings, appearance: { ...settings.appearance, favicon: '' } })}>Reset favicon</button></div>}
                    </div>
                    <label className="block text-sm">
                      Logo HTTPS URL
                      <input
                        type="url"
                        placeholder="https://example.com/logo.png"
                        className={`${field} mt-1`}
                        maxLength={2048}
                        value={
                          settings.appearance.logo.startsWith('data:')
                            ? ''
                            : settings.appearance.logo
                        }
                        onChange={(event) =>
                          update({
                            ...settings,
                            appearance: { ...settings.appearance, logo: event.target.value },
                          })
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      Upload logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="mt-2 block w-full text-sm"
                        onChange={(event) => {
                          void uploadLogo(event.target.files?.[0]);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <p className="text-xs text-gray-500">PNG, JPEG or WebP · up to 256 KiB · login and sidebar logo</p>
                    {settings.appearance.logo && (
                      <button
                        type="button"
                        className={button}
                        onClick={() =>
                          update({ ...settings, appearance: { ...settings.appearance, logo: '' } })
                        }
                      >
                        Remove logo
                      </button>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="mb-2 text-sm font-medium">Login preview</p>
                    <div
                      className="gp-login-theme rounded-xl px-6 py-8"
                      data-testid="login-preview"
                      data-login-theme={settings.appearance.loginTheme || 'light'}
                    >
                      <PanelBrand appearance={settings.appearance} />
                      {settings.appearance.loginDescription && (
                        <p
                          className="mt-4 break-words text-center text-sm"
                          style={{ color: '#fff' }}
                        >
                          {settings.appearance.loginDescription}
                        </p>
                      )}
                      <div
                        className="gp-login-preview-card mt-6 space-y-3 rounded-xl p-5"
                        aria-hidden="true"
                      >
                        <div className="gp-login-preview-field h-9 rounded" />
                        <div className="gp-login-preview-field h-9 rounded" />
                        <div
                          className="rounded bg-blue-700 p-2 text-center text-sm"
                          style={{ color: '#fff' }}
                        >
                          Sign In
                        </div>
                      </div>
                      {settings.appearance.showLoginFooter && (
                        <p
                          className="mt-5 break-words text-center text-xs"
                          style={{ color: '#fff' }}
                        >
                          {settings.appearance.loginFooter}
                        </p>
                      )}
                    </div>

                  </div>
                </div>
              </section>
            </>
          )}
          {nodeId && (
            <>
              <section className="space-y-4">
                {!embedded && <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Network size={20} />
                    IP allocations
                  </h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    IPs must already exist on the host.
                  </p>
                </div>}
                <div className={card}>
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={settings.network.restrictPorts}
                      onChange={(event) =>
                        update({
                          ...settings,
                          network: { ...settings.network, restrictPorts: event.target.checked },
                        })
                      }
                    />
                    Restrict published ports to these allocations
                  </label>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Empty TCP or UDP ranges block that protocol.
                  </p>
                  {!settings.network.restrictPorts && (
                    <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">Port restrictions are off. Docker default bindings are allowed.</p>
                  )}
                  {settings.network.restrictPorts && settings.network.allocations.length === 0 && (
                    <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                      No allocations: publishing new ports will be denied.
                    </p>
                  )}
                </div>
                <div className="gp-allocation-grid grid min-w-0 gap-5">
                  <div className={`${card} min-w-0`}>
                    <div className="gp-network-table-heading"><h3 className="font-semibold">
                      Configured addresses{' '}
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        {new Set([...settings.network.allocations.map(row => row.ip), ...(managedAddresses || []).map(row => row.ip)]).size}
                      </span>
                    </h3><button className={button} onClick={() => setAllocationOpen(true)}><Plus size={16} /> {Object.values(draft).some(Boolean) ? 'Continue editing' : 'Add allocation'}</button></div>
                    <div className="overflow-x-auto">
                      <table className="gp-network-address-table w-full text-left text-sm" data-managed={managedAddresses !== undefined}>
                        <thead className="text-xs uppercase text-gray-500">
                          <tr>
                            {['IP / alias', ...(managedAddresses !== undefined ? ['MAC / status'] : []), 'TCP ports', 'UDP ports', 'Actions'].map(
                              (heading) => (
                                <th
                                  key={heading}
                                  className="border-b border-gray-200 px-2 py-3 dark:border-gray-700"
                                >
                                  {heading}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {settings.network.allocations.map((row, index) => (
                            <tr
                              key={row.ip}
                              className="border-b border-gray-100 dark:border-gray-800"
                            >
                              <td className="px-2 py-3">
                                <span className="whitespace-nowrap font-mono">{row.ip}</span>
                                <span className="block text-xs text-gray-500">
                                  {row.alias || ''}
                                </span>
                              </td>
                              {managedAddresses !== undefined && <td className="px-2 py-3"><code className="text-xs">{managedAddresses?.find(host => host.ip === row.ip)?.mac || '—'}</code><span className="block text-xs text-gray-500">{managedAddresses === null ? 'Unavailable' : managedAddresses?.find(host => host.ip === row.ip)?.status === 'active' ? 'Active' : 'Needs attention'}</span></td>}
                              <td className="max-w-48 break-words px-2 py-3 font-mono text-xs">
                                {row.tcp || 'None'}
                              </td>
                              <td className="max-w-48 break-words px-2 py-3 font-mono text-xs">
                                {row.udp || 'None'}
                              </td>
                              <td className="px-2 py-3">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    aria-label={`Edit ${row.ip}`}
                                    onClick={async () => {
                                      setEditing(index);
                                      setDraft({ ...row });
                                      setAllocationOpen(true);
                                    }}
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-30 dark:hover:bg-gray-700"
                                    aria-label={`Remove ${row.ip}`}
                                    disabled={assignments.some((used) => used.ip === row.ip)}
                                    title="Assigned IPs must be released by their servers first"
                                    onClick={async () => {
                                      update({
                                        ...settings,
                                        network: {
                                          ...settings.network,
                                          allocations: settings.network.allocations.filter(
                                            (_, i) => i !== index
                                          ),
                                        },
                                      });
                                      setEditing(null);
                                      setDraft(blank);
                                    }}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {managedAddresses?.filter(host => !settings.network.allocations.some(row => row.ip === host.ip)).map(host => <tr key={host.ip} className="border-b border-gray-100 dark:border-gray-800"><td className="px-2 py-3 font-mono">{host.ip}</td><td className="px-2 py-3"><code className="text-xs">{host.mac || '—'}</code><span className="block text-xs text-gray-500">{host.status === 'active' ? 'Active' : 'Needs attention'}</span></td><td colSpan={2} className="px-2 py-3 text-sm text-gray-500">No port ranges</td><td className="px-2 py-3"><button className={button} aria-label={`Configure ports for ${host.ip}`} onClick={() => { setEditing(null); setDraft({ ...blank, ip: host.ip }); setAllocationOpen(true); }}><Plus size={16} /></button></td></tr>)}
                        </tbody>
                      </table>
                    </div>
                    {!settings.network.allocations.length && !managedAddresses?.length && (
                      <p className="py-8 text-center text-sm text-gray-500">
                        No allocations.
                      </p>
                    )}
                  </div>
                  <AppModal open={allocationOpen} onOpenChange={setAllocationOpen} positionerStyle={{ justifyContent: 'flex-end', padding: 0 }}>
                  <AppModalContent className="gp-network-drawer"><AppModalHeader><AppModalTitle>{editing === null ? 'Add allocation' : 'Edit allocation'}</AppModalTitle></AppModalHeader><AppModalBody>
                  <form className="space-y-4" onSubmit={addAllocation}>
                    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
                    {(['ip', 'alias', 'tcp', 'udp'] as const).map((key) => (
                      <label key={key} className="block text-sm">
                        {
                          {
                            ip: 'IP address',
                            alias: 'Alias (optional)',
                            tcp: 'TCP ports',
                            udp: 'UDP ports',
                          }[key]
                        }
                        {key === 'ip' && managedAddresses !== undefined ? <AppOptionSelect aria-label="IP address" className="mt-1 w-full" value={draft.ip} required onChange={value => setDraft({ ...draft, ip: value })}>
                          <option value="">{managedAddresses === null ? 'Host address list unavailable' : 'Choose a saved IP address'}</option>
                          {managedAddresses?.filter(e => !settings.network.allocations.some((a, i) => a.ip === e.ip && i !== editing)).map(e => <option key={e.ip} value={e.ip}>{e.ip}{e.status === 'needs-attention' ? ' · Needs attention' : ''}</option>)}
                          {editing !== null && !managedAddresses?.some(e => e.ip === settings.network.allocations[editing].ip) && <option value={settings.network.allocations[editing].ip}>{settings.network.allocations[editing].ip} · Existing allocation</option>}
                        </AppOptionSelect> : <input
                          className={`${field} mt-1`}
                          value={draft[key]}
                          required={key === 'ip'}
                          maxLength={key === 'ip' ? 15 : key === 'alias' ? 80 : 1024}
                          placeholder={
                            key === 'ip'
                              ? '192.0.2.10'
                              : key === 'alias'
                                ? 'Game node'
                                : '27015-27030,28015'
                          }
                          onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                        />}
                      </label>
                    ))}
                    <p className="text-xs text-gray-500">
                      Ports 1025–65535 · e.g. 27015–27030,28015
                    </p>
                    <div className="flex gap-2">
                      <button className={`${button} flex items-center gap-2`} type="submit">
                        <Plus size={16} />
                        {editing === null ? 'Add to list' : 'Update entry'}
                      </button>
                        <button
                          className={button}
                          type="button"
                          onClick={async () => {
                            closeAllocation();
                          }}
                        >
                          Cancel
                        </button>
                    </div>
                  </form>
                  </AppModalBody></AppModalContent></AppModal>
                </div>
              </section>
              {assignments.length > 0 && <section className={card}>
                <h2 className="mb-4 text-lg font-semibold">Assigned ports</h2>
                <p className="mb-4 text-sm text-gray-500">
                  Includes stopped servers.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        {['IP', 'Protocol', 'Port', 'Server'].map((label) => (
                          <th
                            className="border-b border-gray-200 px-3 py-2 dark:border-gray-700"
                            key={label}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((used, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2 font-mono">{used.ip || 'Docker default'}</td>
                          <td className="px-3 py-2 uppercase">{used.protocol}</td>
                          <td className="px-3 py-2">{used.port}</td>
                          <td className="px-3 py-2">{used.serverName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>}
            </>
          )}
        </fieldset>
      )}
    </div>
  );
}
