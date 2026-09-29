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

Executors have no network, Docker socket or credentials. They receive only their own plugin configuration directory (write), plugin journal directory (read), event spool (write), a per-server Unix socket and, for CS 1.6, their actual game maps directory (read-only). The existing ESERV runtime brokers that socket, signing requests with the assigned key and forwarding only to `https://csco.gg/mq2-agent`, without redirects. RCON destinations come from the inspected owned game container and its configured game port. The broker accepts only the commands supported by the MixQueue adapter.

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

## MatchBot and agent 0.5.0

The universal node installer bundles controller and Python agent 0.5.0. It requires CSCO web 0.6.0 or later; ESERV does not deploy or downgrade that website. Published 0.4.0/0.4.1 controller packages remain immutable. The reviewed controller installation retains native backups, private bindings, plugin state and per-file recovery.

Install/update the node runtime to build the new Python image, then recreate the assigned executor. Restarting a container based on the old image does not update Python. Readiness remains false while either the node image or executor requires an update. Keep each game empty and without an active lease for controller installation and its required game restart.

Full tests require a fresh heartbeat with controller_version=0.5.0, assignment_contract=2, full_test=true, agent_version=0.5.0 and agent_protocol=2. All observation fields reach the signed CSCO poll unchanged. The broker accepts only the finite GoldSrc cleanup/end-test reason codes; it does not allow arbitrary RCON, extra arguments, separators or control characters. Runner scheduling, networking, mounts and secret storage are unchanged.

## MatchBot and agent 0.5.1

The 0.5.1 release pins controller and agent 0.5.1 and requires WWW 0.6.5 or later. Earlier releases remain immutable. Production controller SHA-256: `6cac5c2f16e8236580ebf8738a95678c60946497571de645a0175293eef6dffb`; agent SHA-256: `586a831b8605bc419c40aa9c112ab59c614f1e06a48ec37514e394a40e4efc3a`.

The executor receives only its assigned game's existing `maps` directory at `/game/maps`, read-only. Symlinked storage paths are rejected; an absent directory remains absent. Agent observations rescan local GoldSrc BSP v30 headers on every poll and send `map_inventory` unchanged through the signed broker. No configured-name fallback or cross-server inventory is used. This confirms file/header presence, not WAD dependencies or map playability. WWW restricts allocation and veto to fresh verified inventory.

The runner retains its healthy-load guard and uses `Agent.dispatch(command, response.get('load_rejection_contract', 0))`. Negotiated explicit errors become durable, sequenced `load_rejected` events once per command; only the plugin journal can confirm `loaded`. Unknown replies/timeouts remain retryable ambiguity. Journal draining and ordered flush continue during recovery, including cleanup/idle. The broker bounds inventory to 256 safe map names and rejection data to the seven published codes, within its unchanged 128 KiB request/1 MiB response limits. It preserves poll negotiation, event identity/generation/sequence, signing and revocation; it grants no new RCON commands or network access.

Updating requires rebuilding the node image, recreating the executor and a reviewed backup/install on a stopped, unleased game. Keep StatsX excluded and preserve credentials, spool, journal, recovery/generation markers and unrelated plugins. Native TAB updates require real Steam acceptance; unit and isolated Docker tests do not establish reconnect, 2+8 or ten-client readiness. Public eligibility stays disabled during acceptance. Rolling back to 0.5.0 blocks new CS 1.6 allocation because it lacks inventory; do not bypass WWW's gate or rewind durable data.

Preserve original-hostname.txt along with existing assignment markers, journal, spool and generation. Never rewind databases/spools or delete recovery markers during rollback. Upstream isolated engine acceptance is bundled with the release; actual Steam 1+9/2+8, kick rendering and ten-person acceptance remain separate checks. Deployment must not enable public queues or delete test history.

MatchBot owns `/stats` and `/score` during assignments. The installer explicitly lists `statsx.amxx` as a conflict because it intercepts these commands before the ReGameDLL handler. Only that plugin entry is disabled; AMXX, statistics configuration/logging plugins and unknown plugins remain unchanged.

## Controller 0.5.2, agent 0.5.1

