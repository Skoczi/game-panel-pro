# MixQueue node integration

## MatchBot CSCO 0.4.0

The CS 1.6 controller is now a native Metamod plugin. The Python agent preserves `controller`, `controller_version`, `rules_ready`, `solo_test` and `agent_protocol: 2` in the observation sent through the existing signed broker. `adapter: "amxx"` remains the transport name and does not mean an AMXX controller. Source/Get5 is unchanged.

1. Update the runtime under **Nodes → MixQueue**. Installed and available versions are separate. Updating the node image does not interrupt existing game assignments; a server with an older executor shows that an agent restart is required.
2. End allocations/sessions in CSCO, wait for lease release and verify the game is empty. Stop it through ESERV.
3. Under **Game Config → Addons → MixQueue**, review **MatchBot CSCO**. The preview lists pinned ReHLDS, ReGameDLL and Metamod dependencies and recognized conflicting active plugins. Unknown custom plugins are preserved and need operator review. Active assignment markers block installation until normal CSCO cleanup completes.
4. Install. ESERV verifies every package hash, probes the actual game image for glibc >=2.36 and a working i386 loader, creates a verified full game backup and privately snapshots the stopped executor's configuration/spool. It stages the selected files and commits only engine binaries, loader/plugin lists and controller assets. Existing configuration is preserved. AMXX itself, unrelated plugins, Steam libraries, server.cfg, RCON, maps, journals, generation markers and the spool are not replaced.
5. Start the game and recreate the executor using **Restart agent**. Verify `meta list`, `mq2_status` and the signed heartbeat. Keep public queues disabled until real Steam/player acceptance is complete.

The installer uses the same pinned dependency registry, native operation lock, verified backup and progress log as ESERV addon management. It uses a per-file transaction instead of swapping the entire game directory, preserving the event journal's inode and cursor. Interrupted commits recover automatically before game reconciliation. Private `.matchbot-recovery-*` directories contain only the changed files and a manifest. Roll back those files and the saved container image, never the event spool or matchmaking database. A rollback to AMXX 0.3.0 remains ineligible for new matches on CSCO 0.4.0.

The release and full GPL-3.0 controller source archive are retained under `runtime/mixqueue/`. The production binary SHA-256 is `0298b8d2e8096094789123e773b65861de5da296fdcb48cec6e3cc94f1b7c11e`. The agent SHA-256 is `f28b4b6c4fb754bd08fdf4517095b97f0ff3b0a3589ce2c6a9b929e118d558d3`. ESERV's runner, poll schedule, broker command restrictions and isolation remain unchanged.

Automated checks include the 15 release agent tests, six ESERV runner tests, transactional rollback/path/plugin-list tests, two real isolated executor containers and PL/EN desktop/mobile UI tests. Test load/abort and heartbeat are distinct from Steam `/ready`, three restarts, scoreboard, round results and a full ten-player match. See `runtime/mixqueue/RELEASE-0.4.0.md` for the upstream acceptance boundary.

## Runtime ownership

One MixQueue supervisor belongs to the existing ESERV backend on each node. There is no second ESERV agent, systemd daemon, enrollment or node credential. Installing MixQueue installs a verified executor image once on that node. Per-server actions attach a matchmaking identity and start or stop an executor using that image.

The single-server upstream Python implementation remains the protocol executor. Each game gets its own sandboxed executor container, rather than sharing a Python interpreter or a host filesystem namespace with other games. A container is an isolation boundary, not another ESERV node agent.

The node supervisor serializes reconciliation, uses deterministic executor identities, and handles each executor's failures and retry delay separately. An executor is replaced when its configuration revision or game-container generation changes. A stopped or deleted game must have no running executor. Node startup reconciles persisted assignments; it must not infer an assignment from game files.

## Isolation and protocol

Each assignment is bound to ESERV's immutable runtime UUID and its original MixQueue `server_id`. It has separate encrypted credentials, derived configuration, RCON connection, plugin journal and SQLite event spool. Numeric ESERV display IDs do not replace matchmaking identities.

Executors have no network, Docker socket or credentials. They receive only their own plugin configuration directory (write), plugin journal directory (read), event spool (write) and a per-server Unix socket. The existing ESERV runtime brokers that socket, signing requests with the assigned key and forwarding only to `https://csco.gg/mq2-agent`, without redirects. RCON destinations come from the inspected owned game container and its configured game port. The broker accepts only the commands supported by the MixQueue adapter.

Import fields `instructions`, `game_root`, `journal`, `database`, `rcon_host` and `rcon_port` never grant execution, filesystem or network capabilities. RCON passwords are not generated or changed. Missing credentials require a secure existing credential or explicit operator input.

The upstream request body, HMAC algorithm, headers, event sequence and server identity remain unchanged. Separate spools ensure that one server's journal fault or event backlog does not affect another server.

## Panel placement

- **Nodes → selected node → MixQueue:** install/update the shared executor runtime and show installation status.
- **Server → Game Config → Addons → MixQueue:** import configuration, show process/RCON/journal/heartbeat/readiness separately, start/stop/restart and disconnect.
- The server tab follows AMXX plugins where that tab is present. Both surfaces are limited to the owner and operators, including backend authorization.

