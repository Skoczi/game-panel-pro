# WWW 0.6.0 migration

Back up the current module, assets, runtime symlink and csco_mq2 before deployment.
Stop the matchmaking worker during migration and activation. Copy the module and
public assets, then run Store::migrate() against the existing database with the
migration account. module/database/schema.sql uses additive CREATE IF NOT EXISTS;
Store::migrate also creates the new indexes idempotently. Do not grant DDL to the
normal public web account just for installation.

New tables: mq2_test_matches, mq2_test_bots, mq2_test_invites, mq2_test_tombstones,
mq2_player_preferences, mq2_match_labels. No drop/reset and no historical deletion.
Publish new cs16/agent 0.5.0 ZIP files and merge downloads/manifest.json, preserving
all published old files and hashes. Source bridge stays 0.4.0.

Point the worker to the new runtime; run Flute cache:clear and template:clear as
the web user, reload PHP-FPM and restart the worker. Verify authenticated admin,
private downloads, normal profile/ranked and unchanged public queue settings.
Test creation will remain disabled until heartbeat confirms native/agent 0.5.0.

Do not restore an older DB or spool to recover a failed deployment. Preserve new
state and pending events. Do not downgrade to WWW that rejects test_ended while
native 0.5.0 sessions/events remain active; disable new tests and fix forward.
The read-only SystemTest preview remains separate from real test matches.
