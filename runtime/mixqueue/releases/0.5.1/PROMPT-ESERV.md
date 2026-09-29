# ESERV — reviewed upgrade to MatchBot CSCO / agent 0.5.1

Use this new package and manifest, never replace the 0.5.0 release contents.
WWW is 0.6.5 after the CSCO deployment; retain its newer 0.6.4 UI improvements.
WAW1/WAW2 universal installer/runtime, initial real Steam acceptance on SRV-107.
Keep public pool eligibility disabled and all match history.

1. Verify ZIP SHA-256, embedded manifest and per-file SHA256SUMS.txt. Install the
   production controller and runtime/mixqueue/mq_agent.py from this release.
   Preserve server_id, credentials, broker, supervisor, isolation and durable state.
   No second agent. No new network rights or arbitrary-command RCON allowance.
2. **Custom runner change required:** the reviewed runner currently invokes
   `agent.adapter.execute(command)`. Replace only that dispatch call with
   `agent.dispatch(command, response.get('load_rejection_contract', 0))`.
   Keep existing healthy/load guard. Agent.dispatch persists safe explicit load
   rejections once per command; it never emits loaded. Return from dispatch is
   submission only. Keep journal draining/flush working while controller recovery
   is unhealthy, so errors and cleanup can reach WWW. Preserve safe log codes.
3. Pass map_inventory from `AmxxAdapter.status()` through the broker heartbeat.
   Confirm the executor can **read** the actual `<game_root>/maps/*.bsp` (read-only
   mount is sufficient). Do not substitute configured map names or a directory from
   another server. Rescan on each observation; never reuse stale inventory while
   reporting a new heartbeat. No additional RCON poll is needed for inventory.
4. Review broker schema/size allowlists for poll `load_rejection_contract:1`,
   observation `map_inventory` (version/source/complete/maps), and event
   `load_rejected` with data.code. Codes are explicitly enumerated in the release
   document. Keep authentication, match/generation fencing, replay/order checks.
   WWW accepts errors via the normal signed, sequenced event envelope. Unknown
   RCON replies/timeouts must not become explicit rejections or success.
5. Rebuild executor image and recreate its container. Install on an idle game
   instance with a normal reviewed backup; restart the game to load the new .so.
   Preserve spool.sqlite, events.jsonl, generation-matchbot.txt, active-matchbot.txt,
   original-hostname.txt and any existing recovery marker. Never reset them to
   make the UI green. Normal cleanup releases a lease only after verified idle.
6. Keep the existing reviewed exact-name AMXX conflict list, including
   mq2_match.amxx and the already confirmed **statsx.amxx** exclusion. Keep other
   AMXX plugins. ReGameDLL_InternalCommand is downstream of AMXX command handling.
   Native TAB Score localization stays client-owned; /stats and /score expose K/D/A.
7. Verify controller_version=0.5.1, agent_version=0.5.1, agent_protocol=2,
   assignment_contract=2, full_test=true and healthy/rules_ready/idle=true when
   empty. WWW 0.6.5 blocks new CS 1.6 tests until verified inventory arrives.
8. Run real Steam TAB acceptance: installed de_nuke, 1+9, keep TAB open over three
   restarts and LIVE. Verify current title after join/reconnect, bounded UTF-8,
   pause/resume/end; original hostname after cleanup/recovery. No client settings.
9. Check excluded maps and safe missing-map failure on a controlled isolated test.
   Retain partial results/history, generations and all original acceptance evidence.
10. Report exact runtime/controller hashes, real client observations, map inventory,
    dispatch integration and lease release. Do not claim 2+8, reconnect, English
    kicks, all expiry/recovery cases or ten-client acceptance without doing them.

Included tests/test_agent.py and tests/test_agent_051.py run with unittest discover.
Included headless smoke is hard-limited to /opt/csco-lab/matchbot-051 and is not
intended to be pointed at SRV-107. The real client crash cause remains unknown.

Rollback: idle only, restore binaries through reviewed install. Keep new durable
events and generations; do not downgrade WWW until new events are acknowledged.
Rolling back to agent 0.5.0 removes inventory support and therefore blocks new
CS 1.6 allocation in WWW 0.6.5. Do not loosen that check to force eligibility.