The 0.5.2 release pins MatchBot CSCO **0.5.2** while the Python agent remains **0.5.1**, protocol 2. WWW must be at least 0.6.5. The controller hash is `ae8cf6516f4a684d44bff8e21f0a590b1de1988351557450bc76efdfe6d1e82d`; the unchanged agent hash is `586a831b8605bc419c40aa9c112ab59c614f1e06a48ec37514e394a40e4efc3a`. The signed API, event schema, RCON allowlist, dispatch negotiation, map inventory, dependency pins and executor isolation are unchanged. Published releases, including 0.5.1, remain immutable.

Rebuild the ESERV backend/installer image because it bundles controller assets. A separate agent image rebuild is unnecessary for this controller-only release; preserve its existing version and image. Review and install through the normal backup workflow only after the previous match has ended, cleanup confirms idle, the WWW lease is released and the game is empty/stopped. Restart the game to load the new controller. The existing supervisor handles its assigned executor; do not add another agent. Preserve all durable state and keep the exact StatsX/mq2_match conflicts disabled.

The controller provides captain-only tactical timeouts, assigned team names in pause messages, and early `/unpause` only after both opposing captains agree. Bot captains do not vote; 1+9 pauses expire normally. Private PL/EN dealt/taken summaries appear after completed rounds and can be replayed with `/dmg`, without exposing damage during the next live round. These changes require real Steam acceptance with two human captains (2+8), including vote order/duplicates, side changes, reconnect, automatic expiry and end-of-round messages. The bundled upstream entity/engine tests are separate evidence, not proof of that acceptance or ten real players.

Keep public eligibility disabled. After test termination, verify the saved result, idle, lease release and no test ELO/penalties. Roll back only on an empty unleased server to the immutable 0.5.1 controller; never rewind newer events, spool, generation, hostname or recovery state.


## Controller 0.6.1, agent 0.6.0

The universal WAW1/WAW2 installer pins MatchBot CSCO **0.6.1** and agent **0.6.0**; WWW must be at least **0.7.1**. Controller SHA-256: `c53d87ad9078e4a53d56ebad468e54a362f4f1efde8d6c0badfa1da4d46ec89a`. Agent SHA-256: `6274415004a73cbf2750ab9138746ad87f8b84329721c80e96600097907c092a`. Prior release assets remain immutable. The transport remains `amxx`, protocol 2, with assignment contract 3, stats v2, verified map inventory and negotiated load rejection.

Install the node runtime once per node. An installation still running agent 0.5.1 must build the 0.6.0 executor image and recreate its existing assigned executors through the supervisor; restarting the old image is insufficient. The upstream manifest's `agent_unchanged` refers to upstream 0.6.0, not an older ESERV installation. Rebuild the backend image to include the new controller package. No second supervisor, new RCON commands, broker permissions or network access are required.

The broker and runner preserve controller capabilities and event data, including `loaded.data.ready_deadline` (UNIX seconds), without projecting them onto the older schema. The controller supplies the 300-second game-ready deadline; ESERV does not recalculate it. Agent 0.6.0 adds delivery metrics through an additive spool migration, preserving events, sequence counters and journal cursors. Undelivered events still block new matches while cleanup remains possible.

Before installation, verify WWW version, empty game, healthy idle controller and released lease. Use the reviewed backup/install workflow and preserve private configuration, identity, keys, RCON, spool/WAL, journal, generation, hostname/recovery markers and unrelated plugins. Only the existing reviewed `mq2_match.amxx` and `statsx.amxx` conflicts remain disabled. Do not deploy the bundled WWW source or enable public eligibility.

Controller acceptance requires real Steam clients: two human captains (PL/EN), 3x30-second tactical pauses, freeze/next-round timing, bilateral unpause without reset, retained equipment/score and a real five-minute ready timeout followed by cancel/cleanup/idle. The one-per-team 90-second disconnect pause and 180-second reconnect grace need a separate closed ranked scenario: full tests intentionally skip automatic disconnect/abandon. Full-test results carry no ELO or penalties. Automated agent, broker and GameDLL tests do not replace these checks or ten-client acceptance. The earlier client crash cause remains unestablished.

Rollback only on an empty, unleased server using the saved image and immutable prior controller. Keep the current spool, events and recovery state; never restore an older database over new events.
