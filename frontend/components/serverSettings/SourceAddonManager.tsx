import { useEffect, useRef, useState } from 'react';
import { Check, Download, FolderOpen, Package, RefreshCw, Trash2, X } from 'lucide-react';
import { apiClient, type BackupJob } from '../../utils/api';
import { AppButton } from '../../src/ui/components';
import { ConfirmationModal } from '../ConfirmationModal';
import './source-addons.css';

type Module = {
  id: string;
  name: string;
  version: string;
  installed: boolean;
  installedVersion: string | null;
  managed: boolean;
  requires: string[];
  conflicts?: string[];
  configurationFiles: string[];
  pluginsDirectory?: string;
};
type Preview = { catalogue: Module[]; modules: string[]; fingerprint: string; stopped: boolean };
export function SourceAddonManager({
  serverId,
  canWrite,
  onOpen,
  onOpenDirectory,
}: {
  serverId: number;
  canWrite: boolean;
  onOpen: (path: string, root: string) => void;
  onOpenDirectory?: (path: string, root: string) => void;
}) {
  const [data, setData] = useState<Preview>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<BackupJob | null>(null);
  const [review, setReview] = useState<{
    module: Module;
    action: 'install' | 'uninstall';
    preview: Preview;
  } | null>(null);
  const generation = useRef(0);
  const active = job?.status === 'running';
  useEffect(() => {
    const current = ++generation.current;
    setData(undefined);
    setError('');
    setJob(null);
    setReview(null);
    const refresh = async () => {
      try {
        const [preview, jobs] = await Promise.all([
          apiClient.sourceAddonPreview(serverId),
          apiClient.sourceAddonJobs(serverId),
        ]);
        if (generation.current !== current) return;
        setData(preview);
        setJob(
          (previous) =>
            jobs.jobs.find((j) => j.status === 'running') ||
            (previous?.status === 'running'
              ? jobs.jobs.find((j) => j.id === previous.id) || previous
              : previous)
        );
      } catch (e) {
        if (generation.current === current)
          setError(e instanceof Error ? e.message : 'Cannot load frameworks');
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      ++generation.current;
      clearInterval(timer);
    };
  }, [serverId]);
  useEffect(() => {
    if (!job || job.status === 'running' || job.status === 'failed' || job.status === 'interrupted')
      return;
    const timer = setTimeout(() => setJob(null), 8000);
    return () => clearTimeout(timer);
  }, [job]);
  const preview = async (module: Module, action: 'install' | 'uninstall') => {
    const current = generation.current;
    setBusy(true);
    setError('');
    try {
      const p = await apiClient.sourceAddonPreview(serverId, module.id, action);
      if (generation.current === current) setReview({ module, action, preview: p });
    } catch (e) {
      if (generation.current === current)
        setError(e instanceof Error ? e.message : 'Cannot preview changes');
    } finally {
      if (generation.current === current) setBusy(false);
    }
  };
  return (
    <section className="gp-source-addons" aria-label="Frameworks">
      <header>
        <div>
          <h3>Frameworks</h3>
          <span>{data?.catalogue.filter((m) => m.installed).length ?? 0} installed</span>
        </div>
        <AppButton
          tone="neutral"
          aria-label="Refresh frameworks"
          title="Refresh"
          disabled={busy || active}
          onClick={async () => {
            setError('');
            try {
              setData(await apiClient.sourceAddonPreview(serverId));
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Refresh failed');
            }
          }}
        >
          <RefreshCw size={16} />
        </AppButton>
      </header>
      {error && (
        <p role="alert" className="gp-source-error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading frameworks…</p>}
      {job && (
        <section className="gp-source-progress" role="status">
          <div>
            <strong>
              {active
                ? job.progress?.message || 'Preparing changes'
                : job.status === 'completed'
                  ? 'Changes applied'
                  : job.error || 'Operation failed'}
            </strong>
            {!active && (
              <AppButton tone="ghost" aria-label="Dismiss operation" onClick={() => setJob(null)}>
                <X size={16} />
              </AppButton>
            )}
          </div>
          {active && (
            <>
              <progress
                max={100}
                value={job.progress?.percent ?? undefined}
                aria-label={job.progress?.message || 'Operation progress'}
              />
              <span>
                {job.progress?.percent == null ? 'In progress' : `${job.progress.percent}%`}
              </span>
            </>
          )}
        </section>
      )}
      {data && !data.stopped && (
        <p className="gp-source-note">Stop the server to change frameworks.</p>
      )}
      <div className="gp-source-grid">
        {data?.catalogue.map((module) => (
          <article key={module.id} className="gp-source-card">
            <header>
              <span className="gp-source-icon">
                <Package size={21} />
              </span>
              <div>
                <h4>{module.name}</h4>
                <span>{module.version}</span>
              </div>
              <span className={`gp-source-state ${module.installed ? 'is-installed' : ''}`}>
                {module.installed ? (
                  <>
                    <Check size={13} />
                    Installed
                  </>
                ) : (
                  'Not installed'
                )}
              </span>
            </header>
            {module.installedVersion && (
              <div className="gp-source-version">
                Installed version <strong>{module.installedVersion}</strong>
              </div>
            )}
            {module.requires.length > 0 && (
              <div className="gp-source-requires">
                Requires{' '}
                {module.requires
                  .map((id) => data.catalogue.find((m) => m.id === id)?.name || id)
                  .join(', ')}
              </div>
            )}
            {data.catalogue.some((m) => m.installed && module.conflicts?.includes(m.id)) && (
              <div className="gp-source-note">
                Remove{' '}
                {data.catalogue
                  .filter((m) => m.installed && module.conflicts?.includes(m.id))
                  .map((m) => m.name)
                  .join(', ')}{' '}
                first.
              </div>
            )}
            {module.configurationFiles?.length > 0 && (
              <details className="gp-source-configs">
                <summary>Configuration files</summary>
                {module.configurationFiles.map((file) => (
                  <button key={file} onClick={() => onOpen(file, 'data')}>
                    {file.split('/').pop()}
                  </button>
                ))}
              </details>
            )}
            {module.installed && module.pluginsDirectory && onOpenDirectory && (
              <AppButton
                tone="ghost"
                className="gp-source-plugin-files"
                onClick={() => onOpenDirectory(module.pluginsDirectory!, 'data')}
              >
                <FolderOpen size={15} />
                {module.id === 'metamod' ? 'Framework files' : 'Plugin files'}
              </AppButton>
            )}
            <footer>
              <AppButton
                tone={module.installed ? 'neutral' : 'primary'}
                disabled={
                  !canWrite ||
                  busy ||
                  active ||
                  !data.stopped ||
                  data.catalogue.some((m) => m.installed && module.conflicts?.includes(m.id))
                }
                onClick={() => void preview(module, 'install')}
              >
                <Download size={15} />
                {!module.installed
                  ? 'Install'
                  : module.installedVersion && module.installedVersion !== module.version
                    ? 'Update'
                    : 'Reinstall'}
              </AppButton>
              {module.installed && module.managed && (
                <AppButton
                  tone="neutral"
                  disabled={
                    !canWrite ||
                    busy ||
                    active ||
                    !data.stopped ||
                    data.catalogue.some((m) => m.installed && m.requires.includes(module.id))
                  }
                  onClick={() => void preview(module, 'uninstall')}
                >
                  <Trash2 size={15} />
                  Uninstall
                </AppButton>
              )}
            </footer>
          </article>
        ))}
      </div>
      {review && (
        <ConfirmationModal
          isOpen
          title={`${review.action === 'uninstall' ? 'Uninstall' : 'Install'} ${review.module.name}`}
          message={`Backup → ${review.preview.modules.map((id) => data?.catalogue.find((m) => m.id === id)?.name || id).join(' + ')}. Existing configuration is preserved. The server stays stopped.`}
          confirmText={review.action === 'uninstall' ? 'Uninstall' : 'Install'}
          onClose={() => setReview(null)}
          onConfirm={async () => {
            const current = generation.current;
            const response = await apiClient.changeSourceAddon(
              serverId,
              review.module.id,
              review.preview.fingerprint,
              review.action
            );
            if (generation.current === current) {
              setJob(response.job);
              setReview(null);
            }
          }}
        />
      )}
    </section>
  );
}
