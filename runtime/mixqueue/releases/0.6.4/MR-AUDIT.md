# CS 1.6 MatchBot 0.6.4 — MR12/MR15 audit

## Scope and contract

The assignment parser accepts only 5v5 MR12 or MR15, or 2v2 MR8. Overtime remains MR3 for every supported format. This applies to the legacy wire header and contract v2/v3, to ranked and solo tests, and to the existing v2/v3 full-test path. Full tests still require signed test ownership, the reserved test ID prefix, a valid roster and captains; MR12 does not relax those checks.

Agent 0.6.1 already serializes the signed `rules.mr` without changing its value and reports the controller version. No agent API, journal schema, protocol or capability flag was added. WWW must require controller >= 0.6.4 before assigning MR12; MR15 and MR8 keep their existing eligibility conditions. Assignment contract 3, optional v2/v1 handling and stats version 2 are unchanged.

## Findings and changes

1. `MatchCSCOContract.h` previously forced 5v5 to MR15. It now uses one narrow `match_format(size,mr,ot)` allowlist. Wingman MR12/MR15 and 5v5 MR8/arbitrary values remain rejected.
2. `Ready()` already configured regulation as signed MR × 2. This now uses the shared `assignment_format_rules()` for regulation, overtime and overtime mode, so the setter and guard use the same policy.
3. The audit found that `mb_play_rounds`, `mb_play_rounds_ot` and `mb_play_ot_mode` were not monitored, although upstream MatchBot's transition logic reads these cvars. They are now checked against the signed assignment. A mismatch is included in the existing drift guard and is also rejected immediately before state transitions, scored round endings and engine round restarts. The controller enters recovery; it does not silently overwrite the mismatch, reload the match or reset scores.
4. `MatchBot.cpp` regulation halftime, second-half winner, tie, team/score swapping, ready/menu and timer paths derive their boundaries from the guarded regulation cvar. `RoundEnded()` and the winner authority use signed `config.mr`. No extra hardcoded 15/30 boundary needs replacing. Upstream idle defaults and archived sample configs remain defaults; a signed assignment overrides them before warmup.
5. Overtime halftime uses current-overtime played rounds rather than total regulation+OT rounds. It remains exact MR3 halves for MR8, MR12 and MR15, including repeated tied overtimes. The winner check takes precedence over halftime.
6. Three starting restarts are independent of regulation length. The existing 20-second halftime/before-overtime clock, logical team assignment, tactical/reconnect separation, final-result retention and original-hostname recovery are preserved.
7. Chat tie and overtime announcements derive the actual score and signed OT length. TAB/hostname derive phase and signed team names, with existing byte/UTF-8 bounds, so no MR15-specific title or announcement remains.
8. Recovery re-parses the stored assignment through the same allowlist and keeps the active marker, generation high-water and journal. MR12 adds no crash-resume bypass. New runtime artifacts retain the existing isolated lab directory and never target SRV-107.

## Native changes

- `games/cs16/matchbot/MatchBot/MatchCSCOContract.h`
- `games/cs16/matchbot/MatchBot/MatchCSCOSafety.h`
- `games/cs16/matchbot/MatchBot/MatchCSCO.h`
- `games/cs16/matchbot/MatchBot/MatchCSCO.cpp`
- `tests/cs16_contract_test.cpp`
- `tests/cs16_break_test.cpp`
- `tests/cs16_safety_test.cpp`
- `bin/build-matchbot.sh`
- New integration harnesses: `tests/cs16_formats_064_runtime.py`, `tests/cs16_064_release_smoke.py`.

QA-only `round-clock` additionally reports signed MR, OT MR and effective regulation/OT cvars. That command remains absent from production.

## Verification completed before isolated runtime

Seven C++ suites pass with AddressSanitizer and UndefinedBehaviorSanitizer: contract, feedback, safety, statistics, native bots, halftime break, postmatch end. See `unit-tests.log`.

