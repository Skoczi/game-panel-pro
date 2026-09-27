# Native Counter-Strike runtimes

Three published recipes use SteamCMD, fixed non-root UID/GID 1000, persistent
`/data`, and interactive game consoles. They install stopped. Steam tokens are
secret instance variables, never template defaults.

| Template | Steam app | Game directory | Runtime |
| --- | --- | --- | --- |
| Counter-Strike: Source | 232330 | serverfiles/cstrike | source-v1 |
| CS:GO Legacy | 740 | serverfiles/csgo | source-v1 |
| Counter-Strike 2 | 730 | serverfiles/game/csgo | source2-v1 |

Source 1 launches the depot's 32-bit srcds_linux through srcds_run. The CS:GO
libgcc compatibility fix follows LinuxGSM. The console wrapper supplies a PTY
without changing Docker's log framing. CS2 uses pinned Steam Runtime 3.
Mode override files keep server.cfg effective after Valve's mode presets.
Updates preserve existing configuration; they do not invoke SteamCMD `validate`.

## Framework management

Game Config → Addons provides installation, update/reinstallation, removal,
configuration links, plugin directories and live operation progress. SourceMod
and CounterStrikeSharp add Metamod when required. Files detect installations
made outside the panel; removal is offered only for panel-managed files.

| Framework | Pinned release | Supported game |
| --- | --- | --- |
| Metamod:Source | 1.12.0.1227 | Source, CS:GO |
| SourceMod | 1.12.0.7253 | Source, CS:GO |
| Metamod:Source | 2.0.0.1472 | CS2 |
| CounterStrikeSharp | 1.0.376 | CS2 |
| SwiftlyS2 | 1.4.12 | CS2 |
| ModSharp | git-169 / 2.1.169 | CS2 |

CounterStrikeSharp + Metamod + SwiftlyS2 was verified together. ModSharp is a
separate setup: the tested direct loaders do not chain correctly with it, so
the API and UI reject that combination. ModSharp bundles .NET 10.0.12; its
optional AdminCommands.SQLStorage module starts disabled until a database is
configured. Remove that module's `.disabled` file to enable it.

Downloads use pinned official URLs and SHA-256. Archives reject traversal,
links, unexpected roots and oversized entries. A stopped server, file read/write
and backup create/restore permissions are required. Each operation makes a
verified full game backup, stages changes, and commits through the existing
restore journal. Configuration and unrelated user plugins remain intact.
Changed framework binaries block removal rather than deleting unknown changes.

Full game backups and the retained recovery copy require substantial disk
space for CS:GO/CS2. Their archive timeout is two hours, not the ten-minute
GoldSrc limit. These are complete recovery archives, not small addon-only copies.

CS2 startup reapplies only panel-managed search paths after Valve updates.
The running game is never restarted by a framework operation.

## Build

Build from this directory using the existing `gamepanel-runtime:linux-v1` and
`gamepanel-installer:steamcmd-v1` base images:

```sh
docker build --target source -t gamepanel-runtime:source-v1 .
docker build --target source2 -t gamepanel-runtime:source2-v1 .
docker build --target installer -t gamepanel-installer:source-v1 .
```

Install all three images on an execution node before publishing its templates.
The panel resolves local tags to immutable image IDs when creating a server.
Bundled templates initialize as drafts and never replace administrator edits.

## Validation, 2026-09-27

SteamCMD successfully installed all three depots in isolated WAW2 directories;
no panel server IDs were allocated. Source/CS:GO answered A2S, loaded Metamod and
SourceMod, accepted console commands and exited cleanly on `quit`. CS2 loaded
de_dust2 and confirmed the versions of CounterStrikeSharp, SwiftlyS2 and
ModSharp through their own console commands. The supported combined loader
setup was tested separately from ModSharp.

Known upstream/runtime limitation in the tested CS2 build 2000918: with
CounterStrikeSharp 1.0.376 and Metamod 2.0.0.1472, `quit` terminates the game
with SIGSEGV after its shutdown callbacks (reported as exit 245 by the console
bridge). Startup, A2S, console commands and changing to de_inferno passed.
Vanilla CS2 and SwiftlyS2 alone exited cleanly. This is not suppressed or
reported as a clean exit; recheck shutdown when updating these pinned versions.

A disposable backend with a fresh database detected the real framework files.
A real install/uninstall transaction verified backups, staged replacement,
configuration preservation and UID 1000 ownership. Unit/regression tests cover
template isolation, dependency/conflict handling, stale previews, running games,
path validation and loader idempotence. Browser tests cover mobile/desktop,
light/dark, read-only controls, progress and historical job dismissal.

Reviewed upstream references:

- [LinuxGSM CSS recipe](https://github.com/GameServerManagers/LinuxGSM/blob/master/lgsm/config-default/config-lgsm/cssserver/_default.cfg)
- [LinuxGSM CS:GO compatibility fixes](https://github.com/GameServerManagers/LinuxGSM/blob/master/lgsm/modules/fix_csgo.sh)
- [Pterodactyl CSS egg](https://eggs.pterodactyl.io/egg/games-counter-strike-source)
- [CS2 Pterodactyl runtime](https://github.com/1zc/CS2-Pterodactyl)
- [CounterStrikeSharp installation](https://github.com/roflmuffin/CounterStrikeSharp/blob/main/INSTALL.md)
- [SwiftlyS2 installation](https://swiftlys2.net/docs/installation)
- [ModSharp installation](https://github.com/Kxnrl/modsharp-public/blob/master/docfx/docs/en-us/guides/getting-started.md)
