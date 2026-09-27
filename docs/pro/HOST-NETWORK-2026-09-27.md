# Persistent additional IPs

Nodes → Node settings → Network & IPs combines host addresses and game-port allocations in one workspace. Host addresses manages public IPv4 /32 macvlan interfaces in bridge mode. Enter the provider-assigned IP and virtual MAC, select an allowed physical parent, add to the draft, review, then Save on machine. Existing compatible interfaces can be imported without taking them down. The allocations section below selects addresses from the saved host list and sets their allowed TCP/UDP ranges.

The IP selector updates after host save/import without remounting the allocations editor or discarding port drafts. Unsaved host entries are not offered. Existing allocations absent from the host list remain editable, including when the host manager is unavailable; new arbitrary IPs cannot be entered in this workspace. New staged allocations are checked against the current saved list again before submitting. Either section's unsaved draft triggers the existing leave-page confirmation. Host configuration and port-policy saves remain explicit, separate operations.

## Persistence and authority

- `/etc/eserv/network.json`: root-only durable desired state, revision, allowed physical parents and removal tombstones. Atomic replace and fsync precede live changes. Configuration is independent of the panel database.
- `/usr/local/sbin/eserv-network boot`: restores configured addresses using only local files and `ip`; no Docker, panel, API or database dependency.
- `eserv-network-boot.service`: enabled at boot, after network-online and the physical interface, before Docker and Wings. A stopped panel cannot prevent restoration.
- `eserv-network-api.service`: separate systemd service, private root-only Unix socket `/run/eserv-network/control.sock`; no public listener. Root panel/agent containers receive only this socket directory, mounted read-only. The daemon validates a fixed schema and executes fixed argument arrays; clients cannot submit shell commands, paths, main-interface changes or routes.
- Super Admin and Operator can manage host networking. Assigned-server users cannot access the endpoints, including by delegated node requests.

Changes are previewed, validated again at apply, and guarded by a revision and host lock. The panel's allocation lock also excludes concurrent server-binding/allocation edits. Removing an IP still present in allocations or saved server bindings is refused. The host additionally checks all Docker container bindings (including stopped containers) and specific-IP listening sockets. Unmanaged or replaced interfaces cannot be removed. A provider's ownership and external routing are not validated by this feature; supply an IP/MAC actually assigned to this host.

Existing interface identities are immutable: remove an unused interface before changing its IP/MAC/parent. Reapply restores a missing saved interface. Removing from the draft is not an immediate network action; only the final reviewed save changes the machine. Failed live apply restores prior saved state and attempts live rollback. Interrupted removals are reconciled from durable tombstones at boot.

## Deployment and migration

`deploy/tools/eserv_network_setup.py` installs services and adds the agent/panel socket mount to existing compose. It does not restart Docker or game containers and does not alter address assignments. Backend recreation is required to pick up the socket mount.

WAW2 legacy files are backed up under `/srv/gamepanel-agent/host-network-migration/`. Import all five live macvlans through the authenticated panel runtime endpoint before disabling the old `waw2-additional-ips.service`. Replace its script with a compatibility wrapper invoking `eserv-network boot`; do not delete/recreate the live links. The new persisted configuration then owns the addresses. FR1/WAW1 start with empty managed lists and their physical `eno1` parent available for future additional IPs.

Back up `/etc/eserv`, the installed manager and both systemd unit files. Do not restart the dedyk just to validate the UI: isolated network-namespace acceptance verifies real Linux link creation, restoration from disk after removing runtime state, removal and absence after the next boot pass. Actual full-host reboot is not part of the migration.

## Validation

- Six host-manager unit tests cover import without disruption, persistence, invalid/main-interface input, stale revision, in-use/unowned deletion, rollback and tombstones.
- Real Linux network namespace test verifies add → simulated boot restoration → remove → boot without resurrection.
- Three backend tests cover stored game/allocation deletion guards, private socket routing, revision forwarding and rejection of command fields.
- Real HTTP acceptance verifies Operator access and denies ordinary-user GET, preview and PUT.
- Eighteen browser tests cover node settings, import/review/save, failed removal, discard/reload and mobile overflow. Production builds pass.

## Completed live migration

Commit `f77e6a58a4d10bd3e4a728a703d95d1e12dd132f`, patch `20260927-network-f77e6a5`, deployed to FR1 backend/frontend and both agents. All host helpers and boot services are enabled. Public panel health is HTTP 200 with the deployed commit.

All five WAW2 addresses (`51.83.150.145–149`) were imported through the signed panel runtime preview/save API and are active/persistent at revision 1. Live checks verified idempotent replay, rejection of stale revisions, in-use removal and denial of delegated game-user access. The legacy service is disabled; the original script has no address list and only invokes the new boot manager. Its original contents remain in the migration backup.

Re-running the actual boot service preserved every interface index/address and all container start times. The game still has its original `2026-09-22T15:26:40.006758795Z` start time and responds to external A2S queries on `51.83.150.145:27050`. The dedicated host was not rebooted; reboot restoration was tested with real links in an isolated network namespace.

The full Linux backend run had 270 passing tests and one outdated settings-route mock missing the new service import. After fixing that mock, the affected test and three new host-network tests all passed. The exact deployed image also passed the isolated HTTP acceptance suite.
