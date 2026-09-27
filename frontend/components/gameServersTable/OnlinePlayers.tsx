import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, RefreshCw, Search, Users, X } from 'lucide-react';
import type { GamePlayersSnapshot } from '../../../backend/src/templates/types';
import type { GameServer } from '../../types/gameServer';
import { apiClient } from '../../utils/api';
import { fleetAllowed, fleetContext, fleetRequest } from '../../utils/fleetRuntime';
import { AppButton, AppInput, AppModal, AppModalBody, AppModalContent, AppModalHeader, AppModalTitle } from '../../src/ui/components';
import './onlinePlayers.css';

export function OnlinePlayers({ server, canRead }: { server: GameServer; canRead: boolean }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  const summary = server.monitoring;
  if (!summary?.enabled) return null;
  const fresh = summary.state === 'online' && summary.checkedAt && now - Date.parse(summary.checkedAt) <= summary.staleAfterSeconds * 1000;
  const info = server.status === 'running' && fresh ? summary.info : null;
  const label = info ? `${info.players} / ${info.maxPlayers}` : '—';
  const available = !!info && canRead;
  return <>
    <div className="gp-online-players">
      {available ? <button type="button" className="gp-players-count" onClick={(event) => { event.stopPropagation(); setOpen(true); }}
        aria-label={`Online players for ${server.name}: ${label}`} aria-haspopup="dialog" title="View online players">
        <Users size={14} aria-hidden="true" /><span>{label}</span>
      </button> : <span className="gp-players-count gp-players-count-static" title={info ? 'Online players' : 'Player count unavailable'}>
        <Users size={14} aria-hidden="true" /><span>{label}</span>
      </span>}
    </div>
    {open && available && createPortal(<PlayersDialog key={server.id} server={server} onClose={() => setOpen(false)} />, document.body)}
  </>;
}

function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function PlayersDialog({ server, onClose }: { server: GameServer; onClose: () => void }) {
  const [data, setData] = useState<GamePlayersSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let disposed = false, pending = false;
    async function refresh() {
      if (document.hidden || pending) return;
      pending = true; setBusy(true);
      try {
        let result: GamePlayersSnapshot;
        if (/^\d+$/.test(server.id)) result = await apiClient.getServerPlayers(Number(server.id));
        else {
          const context = await fleetContext(server.id);
          if (!fleetAllowed(context, 'server.players.read')) throw new Error('Player list access is no longer available.');
          result = await fleetRequest<GamePlayersSnapshot>(context, '/players');
        }
        if (!disposed) { setData(result); setError(''); }
      } catch {
        if (!disposed) { setData(null); setError('Player list unavailable.'); }
      } finally { pending = false; if (!disposed) setBusy(false); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [server.id, revision]);
  const players = data?.state === 'online' ? data.players || [] : [];
  const filtered = players.filter(p => p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const message = error || (data?.state === 'stopped' ? 'Server stopped.' : data?.state === 'unsupported' ? 'Player queries are not enabled for this server.' : data?.state === 'unavailable' ? 'The game did not return a player list.' : players.length === 0 ? (server.monitoring?.info?.players ? 'The game did not return player names.' : 'No players online.') : filtered.length === 0 ? 'No matching players.' : '');
  return <AppModal open backdropStyle={{ zIndex: 1400 }} positionerStyle={{ zIndex: 1401 }} onOpenChange={(value) => { if (!value) onClose(); }}>
    <AppModalContent className="gp-players-modal" dismissible={false}>
      <AppModalHeader>
        <div className="gp-players-heading"><span className="gp-players-heading-icon"><Users size={22} /></span><div><AppModalTitle>Online players</AppModalTitle><p>{server.name}</p></div></div>
        <AppButton tone="ghost" className="gp-players-icon-button" aria-label="Close online players" onClick={onClose}><X size={20} /></AppButton>
      </AppModalHeader>
      <AppModalBody>
        <div className="gp-players-tools"><label><Search size={16} aria-hidden="true" /><AppInput aria-label="Search players" placeholder="Search players…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <AppButton tone="ghost" className="gp-players-icon-button" aria-label="Refresh players" disabled={busy} onClick={() => setRevision(value => value + 1)}><RefreshCw size={17} className={busy ? 'animate-spin' : ''} /></AppButton>
        </div>
        {busy && !data && !error ? <div className="gp-players-empty" role="status">Loading players…</div> : message ? <div className="gp-players-empty" role="status"><Users size={28} aria-hidden="true" />{message}</div> : <div className="gp-players-table-wrap"><table className="gp-players-table"><thead><tr><th>Player</th><th>Score</th><th>Connected</th></tr></thead><tbody>
          {filtered.map((player, index) => <tr key={`${index}:${player.name}`}><td><span className="gp-player-avatar" aria-hidden="true">{player.name.slice(0, 1).toUpperCase()}</span><span>{player.name}</span></td><td>{player.score}</td><td>{duration(player.connectedSeconds)}</td></tr>)}
        </tbody></table></div>}
        <div className="gp-players-footer"><span>{data?.state === 'online' ? `${players.length} returned` : 'Live query'}</span>{data && <span><Clock3 size={12} aria-hidden="true" />{new Date(data.checkedAt).toLocaleTimeString()}</span>}</div>
      </AppModalBody>
    </AppModalContent>
  </AppModal>;
}
