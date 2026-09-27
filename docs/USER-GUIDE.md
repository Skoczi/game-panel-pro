# Operator guide

[Documentation](README.md) · [Polski](USER-GUIDE.pl.md)

## Fleet and navigation

Game Servers combines accessible servers across nodes. The default order is numeric IP and port. Use filters for node/game/status, cards or list view, and drag ordering when you want a personal order. The node selector filters the fleet and Host Status; it does not move a server or change the runtime behind an open workspace.

Open a server to work in Console, File Editor, Game Config, Backups, Schedules, Settings or Activity. Availability depends on your permissions and the runtime. Pages and file folders have URLs: bookmarks, shared links, Back and Forward preserve navigation, but never bypass access checks.

## Console and monitoring

### Online players

Cards and table rows show the latest A2S player count. Click it to open a searchable list with names, scores and connection times. Opening the list requires **View online player list** (`server.players.read`); users without that grant can still see the count. Assign it in server access or user permissions. New server-administrator presets include it; existing grants are unchanged.

Supported: games with enabled A2S monitoring, including CS 1.6/ReHLDS, Source, CS:GO, CS2 and Classic Offensive. Counts follow monitoring updates; an open player list refreshes every 10 seconds. Some games hide player names even when they report a count. Unknown/stale data shows a dash, not zero. Update both panel and agents to use the player-list endpoint on remote nodes.

Start, stop and restart act on the selected server. The console supports command history, copy, clear, fullscreen and Search. Search filters are collapsed until needed. The lower handle resizes the console.

Process status and game response are distinct. A running container can host a game that is not responding yet. Unknown or stale measurements are not zero usage and do not confirm a stopped server. Host Status collects operational incidents; resource limits belong in server Settings.

## Files

Use File Editor to browse, upload and edit supported text files. Folder changes update the browser address. Context actions include copying a file without overwriting an existing destination. Ctrl+F in the file browser opens file search; the text editor retains its own search behavior.

Save applies the editor contents directly. Atomic replacement protects against partial writes, but does not merge another operator's changes. Review file history when recovering prior text; loading a historical version does not apply it until you save. File-operation activity and recovery history have bounded retention.

On mobile, secondary commands are in the overflow menu. Hidden-file visibility, new files/folders and upload actions remain available without filling the toolbar.

## Game configuration and addons

Game Config exposes the settings and files declared by the template. CS 1.6 configuration includes visual map rotation and AMXX administrator editors. Framework controls show installation state separately from install/remove actions.

Addon operations report backup and installation progress. Stop the game when required and wait for the operation to finish before starting it. Panel-managed uninstall applies to managed files; detected external installations do not imply ownership of every file. A completed installation does not prove that every plugin is compatible with your game build.

Source/CS:GO/CS2 share Game/Query/RCON allocation and use a separate TV port. HLTV is a separate relay server. Classic Offensive uses local assets and immutable shared packages; see the runtime guides before installation.

## Backups, clones and transfers

Native backups archive private serverfiles. Live copies are best-effort; a running game may not flush all state. Stop the game for a consistent offline copy when required by the game.

Restore validates and stages the archive before replacing files. Keep recovery journals and previous files until the operation is confirmed. Retention and external copies require configuration; they are not enabled merely by installing the panel. Shared packages are backed up separately from private server files.

Clone lives near the bottom of Settings. Review source state, target node, identity, resource limits and ports before submission. Clone/transfer support depends on the layout and runtime; these actions are not generic copies of arbitrary Docker containers. Consult the [compatibility matrix](pro/FEATURES.md).

## Accounts and access

Users see assigned servers. Operators can administer the panel while the owner account remains protected. Server access presets separate console viewing, console/power operation and server administration. The server-admin preset adds files, backups, schedules and SFTP without terminal, CPU/IP/port or startup-environment editing.

Account security provides authenticator enrollment and revocable sessions. API tokens are separate credentials with scopes, expiry and server assignments. A token never grants more access than its owner's current permissions.

## SFTP, networking and shared files

Enable SFTP in server Settings when the node supports it. Use the endpoint and login shown by the panel. Dedicated game-IP access depends on host networking and allocation setup; do not substitute the node management address blindly.

Additional IP configuration is a host-level action. Enter the provider-assigned IP/MAC and review the network operation. The node-side boot service restores managed interfaces independently of panel startup. Allocations decide which configured IP/port ranges games may use; the panel does not obtain additional addresses from your hosting provider.

Shared packages are immutable node-local versions. Instances share read-only assets while keeping writable configuration and addons private. A new node must have the matching package and runtime dependencies before restore or installation.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Node online, server unavailable | Reverse panel-to-agent access and runtime identity; heartbeat alone is insufficient |
| Missing controls | Account role, server membership, token scope and runtime capability |
| Installation appears stuck | Current operation, node logs, storage and pending recovery; avoid duplicate submissions |
| Restore blocked | Stopped state, layout, free space, shared dependencies and recovery journal |
| API timeout | Stored operation ID and idempotency key before any new request |

See [deployment](pro/DEPLOYMENT.md) for infrastructure recovery and [API v1](pro/API-V1-GUIDE.en.md) for integration error handling.
