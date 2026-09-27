import { Plus } from 'lucide-react';
import type { GameServer } from '../../types/gameServer';
import { AppButton } from '../../src/ui/components';
import { GameServerCard, type GameServerCardActions } from './GameServerCard';

interface GameServersMobileListProps extends GameServerCardActions {
  filteredAndSortedServers: GameServer[];
  canOpenInstallModal: boolean;
  canInstall: boolean;
  onOpenInstallModal?: () => void;
}

export function GameServersMobileList({
  filteredAndSortedServers,
  canOpenInstallModal,
  canInstall,
  onOpenInstallModal,
  ...cardActions
}: GameServersMobileListProps) {
  return (
    <div className="gp-game-servers-mobile lg:hidden space-y-3" role="list">
      {filteredAndSortedServers.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 p-6 text-center">
          <p className="text-sm text-gray-400">No game servers yet.</p>

        </div>
      )}
      {filteredAndSortedServers.map((server) => (
        <GameServerCard key={server.id} server={server} {...cardActions} />
      ))}

      <div className={`bg-[#1f2937] rounded-lg p-4 border ${cardActions.rowBorder}`}>
        <div className="flex justify-center">
          <AppButton
            type="button"
            onClick={() => {
              if (!canOpenInstallModal) return;
              onOpenInstallModal?.();
            }}
            disabled={!canOpenInstallModal}
            className={`group inline-flex min-w-[240px] items-center justify-center gap-2 rounded-md border-2 px-6 py-2 font-semibold transition-all ${
              canOpenInstallModal
                ? 'border-[var(--color-cyan-400)]/45 bg-[#0050D7]/10 text-[var(--color-cyan-400)] hover:bg-[#157EEA]/20 hover:border-[var(--color-cyan-400)] hover:text-white'
                : 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
            }`}
            title={canInstall ? 'Install game server' : 'Missing permission: server.install'}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center text-[var(--color-cyan-400)] group-hover:text-white transition-colors">
              <Plus className="h-5 w-5 stroke-[3]" />
            </span>
            <span>Add Game Server</span>
          </AppButton>
        </div>
      </div>
    </div>
  );
}
