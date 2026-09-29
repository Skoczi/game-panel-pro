# WWW 0.7.6 — cumulative round snapshots

Implemented files:

- `module/Domain/RoundSnapshots.php`: opt-in projection from accepted events for the exact assigned server, match and generation. Only complete V2 cumulative statistics are available. Stable locked-roster Steam identities are used internally and projected into public user IDs; no Steam IDs, raw events, sequence values or transport metadata enter the response.
- `module/Http/Application.php`: optional sixth `state` argument, `round_snapshot` only when requested; existing test-match authorization runs first. Safe `ladders[].rules = {mr, ot_mr}`. Strict integer/admin checks for `ladder_rules` and optional `test_create.mr`.
- `module/Domain/DemoDataset.php`: optional fourth state argument and deterministic synthetic rounds. Final player statistics and requested snapshots derive from the same cumulative ledger; round kills/deaths balance between teams and MR15/MR12/MR8 are represented. Synthetic state never writes to the database.
- `tests/round_snapshots.php`: projection, real API, test authorization, and synthetic consistency coverage.

API:

```json
{"round_snapshot":{"number":8,"score":[5,3],"available":true,"players":[{"user_id":"public-user-id","stats":{},"metrics":{}}]}}
```

Missing or legacy data returns `available:false, players:[]`; it is never interpolated from final statistics. Administrative cancellations also return unavailable because cancellation has no authoritative terminal game event separating applied snapshots from drained late observations. Terminal finished/test_ended/surrendered events stop the projection. Duplicate observations cannot overwrite the first observation for a completed round; score rollback and foreign identities/generations are excluded.

Verification:

- SQLite `round_snapshots.php`: all four groups pass, including the final cancelled/nonmonotonic-score guards.
- SQLite existing `round_timeline.php` and `system_test.php`: pass.
- MariaDB all four snapshot groups and both existing suites: pass. Backend agent reran the final snapshot suite after the cancelled/nonmonotonic-score guards; pass on both MariaDB and SQLite.
- PHP lint: all three changed source files pass.
- Peak memory across the full snapshot test (several synthetic datasets): 28 MiB.

Root owns browser acceptance, routing integration, assets/locales and publication. This task made no production changes.
