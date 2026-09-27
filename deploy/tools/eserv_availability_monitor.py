#!/usr/bin/env python3
"""Independent WAW1 availability probe. Secrets belong in a root-only config."""
import json
import os
from pathlib import Path
import time
import urllib.request

STATE = Path('/var/lib/eserv-monitor/state.json')


def transition(state, healthy, now):
    state = dict(state)
    state['successes'] = state.get('successes', 0) + 1 if healthy else 0
    state['failures'] = state.get('failures', 0) + 1 if not healthy else 0
    state['checkedAt'] = now
    old = state.get('status', 'ok')
    status = 'down' if state['failures'] >= 3 else 'ok' if state['successes'] >= 2 else old
    event = None
    if status != old:
        event = {'status': status, 'at': now, 'since': state.get('since', now)}
        state['since'] = now
    state['status'] = status
    return state, event


def save(state):
    temporary = STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps(state))
    os.replace(temporary, STATE)


def probe():
    try:
        for url in ['https://eserv.pl/', 'https://eserv.pl/api/health']:
            request = urllib.request.Request(url, headers={'User-Agent': 'eserv-availability-monitor/1'})
            with urllib.request.urlopen(request, timeout=10) as response:
                body = response.read(262144)
                if response.status != 200:
                    return False
                if url.endswith('/api/health'):
                    if json.loads(body).get('status') != 'healthy':
                        return False
                elif b'id="root"' not in body:
                    return False
        return True
    except (OSError, ValueError):
        return False


def main():
    import fcntl
    os.umask(0o077)
    STATE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE.parent / 'lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        config = json.loads(Path('/etc/eserv-availability-monitor.json').read_text())
        try:
            previous = json.loads(STATE.read_text())
        except FileNotFoundError:
            previous = {}
        state, event = transition(previous, probe(), int(time.time()))
        # Persist before sending. An uncertain response must not cause duplicates.
        if event:
            state['lastDelivery'] = {'state': 'sending', **event}
        save(state)
        if event:
            title = 'eserv.pl: panel niedostępny' if event['status'] == 'down' else 'eserv.pl: dostęp do panelu przywrócony'
            body = {'content': title + '\nNiezależny monitoring z WAW1. Kontrola strony i API.', 'allowed_mentions': {'parse': []}}
            request = urllib.request.Request(config['webhook'] + '?wait=true', data=json.dumps(body).encode(),
                                             headers={'Content-Type': 'application/json', 'User-Agent': 'eserv-monitor/1'})
            try:
                with urllib.request.urlopen(request, timeout=10) as response:
                    state['lastDelivery']['state'] = 'delivered' if response.status in (200, 204) else 'failed'
            except OSError:
                state['lastDelivery']['state'] = 'unknown'
            save(state)
        print(json.dumps({'status': state['status'], 'failures': state['failures'], 'checkedAt': state['checkedAt'], 'transition': bool(event)}))


if __name__ == '__main__':
    main()
