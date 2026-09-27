import { AppOptionSelect } from '../../src/ui/components/AppOptionSelect';
import { useEffect, useRef, useState } from 'react';
import { apiClient, type BackupJob } from '../../utils/api';
import { openFleet } from '../../utils/nodeContext';
import { AppButton } from '../../src/ui/components';
type Ports = Record<
  'tcp' | 'udp',
  Array<{ host: number; container: number; hostIp?: string; label: string }>
>;
export function CloneManager({ fleetId, serverId }: { fleetId: string; serverId: number }) {
  const initializedSource = useRef('');
  const [preview, setPreview] = useState<any>(null),
    [ports, setPorts] = useState<Ports>({ tcp: [], udp: [] });
  const [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [revision, setRevision] = useState(0);
  const [targetNode, setTargetNode] = useState(''),
    [transfer, setTransfer] = useState<any>(null);
  const [job, setJob] = useState<BackupJob | null>(null);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    setReview(false);
    apiClient
      .previewClone(fleetId)
      .then((value) => {
        if (active) {
          setPreview(value);
          setTransfer(value.transfer || null);
          if (initializedSource.current !== fleetId) {
            setPorts(value.ports);
            setName(value.name.slice(0, 44) + ' clone');
            setTargetNode('');
            initializedSource.current = fleetId;
          }
        }
      })
      .catch((e) => {
        if (active)
          setError(e.response?.data?.error || 'Clone preview unavailable. Check agent support.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [fleetId, revision]);
  useEffect(() => {
    if (job?.status !== 'running') return;
    let active = true;
    const timer = setInterval(() => {
      apiClient
        .readBackupJob(serverId, job.id)
        .then((value) => {
          if (active) setJob(value);
        })
        .catch(() => {
          if (active) setError('Operation status unavailable. Inspect Backups before retrying.');
        });
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [serverId, job?.id, job?.status]);
  useEffect(() => {
    if (transfer?.status !== 'running') return;
    let active = true;
    const timer = setInterval(() => {
      apiClient
        .readTransfer(transfer.id)
        .then((value) => {
          if (active) setTransfer(value);
        })
        .catch(() => {
          if (active)
            setError('Transfer status unavailable. Inspect the destination before retrying.');
        });
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [transfer?.id, transfer?.status]);
  const locked = busy || job?.status === 'running' || transfer?.status === 'running';
  return (
    <section aria-label="Clone server" className="gp-workflow space-y-4">
      <header className="gp-workflow-intro">
        <h3>Clone or transfer your server</h3>
        <p>Includes files, configuration and credentials. Both servers remain stopped.</p>
      </header>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {busy && !preview && (
        <p role="status" className="gp-workflow-notice">
          Checking source and available destinations…
        </p>
      )}
      {preview && (
        <div className="gp-clone-layout">
          <div className="gp-clone-form">
            <section className="gp-workflow-card">
              <h4 className="gp-clone-step">
                <span>1</span>Destination and identity
              </h4>
              <label className="block">
                Destination node
                <AppOptionSelect
                  aria-label="Destination node"
                  className="block w-full"
                  disabled={locked}
                  value={targetNode}
                  onChange={(value) => {
                    setTargetNode(value);
                    setReview(false);
                  }}
                >
                  <option value="">This node (clone)</option>
                  {(preview.targets || []).map((node: any) => (
                    <option key={node.id} value={node.id}>
                      {node.name} · {node.location}
                    </option>
                  ))}
                </AppOptionSelect>
              </label>
              {targetNode && (
                <p className="gp-workflow-muted">Destination requires the same images and unused allocated ports. The source is retained.</p>
              )}

              <label className="block">
                Clone name
                <input
                  aria-label="Clone name"
                  className="block w-full rounded border bg-transparent p-2"
                  maxLength={50}
                  value={name}
                  disabled={locked}
                  onChange={(e) => {
                    setName(e.target.value);
                    setReview(false);
                  }}
                />
              </label>
            </section>
            <section className="gp-workflow-card">
              <h4 className="gp-clone-step">
                <span>2</span>Network ports
              </h4>
              <p className="gp-workflow-muted">
                Choose unused public ports on the destination host.
              </p>
              {(['tcp', 'udp'] as const).map((protocol) =>
                ports[protocol].map((port, index) => (
                  <div className="gp-clone-port" key={protocol + index}>
                    <span>
                      {protocol.toUpperCase()} · container {port.container}
                    </span>
                    <label>
                      Public IP
                      <input
                        aria-label={`${protocol} ${index} public IP`}
                        className="block max-w-full rounded border bg-transparent p-1"
                        value={port.hostIp || ''}
                        disabled={locked}
                        onChange={(e) => {
                          setPorts((value) => ({
                            ...value,
                            [protocol]: value[protocol].map((p, i) =>
                              i === index ? { ...p, hostIp: e.target.value } : p
                            ),
                          }));
                          setReview(false);
                        }}
                      />
                    </label>
                    <label>
                      Public port
                      <input
                        aria-label={`${protocol} ${index} public port`}
                        className="block w-28 rounded border bg-transparent p-1"
                        type="number"
                        min={1025}
                        max={65535}
                        value={port.host}
                        disabled={locked}
                        onChange={(e) => {
                          setPorts((value) => ({
                            ...value,
                            [protocol]: value[protocol].map((p, i) =>
                              i === index ? { ...p, host: Number(e.target.value) } : p
                            ),
                          }));
                          setReview(false);
                        }}
                      />
                    </label>
                  </div>
                ))
              )}
            </section>
            {review && (
              <div className="gp-workflow-card">
                <h4 className="gp-clone-step">
                  <span>3</span>Review your copy
                </h4>
                <p>Clone: {name}</p>
                <ul>
                  {preview.changes.map((item: string) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p>Check copied credentials and URLs before starting the clone.</p>
              </div>
            )}
            <div className="gp-workflow-actions">
              <AppButton disabled={locked} onClick={() => setRevision((v) => v + 1)}>
                Refresh clone preview
              </AppButton>
              <AppButton
                tone="primary"
                disabled={locked || !preview.stopped || name.trim().length < 3}
                onClick={async () => {
                  if (!review) {
                    setReview(true);
                    return;
                  }
                  setBusy(true);
                  setError('');
                  try {
                    const input = { name, ports, fingerprint: preview.fingerprint };
                    if (targetNode) {
                      const result = await apiClient.startTransfer(fleetId, {
                        ...input,
                        targetNode,
                      });
                      setTransfer(result.job);
                      setJob(null);
                    } else {
                      const result = await apiClient.startClone(fleetId, input);
                      setJob(result.job);
                      setTransfer(null);
                    }
                    setReview(false);
                  } catch (e: any) {
                    setError(
                      e.response?.data?.error ||
                        'Clone request failed. Inspect operations before retrying.'
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {review
                  ? targetNode
                    ? 'Create backup and transfer'
                    : 'Create backup and clone'
                  : 'Review clone'}
              </AppButton>
            </div>
          </div>
          <aside className="gp-workflow-card gp-clone-summary" aria-label="Clone summary">
            <h4>Operation summary</h4>
            <dl>
              <div>
                <dt>Source</dt>
                <dd>{preview.name}</dd>
              </div>
              <div>
                <dt>Destination</dt>
                <dd>
                  {targetNode
                    ? preview.targets?.find((node: any) => node.id === targetNode)?.name ||
                      targetNode
                    : 'Same host'}
                </dd>
              </div>
              <div>
                <dt>New server</dt>
                <dd>{name || 'Enter a name'}</dd>
              </div>
              <div>
                <dt>Source readiness</dt>
                <dd>
                  {preview.stopped ? 'Stopped · ready for backup' : 'Running · action required'}
                </dd>
              </div>
            </dl>
            {!preview.stopped && (
              <p className="gp-workflow-notice mt-4">
                Stop the source in its console, then refresh this preview.
              </p>
            )}

          </aside>
        </div>
      )}
      {transfer && (
        <div role="status" className="break-words">
          <p>
            Transfer: {transfer.status}. {transfer.stage}
          </p>
          {transfer.error && <p>{transfer.error}</p>}
          {transfer.targetId && (
            <p>Server ID: {transfer.targetId}</p>
          )}
          <AppButton onClick={() => openFleet()}>Open Game Servers</AppButton>
        </div>
      )}
      {job && (
        <p role="status" className="break-words">
          Clone: {job.status}. {job.error || job.result?.stdout}
        </p>
      )}
    </section>
  );
}
