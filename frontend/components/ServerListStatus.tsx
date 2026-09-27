import type { ReactNode } from 'react';
import type { GameMonitoringSummary } from '../../backend/src/templates/types';
import { GameMonitoringStatus } from './GameMonitoringStatus';
import './serverListPresentation.css';

export function ServerListStatus({ summary, runtimeStatus, name, onHistory, disabled, fallback, players }: {
    summary?: GameMonitoringSummary; runtimeStatus: string; name: string;
    onHistory: () => void; disabled?: boolean; fallback: ReactNode; players?: ReactNode;
}) {
    if (runtimeStatus !== 'running' || !summary?.enabled) return <div>{fallback}{players}</div>;
    return <div><button type="button" className="gp-list-game-status" onClick={onHistory} disabled={disabled}
        title="Open history logs" aria-label={`Open history logs for ${name}`}>
        <GameMonitoringStatus summary={summary} runtimeStatus={runtimeStatus} hidePlayers={!!players} />
    </button>{players}</div>;
}
