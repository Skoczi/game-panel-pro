# MatchBot CSCO + agent 0.5.1 / WWW 0.6.5

Follow-up to the real Steam acceptance of 0.5.0. New immutable packages; no
replacement of 0.4.0, 0.4.1 or 0.5.0 files. WWW advances from the actual deployed
0.6.4, preserving the ready dialog, sound, lobby and collapsed admin test tools.

## TAB / hostname

The controller now sends the registered GoldSrc `ServerName` user message with
reliable `MSG_ONE` to joined human clients when the phase/name changes, and once
on each roster join/reconnect. It also bounds the GameDLL's sign-on/HUD-refresh
ServerName message so it cannot overwrite the compact header with a long name.
No polling flood: unchanged titles do not trigger another phase broadcast.

The header uses a conservative legacy budget of **31 UTF-8 bytes plus NUL**.
Both team labels are shortened independently at code-point boundaries, retaining
the phase and @CSCO.gg. The browser retains the longer hostname. Finished tests
show FINISHED while awaiting cleanup. Cleanup, deactivation and recovery restore
the saved original cvar; its client header is bounded by the same budget.
No binds, client settings or Score-column localization are changed.

Protocol basis: [ReGameDLL SendMOTDToClient](https://github.com/rehlds/ReGameDLL_CS/blob/master/regamedll/dlls/multiplay_gamerules.cpp)
and [ForceClientDllUpdate](https://github.com/rehlds/ReGameDLL_CS/blob/master/regamedll/dlls/player.cpp)
send ServerName separately from the hostname cvar. The visual result still needs
a **real Steam client** acceptance; engine/unit checks are not that acceptance.

## Installed maps and load errors

Agent 0.5.1 attaches `map_inventory` to authenticated observations:

```json
{"version":1,"source":"bsp_v30","complete":true,"maps":["de_dust2","de_inferno","de_nuke"]}
```

It scans `<game_root>/maps/de_*.bsp` on each status observation, checks readable
regular files, GoldSrc BSP version 30, the 15 lump ranges and nonempty data.
This verifies local BSP presence/header integrity; it does **not** certify WADs,
map entities or gameplay. PAK-only maps are excluded. No extra RCON calls are
needed. Missing/unreadable inventory returns complete=false, never a configured
map-name fallback. The report is limited to 256 maps; overflow fails closed.

WWW requires an observation from the last 30 seconds. CS 1.6 solo options use
configured ∩ installed maps. Ranked and full-test veto use ladder ∩ configured ∩
installed maps. At least three are required; an even pool drops its last map in
ladder order so alternating bans remain fair. The pool is frozen at match creation,
refreshed before locking a test lobby, and the final map is checked again before
dispatch. The UI displays only this match's candidates and already vetoed maps.
Missing inventory blocks **new** CS 1.6 allocations/tests until the updated agent
reports it. Existing accepted matches and cleanup remain supported.

Native mq2_load distinguishes missing_map, malformed_assignment and storage_failure;
invalid command syntax remains invalid_assignment. Rejections before activation
do not emit loaded or advance the high-water mark. Write/persist failure still
enters recovery when necessary. Agent also maps legacy invalid_config/load_failed
to safe codes, checks local map presence immediately before loading, and publishes
configuration atomically without overwriting an accepted assignment.

Successful RCON submission never emits loaded. Only the controller journal's
loaded event with matching identity/map/config hash confirms success. Known
rejections are durably spooled once per command as load_rejected with a safe code.
Unknown output, timeouts and lost replies remain ambiguous and retry normally.
WWW advertises `load_rejection_contract:1` in poll responses; an older WWW never
receives an unknown rejection event. ESERV's custom runner must use Agent.dispatch
as described in the handoff, not call adapter.execute directly.

Safe codes: missing_map, malformed_assignment, storage_failure,
inventory_unavailable, server_busy, stale_generation, server_not_empty. WWW
shows PL/EN explanations, cancels preparation and performs normal abort/idle
release. No RCON text, private paths or secrets become user-facing errors.
Delayed loaded/rejection events drain without reviving a cancelled match or
cancelling journal-confirmed gameplay. Generations and all history remain intact.

## StatsX compatibility

`statsx.amxx` registers /stats and /score and can preempt the controller before
`ReGameDLL_InternalCommand` is called. ESERV confirmed that disabling only that
exact plugin fixed both commands on SRV-107 without restart. Preserve the reviewed
exact-name conflict list addition on WAW1/WAW2 and its backup. Keep unrelated AMXX
plugins enabled; do not disable AMXX globally. Native Score-column wording belongs
to the client; controller /stats and /score provide K/D/A.

## Rollout and rollback

WWW 0.6.5 first, then reviewed ESERV agent/controller 0.5.1 installation on an idle
instance. WWW needs no schema migration. Native restart and executor image rebuild/
container recreation are required. Preserve broker boundaries, keys, spool,
journal, generation, assignment marker and original-hostname.txt. Do not add a
second agent or loosen recovery. Do not enable public pool eligibility.

If reverting binaries, do so only idle; do not restore an old spool/history over
new events. Do not downgrade WWW while a new load_rejected event remains pending.
Agent 0.5.0 lacks map_inventory, so WWW 0.6.5 intentionally blocks new CS 1.6
allocations after that rollback. Never fabricate inventory to bypass the gate.
