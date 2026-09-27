import { useEffect, useState } from 'react';
import { HostNetwork, type HostNetworkState } from './HostNetwork';
import { GlobalSettings } from './GlobalSettings';
import './node-network.css';

export function NodeNetwork({ nodeId, nodeName, onDirtyChange }: { nodeId: string; nodeName: string; onDirtyChange: (dirty: boolean) => void }) {
  const [snapshot, setSnapshot] = useState<HostNetworkState | null>(null);
  const [hostDirty, setHostDirty] = useState(false), [portsDirty, setPortsDirty] = useState(false);
  useEffect(() => { onDirtyChange(hostDirty || portsDirty); }, [hostDirty, portsDirty, onDirtyChange]);
  return <div className="gp-node-network">
    <div className="gp-network-overview"><div><span className="gp-network-eyebrow">NETWORK WORKSPACE</span><h2>Addresses & port allocations</h2><p>Add an address once, then choose it when assigning game ports.</p></div><div className="gp-network-count"><strong>{snapshot?.available ? snapshot.entries.length : '—'}</strong><span>saved IP addresses</span></div></div>
    <div className="gp-network-section-label"><span>01</span><div><strong>Host addresses</strong><p>IP, virtual MAC and persistent startup</p></div></div>
    <HostNetwork nodeId={nodeId} onDirtyChange={setHostDirty} onSnapshot={setSnapshot} />
    <div className="gp-network-section-label"><span>02</span><div><strong>Game port allocations</strong><p>Choose a saved address and set its TCP / UDP ranges</p></div></div>
    <div className="gp-network-allocations"><GlobalSettings nodeId={nodeId} nodeName={nodeName} onDirtyChange={setPortsDirty} managedAddresses={snapshot?.available ? snapshot.entries : null} embedded /></div>
  </div>;
}