Cloning and transferring game files do not copy integration credentials or event spools. A destination requires its own exported identity. Disconnection removes the integration, not the game. No action enables public queues on csco.gg.

## Earlier integration acceptance (before 0.4.0)

The node supervisor, encrypted assignment storage, operator-only routes, PL/EN panel, node installer, game-plugin installer and server lifecycle hooks are implemented. New and existing servers start with MixQueue disabled. Import also leaves the integration disabled, including repeated imports. The server's switch explicitly enables or disables its executor.

- Twelve TypeScript tests cover duplicate starts, per-server failure isolation, configuration changes, game restart, stop/removal, shutdown, import validation, RCON restrictions, container isolation options and GoldSrc/Source RCON against protocol fixtures.
- Five Python tests cover separate durable event spools, journal/event errors, readiness and Classic Offensive's build-attestation gate.
- A Docker integration test runs two real Python executor containers under one supervisor. It verifies signed requests against a controlled receiver, separate state, heartbeat despite a journal fault, restart isolation and scoped stopping. Both containers have networking disabled. The test does not contact csco.gg or operate customer games.

An isolated CS 1.6 copy on WAW2 passed plugin installation, import/reimport with an omitted RCON password, encrypted credential persistence, real GoldSrc RCON, reading the real plugin journal, controlled signed heartbeat, executor restart, game stop/start, disable and disconnect. Seven existing game containers retained their original start times. This acceptance used a controlled matchmaking receiver, not public matchmaking queues.

All 314 backend tests passed. Five browser tests verify explicit enablement, no secret in DOM/browser storage, operator-only tab placement, node installation and desktop/mobile layout. Screenshots produced by those browser tests use labeled test data.

## Configuration and lifecycle

The installation is stored in `/data/mixqueue/node.json`; encrypted per-server bindings live under `/data/mixqueue/servers/<runtime UUID>/binding.json`. The key is encrypted with ESERV's existing authenticated encryption mechanism and a server-specific context. Preserve the node's existing JWT secret and private data during upgrades. Export JSON is never stored verbatim.

The executor's event spool lives outside game files and game backups. Reimport keeps the same identity and spool; changing identity requires disconnecting first. Disconnect deletes the credentials and local event spool, with a confirmation in the panel. It does not revoke the key on csco.gg. Clone/transfer destinations receive neither credentials nor spool, and copied MixQueue plugin state is cleared.

Node startup retires stale executor containers before reconstructing their broker sockets. Enabled integrations resume only when their assigned game is running. Game stop/restart revokes the broker first. A failed game stop leaves the integration suspended until a new game generation or an explicit agent restart. Plugin installation requires the game to be stopped. CS 1.6 controller updates require a reviewed installation and verified backup. Source bridge binaries with different hashes are not overwritten.

CS 1.6 requires ReHLDS, ReGameDLL_CS and Metamod; the controller installer supplies their pinned compatible versions. AMX Mod X is optional for unrelated plugins. CS:GO and Classic Offensive require SourceMod and a compatible Get5 plugin. These prerequisites are reported separately; installing the MixQueue bridge does not install Get5. Classic Offensive additionally requires a nonempty `verified_build` from its private export; this is an operator attestation, not proof that this ESERV installation has completed a match.

For isolated verification:

```sh
docker build -t gamepanel-mixqueue:test runtime/mixqueue
cd backend
npm run build
npx tsx --test test/mixqueue-*.test.ts
MIXQUEUE_TEST_IMAGE=gamepanel-mixqueue:test npx tsx --test test/integration/mixqueue.test.ts
cd ../runtime/mixqueue
python3 -m unittest -v test_runner
```

Real csco.gg heartbeat and a complete match remain separate acceptance steps. A successful fixture heartbeat is not a production heartbeat or acceptance of a full match. The integration never enables queues on csco.gg.
## Controller 0.4.1 upgrade

MatchBot CSCO 0.4.1 requires CSCO WWW 0.5.2 or newer for reconnect, abandon and surrender events. Verify the web deployment before installing the controller. Python remains 0.4.0 / protocol 2; no node runtime rebuild is required. Both versions are shown separately in the panel. An existing recognized 0.4.0 controller offers **Review update** rather than appearing uninstalled. Readiness remains false until the current controller is installed and actual runtime checks pass.

Use the same reviewed installation on an empty, stopped, unleased server. The versioned archive and production binary are independently pinned; 0.4.0 artifacts remain unchanged. Preserve private settings, unrelated plugins, journal, spool and generation. If an existing server.cfg overrides `mb_log_tag`, back up the file and update only that setting to `"CSCO.GG"` when requested. The installer does not replace operator configuration.

The release is in `runtime/mixqueue/releases/0.4.1/`; full GPL sources are in `runtime/mixqueue/source-bundles/mixqueue2-cs16-0.4.1.zip`. Real Steam solo/reconnect and ten-player gameplay acceptance remain separate from installer/heartbeat checks. Public queues must remain disabled until acceptance; 0.4.1 does not claim to fix an unidentified client crash.
