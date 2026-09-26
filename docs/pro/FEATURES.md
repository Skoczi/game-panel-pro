# Features and compatibility

| Function | Native 2.0.59 | Existing providers |
| --- | --- | --- |
| Console, power, files | Supported through the installed runtime | Existing adapter behavior |
| Backup | `data/serverfiles` only; archive in `data/backups` | Provider-specific archive or directory |
| Online backup | Allowed, explicitly marked best-effort | Provider-specific |
| Restore | Stopped server, staged validation, previous directory retained | Existing OVH adapter support; no new LinuxGSM restore |
| Retention / off-node copies | Verified local retention and configured external storage | Existing LinuxGSM settings where supported |
| Game Config | Declared file editor; ReHLDS maps/admins/plugins/addon catalogue | Specialized adapter forms |
| Schedules | Backup/restart/custom plus Native maintenance workflow with verified backup and A2S | Existing operation-specific behavior |
| Clone / transfer | Root-only, stopped source, single data mount, pinned images, reviewed target ports | Not supported |
| API power | Scoped token + current server.power permission; durable admission | Same provider power implementation |
| Signed webhooks | Root-configured HTTPS integration, disabled until configured | Alert summaries and API power outcomes |
| Absolute metrics | Requires compatible PRO runtime | Same runtime requirement |

The Native backup layout currently requires a declared `data` mount containing `serverfiles`. The shipped ReHLDS template uses it. Legacy Native recipes that install directly in `/data` need an explicit layout migration before using the new backup path; do not silently archive the wrong directory.

Archives created by earlier revisions in `<serverRoot>/.native-backups` remain on disk. They contain mount directories and are not automatically relocated or treated as the new `serverfiles` format. The Backups screen lists them as legacy downloads for manual recovery. Do not delete them during update.

ReHLDS was exercised on isolated copies on WAW2: NFS restore, all six addons and rollback, maintenance, clone/transfer and scoped API power. Other games were not newly certified. Transfer acceptance used two agent processes with separate databases on one physical host, not a physical cross-host failover. See [runbook](ESERV-RUNBOOK.md) and feature-specific documents for limits.

## Node selection

Administrators have a node selector on every page. **All nodes** is the initial view; a selection is retained per user within the browser tab. It filters the server list and Host Status. All-host metrics remain separate, because percentages from different hosts are not additive. Select a host for its detailed history. Panel, account and template settings remain global. The filter does not change the explicit runtime context of an open server or installation.
