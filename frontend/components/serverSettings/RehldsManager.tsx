import { RefreshCw } from 'lucide-react';
import { ConfirmationModal } from '../ConfirmationModal';
import { AdminEditor } from './AdminEditor';
import { PluginEditor } from './PluginEditor';
import { RotationEditor } from './RotationEditor';
import { useEffect, useState, type ReactNode } from 'react';
import { apiClient, type BackupJob, type FileHistoryEntry } from '../../utils/api';
import { AppButton } from '../../src/ui/components';
type Snapshot = {
  content: string;
  version: string;
  available: string[];
  path: string;
  root: string;
  history: FileHistoryEntry[];
};
const sections = {
  files: 'All files',
  rotation: 'Maps and rotation',
  admins: 'Administrators',
  plugins: 'AMXX plugins',
  mixqueue: 'MixQueue',
  addons: 'Install addons',
};
export function RehldsManager({
  serverId,
  canWrite,
  onOpen,
  onDirtyChange,
  group = 'all',
  children,
  mixqueue,
}: {
  group?: 'all' | 'configuration' | 'addons';
  children?: ReactNode;
  mixqueue?: ReactNode;
  serverId: number;
  canWrite: boolean;
  onOpen: (path: string, root: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [confirmation, setConfirmation] = useState<{ message: string; action: () => void } | null>(
    null
  );
  const [section, setSection] = useState<keyof typeof sections>(
    group === 'configuration' ? 'files' : group === 'addons' ? 'plugins' : 'rotation'
  );
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [draft, setDraft] = useState('');
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [revision, setRevision] = useState(0);
  const [addonAction, setAddonAction] = useState<'install' | 'uninstall'>('install');
  const [modules, setModules] = useState<string[]>([]),
    [preview, setPreview] = useState<any>(null),
    [job, setJob] = useState<BackupJob | null>(null);
  const dirty = Boolean(snapshot && draft !== snapshot.content);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSnapshot(null);
    setReview(false);
    if (section === 'files' || section === 'mixqueue') {
      setLoading(false);
      return;
    }
    const request =
      section === 'addons'
        ? apiClient.previewRehldsAddons(serverId, modules, addonAction)
        : apiClient.getRehldsContent(serverId, section);
    request
      .then((result) => {
        if (
          section !== 'addons' &&
          (!Array.isArray(result.available) || typeof result.content !== 'string')
        )
          throw new Error('Invalid configuration response');
        if (active) {
          if (section === 'addons') { setPreview(result); setReview(modules.length > 0); }
          else {
            setSnapshot(result);
            setDraft(result.content);
          }
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e.response?.data?.error ||
              'Could not load this section. Check agent support and installed addons.'
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [serverId, section, modules, revision, addonAction]);
  const [progressError, setProgressError] = useState('');
  useEffect(() => {
    if (!canWrite || (section !== 'addons' && job?.status !== 'running')) return;
    let active = true, pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const jobs = await apiClient.listAddonJobs(serverId);
        if (active) {
          setProgressError('');
          if (Array.isArray(jobs) && jobs[0]) setJob(current => {
            const latest = jobs[0];
            // Completed history belongs in Activity, not in a new page visit.
            if (latest.status === 'completed' && current?.id !== latest.id) return current;
            return !current || latest.startedAt >= current.startedAt ? latest : current;
          });
        }
      } catch { if (active) setProgressError('Connection lost. Retrying progress updates...'); }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => { active = false; clearInterval(timer); };
  }, [serverId, section, canWrite, job?.status]);
  useEffect(() => {
    if (job?.status === 'completed') { setModules([]); setRevision(value => value + 1); }
  }, [job?.id, job?.status]);
  useEffect(() => {
    if (job?.status !== 'completed') return;
    if (section !== 'addons') { setJob(null); return; }
    const completedId = job.id;
    const timer = setTimeout(() => setJob(current => current?.id === completedId && current.status === 'completed' ? null : current), 5000);
    return () => clearTimeout(timer);
  }, [job?.id, job?.status, section]);
  const save = async () => {
    if (!snapshot || section === 'files') return;
    setBusy(true);
    setError('');
    try {
      const result = await apiClient.saveRehldsContent(serverId, section, {
        content: draft,
        version: snapshot.version,
      });
      setMessage(result.warning || 'Saved. Reload the game configuration to apply.');
      setReview(false);
      setRevision((v) => v + 1);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Save failed. Your draft is preserved.');
    } finally {
      setBusy(false);
    }
  };
  const restore = async (entry: FileHistoryEntry) => {
    if (!snapshot || section === 'files') return;
    setBusy(true);
    setError('');
    try {
      const detail = await apiClient.fileHistoryEntry(
        serverId,
        snapshot.path,
        snapshot.root,
        entry.id
      );
      setDraft(detail.before);
      setReview(true);
    } catch {
      setError('Recovery snapshot unavailable.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="gp-workflow space-y-4" aria-label="ReHLDS tools">
      <div className="gp-addon-toolbar">
      <nav className="gp-workflow-nav" aria-label="ReHLDS sections">
        {Object.entries(sections)
          .filter(([key]) =>
            group === 'configuration'
              ? ['files', 'rotation', 'admins'].includes(key)
              : group === 'addons'
                ? ['plugins', 'addons', ...(mixqueue ? ['mixqueue'] : [])].includes(key)
                : key !== 'files' && (key !== 'mixqueue' || Boolean(mixqueue))
          )
          .map(([key, title]) => (
            <AppButton
              key={key}
              disabled={busy || job?.status === 'running'}
              aria-pressed={section === key}
              onClick={() => {
                if (section === key) return;
                const action = () => {
                  setMessage('');
                  setSection(key as keyof typeof sections);
                };
                if (dirty) setConfirmation({ message: 'Discard this unsaved draft?', action });
                else action();
              }}
            >
              {title}
            </AppButton>
          ))}
      </nav>
      {section === 'addons' && <AppButton tone="ghost" className="gp-addon-refresh" title="Refresh addons" aria-label="Refresh addons" disabled={loading || busy || job?.status === 'running'} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin' : ''} /></AppButton>}
      </div>
      {job && <section className="gp-workflow-card" aria-label="Addon installation progress">
        <div className="gp-addon-progress-heading"><strong>Addon operation</strong>{job.status !== 'completed' && <span>{job.status}</span>}</div>
        <p role="status">{job.error || (job.status === 'completed' ? (job.result?.stdout?.startsWith('Addon removed:') ? 'Addon removed.' : 'Installation completed.') : job.progress?.message) || (job.status === 'running' ? 'Preparing installation...' : job.result?.stdout || job.status)}</p>
        {job.status === 'running' && <div className="gp-addon-progress-meter"><progress aria-label="Current installation stage" max={100} value={job.progress?.percent ?? undefined} /><span>{job.progress?.percent == null ? 'In progress' : `${job.progress.percent}%`}</span></div>}
        {progressError && <p role="alert">{progressError}</p>}
      </section>}
      {section === 'files' && children}
      {section === 'mixqueue' && mixqueue}
      {loading && <p role="status">Loading ReHLDS tools…</p>}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {snapshot && (
        <>
          <header className="gp-workflow-intro">
            <h3>{sections[section]}</h3>
          </header>
          {section === 'rotation' && (
            <RotationEditor
              value={draft}
              available={snapshot.available}
              disabled={!canWrite || busy}
              onChange={(value) => {
                setDraft(value);
                setReview(false);
              }}
            />
          )}
          {section === 'plugins' && (
            <PluginEditor
              value={draft}
              available={snapshot.available}
              disabled={!canWrite || busy}
              onChange={(value) => {
                setDraft(value);
                setReview(false);
              }}
            />
          )}
          {section === 'admins' && (
            <AdminEditor
              value={draft}
              disabled={!canWrite || busy}
              onChange={(value) => {
                setDraft(value);
                setReview(false);
              }}
            />
          )}
          <details>
            <summary>Advanced text editor</summary>
            <p className="gp-workflow-muted break-all">{snapshot.path}</p>
            <label className="block">
              {sections[section]}
              <textarea
                aria-label="ReHLDS configuration"
                className="mt-2 min-h-64 w-full rounded border border-gray-400 bg-transparent p-3 font-mono text-sm"
                value={draft}
                disabled={!canWrite || busy}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setReview(false);
                }}
              />
            </label>
          </details>
          {review && (
            <details open>
              <summary>Review changes</summary>
              <div className="grid gap-3 md:grid-cols-2">
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border p-3">
                  {snapshot.content}
                </pre>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border p-3">
                  {draft}
                </pre>
              </div>
            </details>
          )}
          <div className="gp-workflow-actions gp-editor-actions">
            {dirty && <span className="gp-editor-dirty" role="status">Unsaved changes</span>}
            <AppButton disabled={busy} onClick={() => onOpen(snapshot.path, snapshot.root)}>
              File Manager
            </AppButton>
            {!dirty && <AppButton
              disabled={busy}
              onClick={() => {
                const action = () => setRevision((v) => v + 1);
                if (dirty) setConfirmation({ message: 'Discard this unsaved draft?', action });
                else action();
              }}
            >
              Reload
            </AppButton>}
            {dirty && <AppButton disabled={busy} onClick={() => setConfirmation({ message: 'Discard this unsaved draft?', action: () => { setDraft(snapshot.content); setReview(false); } })}>Discard</AppButton>}
            {canWrite && (
              <AppButton
                tone="primary"
                disabled={!dirty || busy}
                onClick={() => (review ? void save() : setReview(true))}
              >
                {review ? 'Save changes' : 'Review changes'}
              </AppButton>
            )}
          </div>
          {snapshot.history.length > 0 && (
            <details>
              <summary>Recovery snapshots</summary>
              <ul className="space-y-2">
                {snapshot.history.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-2">
                    <span>
                      {new Date(entry.createdAt).toLocaleString()} · {entry.actor}
                    </span>
                    <AppButton
                      disabled={!canWrite || busy}
                      onClick={() =>
                        setConfirmation({
                          message: 'Replace the draft with this previous version for review?',
                          action: () => void restore(entry),
                        })
                      }
                    >
                      Review previous version
                    </AppButton>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {section === 'addons' && (
        <>
          {preview && (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                {preview.catalogue.map((module: any) => (
                  <section key={module.id} className="gp-workflow-card gp-addon-card" aria-label={module.name}>
                    <span className="gp-addon-details">
                      <strong>{module.name}</strong>
                      {preview.installed[module.id] !== module.version && <span>{preview.installed[module.id] ? 'Available ' : 'v'}{module.version}</span>}
                      <span className={preview.installed[module.id] ? 'gp-addon-installed' : 'gp-addon-unrecorded'}>
                        {preview.installed[module.id] ? `Installed ${preview.installed[module.id]}` : 'Not installed'}
                      </span>
                    </span>
                    {canWrite && <div className="gp-addon-buttons">
                      <AppButton disabled={loading || busy || job?.status === 'running'} onClick={() => { setLoading(true); setAddonAction('install'); setModules([module.id]); }}>{preview.installed[module.id] ? 'Reinstall' : 'Install'}</AppButton>
                      {preview.installed[module.id] && ['metamod', 'amxx', 'reapi', 'reunion'].includes(module.id) && <AppButton disabled={loading || busy || job?.status === 'running'} onClick={() => { setLoading(true); setAddonAction('uninstall'); setModules([module.id]); }}>Uninstall</AppButton>}
                      {preview.installed[module.id] && ['rehlds', 'regamedll'].includes(module.id) && <span className="gp-workflow-muted">Rollback via Backups</span>}
                    </div>}
                  </section>
                ))}
              </div>
              {!preview.stopped && (
                <p className="text-amber-700">Stop the game before changing addons.</p>
              )}
              {modules.length > 0 && <div className="gp-workflow-actions">
              {review && modules.length > 0 && (
                <div className="gp-workflow-card gp-addon-review" role="region" aria-label="Review addon operation">
                  <h3>{addonAction === 'uninstall' ? 'Uninstall' : 'Install'} {preview.modules.map((m: any) => m.name).join(', ')}</h3>
                  {preview.blocked && <p role="alert">{preview.blocked}</p>}
                  <ul>
                    {preview.changes.map((change: string) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                  <p className="text-sm">{preview.modules.map((m: any) => m.name).join(', ')}</p>
                  {addonAction === 'install' && modules.includes('reunion') && <p className="text-sm">Reunion changes player authentication.</p>}
                </div>
              )}
              {canWrite && modules.length > 0 && review && (
                <AppButton
                  tone="primary"
                  disabled={
                    loading ||
                    busy ||
                    !modules.length ||
                    !preview.stopped ||
                    Boolean(preview.blocked) ||
                    job?.status === 'running'
                  }
                  onClick={async () => {
                    if (!review) {
                      setReview(true);
                      return;
                    }
                    setBusy(true);
                    setError('');
                    try {
                      const result = await apiClient.installRehldsAddons(
                        serverId,
                        modules,
                        preview.fingerprint,
                        addonAction
                      );
                      setJob(result.job);
                      setReview(false);
                    } catch (e: any) {
                      setError(e.response?.data?.error || 'Installation could not start');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {addonAction === 'uninstall' ? 'Back up and uninstall' : 'Back up and install'}
                </AppButton>
              )}
              {modules.length > 0 && <AppButton disabled={busy || job?.status === 'running'} onClick={() => { setModules([]); setReview(false); setAddonAction('install'); }}>Cancel</AppButton>}
              </div>}
              <details>
                <summary>Sources and checksums</summary>
                {preview.sources.map((source: any) => (
                  <p key={source.url} className="mt-2 break-all text-xs">
                    <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                      Official release package
                    </a>
                    <br />
                    SHA-256: {source.sha256}
                  </p>
                ))}
              </details>
            </>
          )}

        </>
      )}
      <ConfirmationModal
        isOpen={Boolean(confirmation)}
        title="Replace draft?"
        message={confirmation?.message || ''}
        confirmText="Continue"
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          confirmation?.action();
          setConfirmation(null);
        }}
      />
    </section>
  );
}
