"""ESERV adapter: no network, credentials or arbitrary command execution in this container."""
import http.client
import json
import os
from pathlib import Path
import socket
import time
import mq_agent

class UnixHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(15)
        self.sock.connect('/broker/agent.sock')

def broker(action, value):
    connection = UnixHTTP('localhost', timeout=15)
    try:
        connection.request('POST', '/' + action, json.dumps(value), {'Content-Type':'application/json'})
        response = connection.getresponse()
        body = response.read(1048577)
        if response.status != 200 or len(body) > 1048576:
            raise RuntimeError('broker_rejected')
        return json.loads(body)
    finally:
        connection.close()

class Rcon:
    def command(self, command):
        return broker('rcon', {'command':command})['result']

def cycle(agent):
    state = {'checkedAt':int(time.time()*1000),'rcon':False,'journal':False,'heartbeat':False,
             'bridgeHealthy':False,'idle':False,'ready':False,'error':None}
    observation = {}
    try:
        observation = agent.adapter.status()
        state['rcon'] = True
        state['bridgeHealthy'] = observation.get('healthy', True) is True
        state['idle'] = observation.get('idle', False) is True and not observation.get('matchid')
    except Exception:
        state['error'] = 'rcon_or_plugin'
    try:
        agent.spool.tail(agent.config['journal'])
        state['journal'] = True
        agent.spool.flush(agent.send)
    except Exception:
        state['error'] = 'journal_or_events'
    healthy = state['rcon'] and state['journal'] and state['bridgeHealthy'] and state['error'] is None
    # Classic Offensive needs an explicit compatibility attestation, never inferred from a process.
    healthy = healthy and (agent.config['game'] != 'csco' or bool(agent.config.get('verified_build')))
    try:
        response = agent.send({'action':'poll','healthy':healthy,'observation':observation})
        state['heartbeat'] = True
        for command in response['commands']:
            if healthy or command['type'] != 'load':
                agent.adapter.execute(command)
        state['ready'] = healthy and state['idle']
    except Exception:
        state['error'] = 'matchmaking_or_command'
    state['ready'] = state['ready'] and state['error'] is None
    return state

def main():
    os.umask(0o077)
    config = json.loads(Path('/broker/config.json').read_text())
    # Upstream constructors expect these names. Real secrets remain exclusively in the broker.
    os.environ['MQ2_AGENT_KEY'] = 'broker-only-placeholder-0000000000000000'
    os.environ['MQ2_RCON_PASSWORD'] = 'broker-only'
    agent = mq_agent.Agent(config)
    agent.adapter.rcon = Rcon()
    agent.send = lambda body: broker('matchmaking', body)
    previous = None
    events = []
    try:
        events = json.loads(Path('/state/events.json').read_text())[-49:]
    except Exception:
        pass
    while True:
        state = cycle(agent)
        temporary = Path('/state/status.next')
        temporary.write_text(json.dumps(state))
        temporary.replace('/state/status.json')
        marker = (state['rcon'],state['journal'],state['heartbeat'],state['ready'],state['error'])
        if marker != previous:
            # Allowlisted codes only: never upstream exceptions, responses, player names or credentials.
            event = {'time':state['checkedAt'],'event':state['error'] or ('ready' if state['ready'] else 'waiting')}
            print(json.dumps(event),flush=True)
            events = (events + [event])[-50:]
            event_file = Path('/state/events.next')
            event_file.write_text(json.dumps(events))
            event_file.replace('/state/events.json')
            previous = marker
        time.sleep(3)

if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Container logs are visible to operators; never include upstream exception contents.
        print(json.dumps({'time':int(time.time()*1000),'event':'executor_failed'}), flush=True)
        raise SystemExit(1)
