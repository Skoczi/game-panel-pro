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
  addons: 'Install addons',
};
export function RehldsManager({
  serverId,
  canWrite,
  onOpen,
  onDirtyChange,
  group = 'all',
  children,
}: {
  group?: 'all' | 'configuration' | 'addons';
  children?: ReactNode;
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
  const [modules, setModules] = useState(['metamod', 'amxx']),
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
    if (section === 'files') {
      setLoading(false);
      return;
    }
    const request =
      section === 'addons'
        ? apiClient.previewRehldsAddons(serverId, modules)
        : apiClient.getRehldsContent(serverId, section);
    request
      .then((result) => {
        if (
          section !== 'addons' &&
          (!Array.isArray(result.available) || typeof result.content !== 'string')
        )
          throw new Error('Invalid configuration response');
        if (active) {
          if (section === 'addons') setPreview(result);
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
  }, [serverId, section, modules, revision]);
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    let active = true;
    const timer = setInterval(() => {
      apiClient
        .readBackupJob(serverId, job.id)
        .then((value) => {
          if (active) setJob(value);
        })
        .catch(() => {
          if (active) setError('Operation status unavailable; inspect Backups before retrying.');
        });
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [serverId, job?.id, job?.status]);
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
      <nav className="gp-workflow-nav" aria-label="ReHLDS sections">
        {Object.entries(sections)
          .filter(([key]) =>
            group === 'configuration'
              ? ['files', 'rotation', 'admins'].includes(key)
              : group === 'addons'
                ? ['plugins', 'addons'].includes(key)
                : key !== 'files'
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
      {section === 'files' && children}
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
            {dirty && <span className="gp-workflow-muted">Unsaved changes</span>}
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
            <AppButton disabled={busy} onClick={() => onOpen(snapshot.path, snapshot.root)}>
              File Manager
            </AppButton>
            <AppButton
              disabled={busy}
              onClick={() => {
                const action = () => setRevision((v) => v + 1);
                if (dirty) setConfirmation({ message: 'Discard this unsaved draft?', action });
                else action();
              }}
            >
              Reload
            </AppButton>
            {canWrite && (
              <AppButton
                tone="primary"
                disabled={!dirty || busy}
                onClick={() => (review ? void save() : setReview(true))}
              >
                {review ? 'Save with snapshot' : 'Review changes'}
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
          <p className="text-sm">
            Choose modules, stop the game, then review the installation. A verified backup is
            created before files change. Existing configuration is preserved. The game remains
            stopped.
          </p>
          {preview && (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                {preview.catalogue.map((module: any) => (
                  <label key={module.id} className="gp-workflow-card flex items-center gap-3">
                    <input
                      type="checkbox"
                      disabled={busy || job?.status === 'running'}
                      checked={modules.includes(module.id)}
                      onChange={(e) => {
                        setModules((values) =>
                          e.target.checked
                            ? [...values, module.id]
                            : values.filter((v) => v !== module.id)
                        );
                        setReview(false);
                      }}
                    />
                    {module.name} {module.version}
                  </label>
                ))}
              </div>
              <p className="text-sm">
                Recorded installed versions:{' '}
                {Object.entries(preview.installed)
                  .map(([id, version]) => `${id} ${version}`)
                  .join(', ') || 'No panel installation recorded'}
                .
              </p>
              <p className="text-sm">
                Including dependencies: {preview.modules.map((m: any) => m.name).join(', ')}.
              </p>
              {modules.includes('reunion') && (
                <p className="text-sm">
                  Reunion changes player authentication. Its generated identity salt is preserved on
                  subsequent updates.
                </p>
              )}
              {!preview.stopped && (
                <p className="text-amber-700">Stop the game from its console before installing.</p>
              )}
              <AppButton
                disabled={busy || job?.status === 'running'}
                onClick={() => setRevision((v) => v + 1)}
              >
                Refresh server state
              </AppButton>
              {review && (
                <div className="rounded border p-3">
                  <ul>
                    {preview.changes.map((change: string) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm">
                    Requires file write, backup create and backup restore permissions.
                  </p>
                </div>
              )}
              {canWrite && (
                <AppButton
                  tone="primary"
                  disabled={
                    loading ||
                    busy ||
                    !modules.length ||
                    !preview.stopped ||
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
                        preview.fingerprint
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
                  {review ? 'Create backup and install' : 'Review installation'}
                </AppButton>
              )}
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
          {job && (
            <p role="status" className="break-words">
              Installation: {job.status}. {job.error || job.result?.stdout}
            </p>
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
