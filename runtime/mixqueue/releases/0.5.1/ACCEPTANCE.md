# Acceptance register — 0.5.1 follow-up

## Real Steam evidence received from ESERV for 0.5.0

- SRV-107: `7e570088b8c2b140455501d7`, generation 8, de_nuke. One real
  Steam player + nine bots; ready, veto, map change, three restarts, normal
  rounds, 2:0. Owner /endtest preserved partial score and player statistics,
  completed idle/lease release, no ELO and no new participant penalty.
  Polish ASCII admin-end kick confirmed readable by the user.
- The same test had stale WARMUP in TAB despite LIVE chat/browser hostname.
  This is the new 0.5.1 visual acceptance target, not a heartbeat issue.
- /stats and /score began working immediately after pausing only statsx.amxx.
  ESERV then made the reviewed exact-plugin exclusion persistent on WAW1/WAW2
  and SRV-107. Other AMXX plugins were preserved.
- `7e5700ea6f5abc934b52c221`, generation 7: de_tuscan absent, invalid_config,
  no loaded; WWW cancelled and released normally, retained history. Subsequent
  de_nuke loaded on first attempt.
- Separate WWW End test `7e570053352575c28e5b39a4`, generation 9, de_nuke:
  warmup, no real Steam client, finish_test and cleanup first-attempt ack,
  0:0 retained, lease released, no ELO/penalty. Not a second gameplay test.

## 0.5.1 technical checks (not Steam acceptance)

- Production Linux i386 build; no mq2_qa command in the released binary.
- C++ contract tests: conservative 31-byte header, phase/brand/both labels,
  UTF-8 boundaries including Polish and four-byte characters; existing roster,
  generations, map syntax, MR/OT and test-only bot checks retained.
- 27 Python tests: immutable spool/order, cleanup retries and foreign assignment
  protection, BSP inventory, actual rescan after removal, malformed/truncated BSP,
  explicit mq2_load rejection codes, ambiguous/timeout responses, missing-map
  preflight, safe storage failure, deduplicated rejection spool and old-WWW gating.
- PHP regression suites: matching/party/ELO lifecycle, solo/full-test policies,
  permissions, timeouts, statistics, preview isolation, disconnect policy.
- New PHP checks: missing/stale/malformed inventory; verified odd subset; only
  actual candidates rendered; all safe rejection codes; idempotence; late loaded
  drain; loaded authority; removed-after-veto cancellation; abort/idle lease release;
  ranked and solo inventory gates; unchanged generation/history, no test ELO/penalty.
- Isolated `/opt/csco-lab/matchbot-051`, network=none, production binary:
  storage_failure for missing assignment file, malformed_assignment for bad file,
  missing_map for absent BSP, no loaded event or generation consumption on those
  pre-activation rejections. Successful full-test warmup with nine bots, retry,
  test_ended snapshot, FINISHED browser hostname, normal cleanup and original name.
- Actual isolated process restart: recovery quarantine held, new load refused,
  original hostname restored, normal cleanup verified idle, high-water retained.
  This is **process recovery**, not a player reconnect test.

## Still required on real Steam / target installation

1. Install the exact manifest hashes and verify runtime/controller 0.5.1 plus
   the authenticated map_inventory report; preserve disabled public eligibility.
2. Repeat 1+9 on installed de_nuke. Keep TAB open through warmup → three restarts
   → LIVE; verify prefix changes without reconnect/binds/client setting changes.
3. Reconnect the real player during LIVE: current TAB title, same team, preserved
   result and stats; verify no repeated title-message flood or forced team menu.
4. Exercise pause/resume, finish/cleanup and recovery hostname restoration.
   Verify long Polish/multibyte names remain readable, clipped without broken bytes.
5. Verify /stats and /score with only reviewed conflicting AMXX plugins disabled.
6. Check veto excludes absent Tuscan. In an isolated test, remove the final BSP
   after inventory/veto; safe error on WWW, normal abort/idle release, history kept.

NOT accepted by this report: player reconnect/crash fix, 2+8 with real users,
English kick rendering, every rejection/expiry/recovery case on Steam, ten-real-
client match. The earlier client crash cause remains unestablished. Synthetic
PHP rosters and engine bots do not establish any of these real-client claims.
