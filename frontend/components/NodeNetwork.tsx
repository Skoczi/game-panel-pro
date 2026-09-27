import { useEffect, useState } from 'react';
import { HostNetwork, type HostNetworkState } from './HostNetwork';
import { GlobalSettings } from './GlobalSettings';
import './node-network.css';

export function NodeNetwork({ nodeId, nodeName, onDirtyChange }: { nodeId: string; nodeName: string; onDirtyChange: (dirty: boolean) => void }) {
  const [snapshot, setSnapshot] = useState<HostNetworkState | null>(null);
  const [hostDirty, setHostDirty] = useState(false), [portsDirty, setPortsDirty] = useState(false);
  useEffect(() => { onDirtyChange(hostDirty || portsDirty); }, [hostDirty, portsDirty, onDirtyChange]);
  return <div className="gp-node-network">
    <div className="gp-network-allocations"><GlobalSettings nodeId={nodeId} nodeName={nodeName} onDirtyChange={setPortsDirty} managedAddresses={snapshot?.available ? snapshot.entries : null} embedded /></div>
    <details className="gp-network-host-settings"><summary>Host interfaces {hostDirty && <span>· Unsaved changes</span>}</summary><HostNetwork nodeId={nodeId} onDirtyChange={setHostDirty} onSnapshot={setSnapshot} /></details>
  </div>;
}
