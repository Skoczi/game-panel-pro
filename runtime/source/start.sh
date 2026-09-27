#!/bin/bash
set -euo pipefail
game="$1"; shift
cd /data/serverfiles
[[ "$MAP" =~ ^[A-Za-z0-9_/-]+$ ]] || { echo 'Invalid starting map'; exit 2; }
[[ "$MAX_PLAYERS" =~ ^[0-9]+$ ]] && ((10#$MAX_PLAYERS >= 1 && 10#$MAX_PLAYERS <= 64)) || { echo 'Player limit must be 1-64'; exit 2; }
[[ "${GSLT:-}" =~ ^[A-Za-z0-9]*$ ]] || { echo 'Invalid Steam token'; exit 2; }
token=(); [[ -z "${GSLT:-}" ]] || token=(+sv_setsteamaccount "$GSLT")
export LD_LIBRARY_PATH=/data/serverfiles:/data/serverfiles/bin:/data/serverfiles/bin/linux64:/data/serverfiles/game/bin/linuxsteamrt64
if [[ "$game" == cs2 ]]; then
  /usr/local/lib/gamepanel/source-loaders /data/serverfiles
  exec /usr/local/lib/gamepanel/source-console ./game/bin/linuxsteamrt64/cs2 -dedicated -console -usercon -ip 0.0.0.0 -port "$SERVER_PORT" -maxplayers "$MAX_PLAYERS" +game_type "$GAME_TYPE" +game_mode "$GAME_MODE" +map "$MAP" +exec server.cfg "${token[@]}" "$@"
fi
folder=cstrike; [[ "$game" != csgo ]] || folder=csgo
# The legacy 32-bit CS:GO depot ships libgcc older than its system libstdc++.
# Keep Valve's copy for recovery and let the runtime supply the compatible ABI.
if [[ "$game" == csgo && -f bin/libgcc_s.so.1 ]]; then mv -f bin/libgcc_s.so.1 bin/libgcc_s.so.1.valve; fi
extra=(); [[ "$game" != csgo ]] || extra=(-tickrate "$TICKRATE" -maxplayers_override "$MAX_PLAYERS" +game_type "$GAME_TYPE" +game_mode "$GAME_MODE" +mapgroup "$MAP_GROUP")
exec /usr/local/lib/gamepanel/source-console /bin/bash ./srcds_run -game "$folder" -console -usercon -ip 0.0.0.0 -port "$SERVER_PORT" -strictportbind -norestart -maxplayers "$MAX_PLAYERS" "${extra[@]}" +map "$MAP" +servercfgfile server.cfg "${token[@]}" "$@"
