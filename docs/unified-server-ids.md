# Shared server IDs

The panel owns one persistent sequence for every node. New reservations start at
101; ID 100 is assigned to the existing WAW2 server during the explicit migration.
The same number is used by the fleet, runtime database, storage directory, Docker
label and FastDL URL.

`GameServerRepository.create` reserves the number before inserting a runtime row.
This covers installation, local cloning and cross-node clone imports. Agents
authenticate to the panel using their enrolled key and a signed path containing
the generated runtime UUID. They never fall back to a local counter. Existing
games keep running when the panel is unavailable, but creating a server fails.

The reservation table binds node + runtime UUID to a fleet UUID. A SQLite trigger
allocates the number atomically. Repeated requests for the same identity return
the same number; failed or deleted creations do not release it. Gaps are expected.
Inventory reconciliation reuses the reservation and rejects mismatched numbers.
Legacy inventories retain their original mapping until deliberately migrated.

`deploy/tools/eserv_unified_identity.py` is the one-time, guarded migration for
the audited test server (local 9 / panel 28). Run `node` on WAW2, then `panel` on
FR1 after deploying the shared allocator to both agents and the panel. It retains
the runtime UUID, fleet UUID and grants, snapshots databases and game files,
changes foreign-key references and storage to 100, and recreates the game container
with its original image, environment, limits and port bindings. The old stopped
container has automatic restart disabled. Private rollback artifacts are under
`identity-migrations/` on each host. Do not publish these snapshots.

The WAW2 migration retains `/fdl/srv9/` compatibility through a persistent Nginx
rewrite to `/fdl/srv100/`. Existing SFTP accounts cause preflight to stop; the
audited server has no SFTP account. Future SFTP activation resolves the new data
directory while retaining UUID-based account isolation.

Validation includes concurrent cross-node reservations, replay, restart, failed
allocation, authenticated agent transport, UUID mismatch, repository insertion
and the complete backend test suite. Migration additionally runs an offline DB
rehearsal and `foreign_key_check` before committing production changes.
