# Agent 0.5.1

Python 3.10+, standard library only. HMAC protocol 2 and assignment contract 2
are unchanged. Adapter name remains `amxx` for the native MatchBot controller.
Install WWW >=0.6.5 before this agent; use the matching controller 0.5.1.

ESERV: use the reviewed universal installer. Replace runtime/mixqueue/mq_agent.py,
rebuild the executor image and recreate its container. Do not start a second
service alongside the supervisor/runner/broker. Preserve credentials, server_id,
game_root, journal, spool.sqlite and generation/active/original-hostname files.

The custom runner must dispatch commands through
`agent.dispatch(command, response.get('load_rejection_contract', 0))`, preserving
the existing healthy/load guard. Pass the authenticated map_inventory observation
and sequenced load_rejected events through the broker. See PROMPT-ESERV.md and
RELEASE-CS16-0.5.1.md for the exact contract and safe codes. Journal flush must
continue during recovery. Only the loaded journal event confirms successful load.

The executor needs read-only access to its actual `<game_root>/maps/*.bsp`.
Inventory is rescanned on each observation, with no extra RCON requests. Never
substitute configured map names or another game server's directory. This release
checks BSP presence/header ranges; it does not certify WAD dependencies/playability.
WWW blocks new CS 1.6 allocations until a fresh verified inventory arrives.

Standalone hosts only: install agent/mq_agent.py in /opt/csco-matchmaking/ and adapt
deploy/mq2-agent.service to the game service user and directories. Download the
private configuration from WWW Setup. Save its agent object to /etc/mq2/agent.json
and environment KEY=value entries to /etc/mq2/agent.env (0600). Do not publish them.
Read/write access to assignment/journal and spool directories is required.
The package contains no credentials and does not install anything automatically.

Run `python3 -m unittest discover -s tests -p 'test_agent*.py'` from the package root.
Downgrade only while idle, keeping durable state and acknowledging pending new
events first. Agent 0.5.0 lacks inventory support; WWW 0.6.5 will block new CS 1.6
allocation after rollback. Never relax recovery or invent inventory to bypass it.
