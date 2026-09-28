# MixQueue2 0.4.0 — MatchBot CSCO

CS 1.6 uses a native Metamod controller based on MatchBot 1.0.6, with a CSCO
assignment and event adapter. The older mq2_match.amxx is superseded.
Get5 / SourceMod gameplay for CS:GO and Classic Offensive is unchanged.

## Implemented

- Immutable Steam roster, forced logical teams, generation fencing, durable journal.
- Warmup, all-player ready, three restarts, live rounds, halves, MR15/MR8,
  repeated MR3 overtime with 10 000 $, score in TAB/chat and per-player stats.
- Join/reconnect handling without repeatedly assigning a living player to a team.
- Tactical and missing-player pauses, interrupted-start recovery, quarantine after
  process restart, unexpected map change or external live-round restart.
- Isolated solo test with one static opponent and no ELO/penalties; result in admin UI.
- Idempotent cleanup after lost RCON replies; stale generations cannot resurrect matches.
- WWW and agent require MatchBot CSCO >=0.4.0 for new CS 1.6 assignments.
  Existing transport name `amxx`, journal/config paths and HMAC protocol are preserved.

The fork fixes upstream cvar storage incompatible with Metamod ownership lookup,
player-stat array dimensions and a null player dereference in team pauses.
CSCO integration allows engine restart events without scoring them, measures actual
HP loss including fatal hits and journals the final hit before the round snapshot.

## Validation

Isolated Linux server, no public networking, ReHLDS 3.15.0.896,
ReGameDLL 5.30.0.814, Metamod-r 1.3.0.149.
QA clients use the actual GameDLL join/spawn/damage/death/round-win paths.
The harness advances scheduled clocks; it does not inject round or finished events.
Its client identity mapping exists only in the QA binary, excluded from the release.

- 5v5: 40 real engine rounds; 15:15 regulation, 18:18 first overtime, 22:18 final.
  Verified one live event, one finish, logical score through side changes,
  200 kills, 200 deaths, 20 000 damage and 40 rounds per player.
- 2v2: map change to de_nuke, MR8 finish at 9:0, reconnect preserves statistics,
  18 kills and 1 800 damage.
- Lifecycle: disconnect during three-restart startup returns to warmup; ready
  restarts correctly; tactical pause resumes; an external live restart quarantines.
- Solo: a static opponent, stable living-player position after ready, a real 1:0
  round, 1 kill / 100 damage against the opponent, cleanup and rejection of a stale assignment.
- The 52 actual events from the 40-round journal replay into a fresh CS 1.6 backend
  fixture: score/statistics preserved, ten ELO ledger entries, duplicate finish ignored,
  lease released after the agent's confirmed idle. Fixture identifiers are rebound;
  this is not a live-host ELO acceptance test.
- Python agent: 15 regression tests; PHP domain: 32; solo admin: 5;
  SQLite concurrent processes: 6 scenarios. Locale generation and JS syntax checked.
- Runtime logs and deployment status are recorded in CS16-IMPLEMENTATION.md.

## Deployment and limits

Linux i386 binary only, glibc >=2.36. Full GPL-3.0 corresponding source and notices
are included in the CS 1.6 package. ReHLDS/ReGameDLL archives are referenced with
official URLs and SHA-256; installers must preserve local configuration.

SRV-107 deployment is handed off to the ESERV chat. Automated fake clients do not
certify Steam network authentication, a human's view of HUD/TAB, bomb interaction,
voice, latency, demos or compatibility with the target server's other plugins.
A real-client solo check and human 5v5 acceptance remain necessary before public play.
Interrupted live matches are quarantined, not resumed from an invented round state.
No automatic forfeit or GOTV/HLTV service was added.
