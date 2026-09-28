# MatchBot CSCO 0.4.1 — automated acceptance and ESERV handoff

2026-09-28. Follow-up to `artifacts/mixqueue-040/MATCHBOT-040-ACCEPTANCE.md`.
SRV-107 was NOT changed by this task. WWW 0.5.2 was deployed on csco.gg / WAW1.
Controller 0.4.1 is supplied for the ESERV worker's reviewed installation.

## Artifact identity

- Controller SHA-256: `f0062c2ce1915a193830dadcb3a4b3efabf052cd6654bdf3a75cb4ae8bf4b6bb`.
- Agent remains byte-identical 0.4.0 / protocol 2:
  `f28b4b6c4fb754bd08fdf4517095b97f0ff3b0a3589ce2c6a9b929e118d558d3`.
- Old ESERV 0.4.0 ZIP remains
  `3391084d268696a65a89c69e461c71eefdba7c42b4151fe7618b28fcc5717629`.
- New archives have independent versioned names and manifests. Their internal
  SHA256SUMS include the corresponding GPL source, dependencies and test scripts.

## Isolated game-engine results — PASS

WAW1 `/opt/csco-lab/matchbot-041`, container `mq2-matchbot-041-qa`, Docker network
`none`, loopback-only UDP 27095. ReHLDS 3.15.0.896 / ReGameDLL 5.30.0.814 /
Metamod-r 1.3.0.149. QA controls create fake clients and invoke real GameDLL damage,
round transitions and empty-side lifecycle. They are excluded from production.

- `reconnect-solo`, `reconnect-2v2`, `reconnect-5v5`: disconnect an entire logical
  side, observe the real engine becoming unstarted, return the same identities,
  retain assignment/generation, prior round events, stats and reconnect money,
  and continue scoring. One loaded/live event and unique journal event IDs.
  Ordinary round loss rewards may change the balance after it has been restored;
  reconnect does not revive the player during a round or restore weapons/health.
- Each reconnect scenario starts with the actual LO3 clock, no acceleration:
  approximately 22.4 seconds including the freeze; `restarts_completed=3`.
  Interrupted LO3 returns to warmup and can be restarted with /ready.
- Menu hooks suppress team/class VGUI and legacy menus, including the interval
  before a Steam identity resolves. Buy/admin menu hooks pass. Manual team/class
  commands do not alter assigned side or position. Final menu changes received
  targeted engine regression coverage; real-client rendering remains below.
- `abandon`: real clock, no acceleration of the policy timers. Observed pause
  89.99 s and subsequent grace 179.88 s (polling resolution). Exactly one abandon
  event. Late return is admitted without clearing the penalty; surrender is
  unavailable with a full present team. After the abandoned player leaves again,
  2/4 does not pass, 3/4 passes. Duplicate/opponent votes do not contribute. One
  surrender event, no second finished event; ordinary clear releases assignment.
- `match`: 40 real elimination rounds, regulation 15:15, first overtime 3:3,
  second overtime 4:0; final 22:18. Exactly 200 kills, 200 deaths, 20,000 damage,
  40 rounds per player, one final event. Halves, repeated OT and cleanup pass.
- `lifecycle`: interrupted startup, repeated /ready, tactical pause/resume and
  unsolicited `sv_restart` quarantine pass.
- `recovery-direct`, `recovery-map`, process arm/restart/verify: direct complete
  reset, unexpected map change and game-process restart all quarantine. They
  never resume live from a marker. Normal cleanup and stale-generation rejection
  still work. Active markers/journals were not manually removed to recover.
- Final production binary: loads natively, reports 0.4.1, healthy/idle; compiled
  default `mb_log_tag` is CSCO.GG; no `mq2_qa` command; signed-shape solo assignment
  reaches warmup/rules_ready, clears normally, then rejects its old generation.
- Pure C++ contract suite and 15 unchanged-agent tests pass.

## WWW / agent integration — PASS

- 32 core tests, native statistics tests, session demo isolation tests and the
  new disconnect/surrender suite pass on SQLite and MariaDB.
- Actual engine journal (24 events) passes through the unchanged agent's durable
  spool, a spool restart and retries. Events retain causal ordering and receive
  protocol sequence numbers. Replaying that output into the independent web
  engine succeeds on SQLite and MariaDB: penalty, surrender, profile and ELO.
- Reconnect clears a pending absence with no penalty. Abandon creates one global
  1800-second queue penalty. Duplicate event IDs and distinct duplicate abandon
  observations do not extend it. Teammates are not penalized.
- Rejected early/duplicate/foreign/insufficient votes produce no settlement.
  Late return keeps the cooldown but removes the missing-player surrender condition.
- Surrender at 8:2 records team 2 as winner, preserves the played score and marks
  team 1 as losing in match/profile/history. Ten zero-sum ELO changes occur once.
- Additive tables `mq2_disconnects`, `mq2_match_results`; existing data preserved.
  Backup: `/var/backups/csco-mq2/20260928-211932-before-web-052`.
  Deployment uses privileged CLI migration; web DB permissions were not expanded.
  Flute cache/template clear, PHP reload and worker health check pass.
- PHP syntax/Mago formatting/lint pass the configured error threshold (existing
  style warnings remain); generated PL/EN JS checks pass. Desktop and 390px mobile
  screenshots verify reconnect/surrender information; no page horizontal overflow.
  Live csco.gg session preview and profile smoke pass without real match/ELO writes.

## Remaining human acceptance

This does not identify or certify a fix for the original client crash. It fixes
the demonstrated server-side reconnect consequence. The ESERV worker must install
0.4.1 on the empty, unleased SRV-107 and repeat actual Steam solo/reconnect: initial
and returning menus, three visible restarts, HUD/TAB, /score and stable client play.
Ten-human-player acceptance, objective wins (bomb/time/elimination), /dmg, /timeout,
side changes and end-to-end actual-match statistics/ELO remain release gates.
Public queues were not enabled. Read `ESERV-0.4.1-HANDOFF.md` before installation.
