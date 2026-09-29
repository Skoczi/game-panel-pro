# Agent 0.5.0

Python 3.10+, standard library only. New assignment v2 and finish_test support;
HMAC signing protocol remains 2. Adapter name remains amxx.

ESERV: replace runtime/mixqueue/mq_agent.py through the existing installer,
rebuild the executor image and recreate its container. Do not install another
standalone service next to the current supervisor/runner/broker. Preserve the
private configuration, journal, spool, server identity and generation.

Standalone hosts only: place agent/mq_agent.py in /opt/csco-matchmaking/ and adapt
deploy/mq2-agent.service to the game service user and directories. Download the
private configuration from WWW Setup. Save its agent object to /etc/mq2/agent.json
and environment KEY=value entries to /etc/mq2/agent.env (0600). Never publish them.
Read/write access to game assignment/journal and spool directories is required.
The package has no credentials and performs no installation automatically.

Run tests from the package root: python3 -m unittest discover -s tests -p test_agent.py.
Install WWW >=0.6.0 before full tests. Game controller >=0.5.0 is required for
full_test; old ranked/solo contracts remain backward compatible.
