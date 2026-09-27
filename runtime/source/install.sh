#!/bin/bash
set -euo pipefail
game="$1"; phase="$2"
case "$game" in
  css) app=232330; folder=cstrike; binary=srcds_run ;;
  csgo) app=740; folder=csgo; binary=srcds_run ;;
  cs2) app=730; folder=game/csgo; binary=game/bin/linuxsteamrt64/cs2 ;;
  *) exit 2 ;;
esac
root=/data/serverfiles
if [[ "$phase" == install && -e "$root/$binary" ]]; then echo 'Existing game files detected'; exit 2; fi
mkdir -p "$root/steamapps" /data/.steam/sdk32 /data/.steam/sdk64
cd /opt/steamcmd
args=(+force_install_dir "$root" +login anonymous +app_update "$app")
[[ "$phase" != install ]] || args+=(validate)
./steamcmd.sh "${args[@]}" +quit
test -s "$root/$binary"
for arch in 32 64; do
  [[ ! -f "linux$arch/steamclient.so" ]] || install -m 644 "linux$arch/steamclient.so" "/data/.steam/sdk$arch/steamclient.so"
done
mkdir -p "$root/$folder/cfg"
if [[ ! -f "$root/$folder/cfg/server.cfg" ]]; then
  printf '%s\n' 'hostname "Counter-Strike Server"' 'sv_lan 0' 'sv_password ""' 'rcon_password ""' 'log on' > "$root/$folder/cfg/server.cfg"
fi
if [[ "$game" != cs2 && ! -f "$root/$folder/mapcycle.txt" ]]; then printf '%s\n' de_dust2 > "$root/$folder/mapcycle.txt"; fi
if [[ "$game" != css ]]; then
  # Valve executes the mode preset after server.cfg. The supported per-mode
  # override puts the panel's settings last, without replacing custom overrides.
  for preset in "$root/$folder"/cfg/gamemode_*.cfg; do
    [[ -f "$preset" && "$preset" != *_server.cfg ]] || continue
    override="${preset%.cfg}_server.cfg"
    [[ -e "$override" ]] || printf '%s\n' 'exec server.cfg' > "$override"
  done
fi
if [[ "$game" == csgo && -f "$root/$folder/botprofile.db" ]]; then
  sed -i 's/^[[:space:]]*Rank[[:space:]]/\t\/\/Rank /' "$root/$folder/botprofile.db"
fi
echo 'Game files ready'