The contract suite covers the size/MR/OT matrix, legacy/v2/v3 ranked and solo/full paths, both starting sides, rejection of unsupported combinations and missing captains/players, regulation winner thresholds for MR8/MR12/MR15, and four repeated MR3 periods in both winner directions. Break tests cover three tied overtime periods for each regulation format; existing identity, captain voting, damage, statistics, bot NAV, scoped clock and postmatch tests remain green.

Linux 32-bit QA and production builds succeeded using the existing pinned Docker builder. No build errors; existing upstream compiler warnings remain visible in the build logs.

- QA SHA-256: `c7a77c900547081d5332326319745531f602413855ce47b27f07b807ac549387`
- Production SHA-256: `af5ed8c138180a7614be80dc981b10d878a19e9dfe9e16549adcd9ffa711ca31`
- Unchanged agent 0.6.1 source SHA-256: `2f14a107c210ae69d65a85ea3614c66c854b52ee6dcf3ea6ccb7dd72b027970a`

The real Steam 2+8/10-client acceptance remains separate. Isolated GameDLL QA entities and production warmup/recovery smoke are not a substitute. Final runtime results are recorded in `formats-064-proof.json` and `production-064-proof.json` only after successful completion.

## Integration harness correction

The initial run completed MR12 19:15 and MR15 16:0, then stopped on an MR8 initial-freeze assertion. The fixture had read `!LO3` from an old warmup snapshot and `FIRST_HALF` from a separate query one second later, after LO3 began. It therefore sampled the previous postmatch clock before the real restarts. The GameDLL's `RestartRound()` re-reads multiplayer cvars and restores the correct intro/round clocks; a subsequent independent observation showed MR8 120 seconds, freeze 8 seconds, healthy LIVE and score 0:0.

The harness now checks state, freeze, LO3 and completed-three-restart count in one atomic `break-clock` response. It resumes only the unfinished MR8/drift cases, retaining the two successful cases and recording the interrupted attempt/history. This correction changes no production source or binary hash. `runtime-initial.log` retains the original failure; `runtime-resumed.log` records the continuation.

## Final isolated runtime results

All six QA cases completed with the exact QA hash above. MR12 ran through 12:12, a tied 15:15 first overtime and a natural 19:15 final result. It produced 34 completed-round player snapshots with ten roster members each and one `finished` event. Five actual 20-second intermissions passed with PL/EN messages, frozen play, unchanged score/timeout budgets and blocked early continuation. The natural final result armed the existing 180-second retention deadline; this release did not repeat the previous release's full wall-clock 180-second wait.

Regulation regression matches completed MR15 16:0 and Wingman MR8 9:0, each with the actual 20-second halftime. All three format-cvar mutations (`mb_play_rounds`, `mb_play_rounds_ot`, `mb_play_ot_mode`) entered recovery before another round could be scored. Each retained the completed 1:0 result and refused another load until normal cleanup.

The production binary passed clientless MR8 warmup and MR12 full-test warmup with nine native bots, effective 24/6 regulation/OT cvars, safe rejection of unsupported 5v5 formats, storage/config/map rejection diagnostics, idempotent load, single test-end snapshot, hostname/bot-state cleanup and stale-generation refusal. An actual isolated process restart with an MR12 assignment entered recovery; it refused reload, restored the original hostname and accepted normal cleanup without resetting the generation high-water.

The exact network-none container `mq2-matchbot-063-profile` was stopped after final idle/healthy verification. Final generation is 118. All selected QA events remain in the append-only journal; the test attempt interrupted by the harness assertion also remains preserved. No SRV-107 binary, public queue, production match history or production lease was modified.

Final build gate: `var/acceptance-064/release-proof.json`. Detailed runtime, production, installation, stopped-state, source and build evidence are indexed there by SHA-256. These checks do not establish real Steam-client, two-human-captain or ten-human acceptance for 0.6.4.
