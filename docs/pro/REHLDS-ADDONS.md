# CS 1.6 / ReHLDS configuration and addons

Open the server's **Game Config → Maps and addons**. The form uses the server's declared `cstrike` directory, with these files:

- Map rotation: `mapcycle.txt`, restricted to installed `.bsp` maps.
- Administrators: `addons/amxmodx/configs/users.ini`, Steam ID entries with empty passwords and `ce` authentication flags. Other formats remain editable in File Manager.
- Plugins: `addons/amxmodx/configs/plugins.ini`, restricted to installed `.amxx` files, with optional `debug`.

Review changes before saving. Every form save requires a recovery snapshot and the file version last read; a concurrent edit returns a conflict and preserves the draft. Review a previous version to restore its contents through the same validation and snapshot process. Configuration takes effect when the game reloads it.

## Installation

The Linux x86 installer supports the standard `data/serverfiles/cstrike` layout. Choose modules, stop the game, refresh server state, and review the proposed installation. File read/write and backup create/restore permissions are required. Dependencies are included automatically:

| Module | Pinned version | Dependencies |
|---|---|---|
| ReHLDS | 3.15.0.896 | — |
| Metamod-R | 1.3.0.149 | — |
| AMX Mod X | 1.10.0.5486 | Metamod-R |
| ReGameDLL_CS | 5.30.0.814 | ReHLDS |
| ReAPI | 5.29.0.358 | ReHLDS, ReGameDLL_CS, AMX Mod X |
| Reunion | 0.2.0.25 | ReHLDS, Metamod-R |

Downloads come from official project release URLs pinned with SHA-256 in `backend/src/services/rehldsPackages.ts`. They are downloaded at runtime; the panel does not bundle third-party binaries. Review upstream licenses before redistributing a server image. The UI exposes each URL and checksum. Updating a pin requires a new compatibility test and release of the panel/agent.

The installer downloads and verifies selected packages, creates a verified native backup, stages files outside the active mounts, then uses the existing journaled restore transaction to publish the staged directories. It preserves existing `.ini`/`.cfg` files and AMXX configuration/data. It adjusts loader registrations without adding duplicate lines, removes the default loopback administrator from a new AMXX configuration, and gives a new Reunion configuration a random identity salt. Existing Reunion configuration and salt are retained. Reunion affects player authentication; review its configuration before starting the game.

The job is recorded in Backups and Activity. The game remains stopped after installation. Start it deliberately and inspect the console: `meta list`, `amxx modules`, and `version` show loaded modules and versions. A manifest records panel-installed versions; it does not claim to inventory manually installed addons.

## Rollback

Keep the game stopped and restore the `Before-ReHLDS-addons` backup named in the completed job. This restores all archived game mounts, including configuration and data, to their pre-installation state. Changes made after that backup will also be reverted. Start the game and verify its query response and logs. An interrupted transaction is reconciled by the existing native restore journal on agent startup; an interrupted job remains visible for operator review.

`deploy/tools/eserv_addons_rehearsal.py` is an environment-specific WAW2 rehearsal: it imports an external backup into a separate directory, installs all six modules using a candidate backend image, boots an isolated game container without published ports, checks its query and module list, restores the original archive, and boots it again. It asserts the source container and source configuration did not change. Failed rehearsal data is retained for diagnosis; successful rehearsal data is removed after writing a report.

The user-supplied Red-Banana installer was used to identify the desired module catalogue. Its shell script is not executed by the panel. ReVoice Plus is outside this catalogue because it is absent from the supplied script's installation options.
