# Classic Offensive 1.0.2

The template uses a local, complete ZIP package. SteamCMD is not invoked during
installation or verification. Do not replace the package's `srcds_run` with the
generic CS:GO launcher: it supplies the mod loader and mimalloc setup.

## Reviewed inputs

| Input | Version / SHA256 |
| --- | --- |
| [Full game ZIP](https://cdn.classicoffensive.net/csco/packages/full-1.0.2.zip) | `928e35bab55e1bfdbc35cdc37b1fbc9201205d29db140fc126375f2e03b37ad1` |
| [Metamod:Source](https://mms.alliedmods.net/mmsdrop/2.0/mmsource-2.0.0-git1350-linux.tar.gz) | 2.0.0-dev+1350 · `3c80c8612f53001d13be94daa05c6e8ec4b8214e05b287e94893e82edd143bd0` |
| [SourceMod](https://sm.alliedmods.net/smdrop/1.13/sourcemod-1.13.0-git7243-linux.tar.gz) | 1.13.0.7243 · `1cbb57a4617e5234aa1a3a6cd2799bde6762d3028b7437263798929b5f9fcbce` |
| Steam SDK32 from the verified existing server | `1450da1206678be950d4a9916ab87d229e04076776cdd64c78f8e5419da15fb5` |
| Source runtime base | `sha256:f56d9700ee9886b9580255e55fb7fc150bee963cba18febf675a3dbbfeec6e51` |

Copy the reviewed archives as `metamod-official.tar.gz`,
`sourcemod-official.tar.gz`, and the SDK as `steamclient.so` into a separate build
context with this directory's files. Confirm the base image ID before building
`gamepanel-runtime:classic-1.0.2`. The Dockerfile verifies all three asset hashes.
Do not commit the binaries.

## Node storage

Configure `GAMEPANEL_SHARED_FILES_ROOT` as an absolute, dedicated host directory
and bind it at the **same absolute path** into the agent. Provision each node with
the runtime image and import the ZIP using **Nodes → Shared files**:

- ID: `classic-offensive-1_0_2`
- Name: `Classic Offensive`
- Version: `1.0.2`
- Folder inside ZIP: `Classic Offensive`

`importSharedZip()` from `dist/services/sharedFiles.js` also accepts an existing
local ZIP for operator provisioning. It extracts through a staging directory,
rejects traversal, links, duplicate/special files and over-budget archives, hashes
the ZIP, then publishes by rename. Existing versions cannot be overwritten.
Keep `packages/<id>/manifest.json` and `source.zip` in the node's shared-package
backup. They are separate from per-server backups.

Runtime mounts are read only: `bin`, `csgo`, `platform`, `csco/csgo/vpks`.
The full original tree is also available read only at `/opt/classic-base`.
No files are dropped from the source package. All other game files are copied
into each server's private directory. Configuration, maps, addons, logs and demos
under `csco/csgo` are independent. The private `gameinfo.txt` disables the client
updater URL; the source package remains unchanged.

Default map: `de_dust2_csco`. `de_dust2_csgo` is not part of the supplied clean ZIP.
Game/RCON share one public port; GOTV has an independent UDP port. A blank GSLT is
omitted from startup. No credentials are copied from the existing game server.

## Recovery and compatibility

Backups contain private `serverfiles` and `.eserv-shared-files.json`, not the
shared bind-mounted bytes. Restore compares dependency manifests before replacing
private files. Clone/import checks destination packages before reserving an ID.
Missing packages or checksum mismatches stop installation. Package directories
must remain in place while referenced by servers; remove no package manually
without checking those references and relevant backups.

Re-upload uses a new package ID and a new template version. Verification does not
download Valve depots or replace instance configuration. Both initial frameworks
are recorded in the panel inventory; subsequent management uses the same pinned
versions and Classic Offensive-specific Metamod VDF.
