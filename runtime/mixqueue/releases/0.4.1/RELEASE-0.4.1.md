# MatchBot CSCO 0.4.1 / ESERV

Controller 0.4.1, unchanged Python agent 0.4.0 (protocol 2), requires WWW 0.5.2.
Linux i386, glibc 2.36+. ReHLDS 3.15.0.896 / ReGameDLL 5.30.0.814 /
Metamod-r 1.3.0.149. GPL-3.0 corresponding source and build scripts are in the
CS1.6 package; QA binaries are excluded.

## Reconnect and gameplay

The observed empty-side GameDLL lifecycle can resume the signed roster without
calling its complete-reset routine. Score, counters, generation, sequence and
money remain associated with the assignment/Steam identity. External live
sv_restart/sv_restartround, direct complete resets and unexpected map/process
restarts still quarantine. No active marker or event spool is reset to repair a match.

Team/class menus are filtered by their exact VGUI type or legacy localization
key. Jointeam/joinclass/chooseteam cannot respawn or move an already assigned
player. Buy and other menu types pass through. Default chat tag is [CSCO.GG],
without a second [CSCO] prefix; console diagnostic codes retain their namespace.
LO3 announces each completed Restart 1/3, 2/3, 3/3 in chat, console and HUD.

## Disconnect / abandon policy (ranked CS1.6 only)

- 90 seconds of technical pause at the next round's freeze period.
- Then 180 seconds to reconnect; the match continues during this grace period.
- A return before expiry cancels that player's deadline. Overlapping absences
  share the active technical pause. A continuous absence is not paused every round.
- Expiry emits one abandon event. WWW blocks new queues for exactly 1800 seconds,
  across games, including party queues; teammates receive no abandon cooldown.
- Late return to the same match remains possible. It does not erase the cooldown.
- When a teammate has abandoned and is still absent, /ff starts a 30-second vote.
  /yes, /no or keys 1/2 vote. Strict majority: 3/4, 2/3, 2/2, 1/1. Initiator votes yes.
  Opponents/duplicates cannot contribute. Disconnection removes a yes vote but
  does not shrink the electorate. An abandon/late return changing eligibility
  cancels the vote. Retry cooldown: 120 seconds.
- Surrender preserves the actual played score and records an explicit winner.
  A team surrendering while leading still loses. WWW settles ELO once.
- Solo tests have no abandon cooldowns or surrender votes.

Agent transport, HMAC identity, journal/config paths and generation contract are
unchanged. Install WWW before the controller so new journal events are understood.
Existing 0.4.0 archives must remain immutable; rollback must not replay an old spool.

## Acceptance boundary

See the accompanying acceptance report for exact automated evidence. Isolated
engine QA uses controlled fake clients and real GameDLL transitions. A real Steam
client must still confirm the initial/reconnect menu, HUD, TAB, score and stability.
The original client crash cause has not been identified; this release addresses
its observed server-side reconnect consequence. Public queues remain gated on
real-client acceptance, including a full ten-player match and objective wins.
