# CS 1.6 match rules audit — WWW 0.7.6 / controller 0.6.4

## Findings and implementation

- The signed assignment and result settlement already read `mq2_matches.rules`, independently of the current ladder rules. MR12 final-score validation therefore worked mathematically; the native contract previously rejected MR12. Controller 0.6.4 is the required native update.
- Added narrow backend validation: CS 1.6 5v5 permits MR12/MR15; 2v2 permits MR8; overtime remains MR3. Unrelated game rules are unchanged.
- `Engine::setLadderRules` changes only the ladder rules for future match creation, retains the existing ladder/ranking identity and enabled flag, and writes one audit record. It never rewrites existing matches, tickets, claims, generations, leases or history. Catalog installation preserves saved settings. MR15 remains the initial 5v5 default.
- The existing serialized database transaction prevents match creation from observing a partial rules edit. Match creation freezes the rules before ready/veto. Existing ready, live and historical matches retain their format and configuration hash when the administrator switches the default.
- MR12 server selection requires an authenticated fresh controller observation at version 0.6.4 or later, in addition to the existing ranked capability checks. The gate is checked before reserving a generation/lease and again before issuing `load` in both veto flows. A downgrade during veto cancels through the normal abort/release path with a safe `unsupported_rules` message; it does not apply ELO or penalties or delete history.
- Full tests accept an optional MR12/MR15 override, without modifying the public ladder. A repeated create request cannot silently change an active test's format. The capability is rechecked when starting the lobby.
- Solo tests accept the same optional override on 5v5-capable servers; 2v2 stays MR8. The selected rules are retained in test details and the hashed load assignment.
- The admin HTTP action requires existing matchmaking administrator authorization and an integer JSON MR value. The solo endpoint retains its existing admin and CSRF checks.
- The round-statistics endpoint accepts only decimal query round numbers 1 through 400; arrays, signs, decimal fractions and zero are rejected.

## Verification

Passed on SQLite and the isolated MariaDB database `mq2_test_audit_063`:

- `tests/match_rules.php`: supported/invalid formats, default retention, no public queue enable, idempotent audit, capability and stale-observation gates, frozen configuration/hash across default switches and worker reconstruction, downgrade during veto, MR12/MR15/MR8 regulation and repeated MR3 final-score validation, rejected ties, 180-second postmatch grace, full/solo overrides, retry immutability, admin authorization and strict JSON input.
- Regression suites: `run.php`, `test_matches.php`, `server_tests.php`, `game_readiness.php`, `post_match_grace.php`.
- PHP syntax checks for every changed backend/controller file and the new test.

The database test fixture is allowlisted and isolated. No production database rules, public pool eligibility, game binary, journal, generation or history were changed by this audit.

Native runtime/Steam acceptance belongs to the controller's separate release evidence. These PHP tests are not evidence of a real Steam-client gameplay test.
