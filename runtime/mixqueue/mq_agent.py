#!/usr/bin/env python3
"""Durable local game agent. Python 3.11+, no third-party dependencies."""
import hashlib
import hmac
import json
import logging
import os
from pathlib import Path
import re
import socket
import sqlite3
import struct
import sys
import time
import urllib.request
import uuid


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


class Spool:
    def __init__(self, path):
        self.boot = uuid.uuid4().hex
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript("CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,body TEXT NOT NULL,sent INTEGER DEFAULT 0); CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT NOT NULL);")

    def put(self, event):
        with self.db:
            old = self.db.execute("SELECT body FROM events WHERE id=?", (event['event_id'],)).fetchone()
            if old:
                previous=json.loads(old[0])
                for key in ('schema_version','sequence','boot_id'): previous.pop(key,None)
                if previous != event: raise ValueError("Event ID conflict in local journal")
                return
            key='sequence:'+str(event.get('match_id','test'))+':'+str(event.get('generation',0))
            row=self.db.execute('SELECT value FROM state WHERE key=?',(key,)).fetchone()
            sequence=(json.loads(row[0]) if row else 0)+1
            body=encode({**event,'schema_version':1,'sequence':sequence,'boot_id':self.boot})
            self.db.execute("INSERT OR IGNORE INTO events(id,body) VALUES(?,?)", (event['event_id'], body))
            self.db.execute('INSERT INTO state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,encode(sequence)))

    def get(self, key, default=None):
        row = self.db.execute("SELECT value FROM state WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set(self, key, value):
        with self.db:
            self.db.execute("INSERT INTO state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, encode(value)))

    def flush(self, send):
        # Preserve causal ordering. A rejected event remains visible and blocks later events.
        for rowid, body in self.db.execute("SELECT rowid,body FROM events WHERE sent=0 ORDER BY rowid LIMIT 100").fetchall():
            send({'action': 'event', 'event': json.loads(body)})
            with self.db:
                self.db.execute("UPDATE events SET sent=1 WHERE rowid=?", (rowid,))

    def tail(self, path):
        path = Path(path)
        if not path.exists():
            raise RuntimeError("Bridge journal is missing; server is not healthy")
        stat = path.stat()
        key = 'tail:' + str(path.resolve())
        state = self.get(key, {'offset': 0, 'inode': stat.st_ino})
        if state['inode'] != stat.st_ino or stat.st_size < state['offset']:
            raise RuntimeError("Journal replaced/truncated. Recover unacknowledged records before resetting cursor.")
        with path.open('rb') as stream:
            stream.seek(state['offset'])
            for _ in range(1000):
                line = stream.readline()
                if not line or not line.endswith(b'\n'):
                    break  # A partially written record is retried next time.
                event = json.loads(line)
                self.put(event)  # Persist event BEFORE advancing the cursor.
                state['offset'] = stream.tell()
                self.set(key, state)


class SourceRcon:
    def __init__(self, host, port, password):
        self.host, self.port, self.password = host, port, password

    @staticmethod
    def packet(request_id, kind, text):
        body = struct.pack('<ii', request_id, kind) + text.encode() + b'\0\0'
        return struct.pack('<i', len(body)) + body

    @staticmethod
    def receive(stream):
        def read(size):
            value = b''
            while len(value) < size:
                block = stream.recv(size - len(value))
                if not block:
                    raise ConnectionError('Incomplete RCON response')
                value += block
            return value
        size = struct.unpack('<i', read(4))[0]
        if not 10 <= size <= 1048576:
            raise ValueError('Invalid RCON packet length')
        data = read(size)
        return (*struct.unpack('<ii', data[:8]), data[8:-2].decode('utf-8', 'replace'))

    def command(self, command):
        if '\n' in command or '\r' in command or '\0' in command:
            raise ValueError('Unsafe command')
        with socket.create_connection((self.host, self.port), timeout=5) as stream:
            stream.sendall(self.packet(1, 3, self.password))
            for _ in range(3):
                rid, kind, _ = self.receive(stream)
                if rid == -1:
                    raise PermissionError('RCON authentication failed')
                if rid == 1 and kind == 2:
                    break
            else:
                raise ConnectionError('RCON auth response missing')
            stream.sendall(self.packet(2, 2, command))
            # mq2_status responses are deliberately below one Source packet.
            rid, _, body = self.receive(stream)
            if rid != 2:
                raise ConnectionError('Unexpected RCON response')
            return body.strip()


class Get5Adapter:
    def __init__(self, config, spool):
        self.config, self.spool = config, spool
        self.root = Path(config['game_root']).resolve()
        self.rcon = SourceRcon(config.get('rcon_host', '127.0.0.1'), int(config['rcon_port']), os.environ[config['rcon_password_env']])

    def status(self):
        raw = self.rcon.command('mq2_status')
        value = json.loads(raw)
        if value.get('bridge') != 1:
            raise RuntimeError('MixQueue2 SourceMod bridge is not installed')
        return {**value, 'agent_protocol': 2}

    @staticmethod
    def cleanup_complete(status):
        # An empty/malformed response or a quarantined controller is not proof.
        return (status.get('matchid') == '' and status.get('idle') is True
                and status.get('healthy') is True)

    def cleanup(self, command, status):
        # Retry may arrive after clear succeeded but its RCON reply was lost.
        # Confirm the fresh idle observation instead of clearing the server again.
        if not self.cleanup_complete(status):
            try:
                self.rcon.command('mq2_clear')
            except Exception:
                # Transport outcome is ambiguous. Only an independent status
                # read can prove completion; otherwise preserve the failure.
                if not self.cleanup_complete(self.status()):
                    raise
            else:
                if not self.cleanup_complete(self.status()):
                    return
        self.spool.put({'event_id': 'idle-' + command['id'], 'match_id': command['match_id'],
                        'generation': int(command['generation']), 'type': 'idle', 'data': {}})

    @staticmethod
    def build(payload):
        if payload['game'] not in ('csgo', 'csco') or not re.fullmatch(r'de_[a-z0-9_]+', payload['map']):
            raise ValueError('Unsupported Source match')
        size = int(payload['team_size'])
        if payload['rules'].get('test'):
            raise ValueError('Solo tests are not supported by the Source adapter yet')
        if size not in (2, 5) or len(payload['players']) != size * 2:
            raise ValueError('Invalid roster size')
        if len({p['steam_id'] for p in payload['players']}) != size * 2:
            raise ValueError('Duplicate Steam identity across teams')
        teams = {}
        for team in (1, 2):
            roster = {p['steam_id']: p['name'] for p in payload['players'] if int(p['team']) == team}
            if len(roster) != size or any(not re.fullmatch(r'7656119\d{10}', steam) for steam in roster):
                raise ValueError('Invalid Steam roster')
            teams['team' + str(team)] = {'name': 'Team ' + str(team), 'players': roster}
        return {'matchid': payload['match_id'] + ':' + str(payload['generation']), 'num_maps': 1, 'skip_veto': True,
                'wingman': size == 2, 'players_per_team': size, 'min_players_to_ready': size, 'coaches_per_team': 0,
                'maplist': [payload['map']], 'map_sides': ['knife'], 'side_type': 'always_knife', **teams,
                'cvars': {'mp_maxrounds': int(payload['rules']['mr']) * 2, 'mp_overtime_enable': 1,
                          'mp_overtime_maxrounds': int(payload['rules']['ot_mr']) * 2, 'mp_overtime_startmoney': 10000,
                          'get5_check_auths': 1, 'get5_kick_when_no_match_loaded': 1, 'get5_stop_command_enabled': 0}}

    def execute(self, command):
        match_id, generation = command['match_id'], int(command['generation'])
        if not re.fullmatch(r'[a-f0-9]{24}', match_id) or generation < 1:
            raise ValueError('Invalid assignment')
        assignment = match_id + ':' + str(generation)
        status = self.status()
        active = status.get('matchid', '')
        if active and active != assignment:
            raise RuntimeError('Server holds another assignment; refusing to overwrite it')
        if command['type'] == 'load':
            payload = command['payload']
            if payload['match_id'] != match_id or int(payload['generation']) != generation or payload['game'] != self.config['game']:
                raise ValueError('Command assignment mismatch')
            if self.config['game'] == 'csco' and not self.config.get('verified_build'):
                raise RuntimeError('Classic Offensive build must pass compatibility checks')
            if not active:
                relative = 'addons/sourcemod/configs/mq2/' + match_id + '-' + str(generation) + '.json'
                path = self.root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                contents = encode(self.build(payload))
                # Never overwrite a configuration associated with an existing assignment.
                if path.exists() and path.read_text(encoding='utf-8') != contents:
                    raise RuntimeError('Immutable configuration conflict')
                with path.open('w', encoding='utf-8') as stream:
                    stream.write(contents); stream.flush(); os.fsync(stream.fileno())
                expected = path.parent / 'expected.txt'
                temporary = expected.with_suffix('.tmp')
                with temporary.open('w', encoding='utf-8') as stream:
                    stream.write(assignment + ' ' + payload['map'] + ' ' + payload['config_hash'] + '\n'); stream.flush(); os.fsync(stream.fileno())
                temporary.replace(expected)
                self.rcon.command('get5_loadmatch ' + relative)
            # The journal bridge emits loaded only after map change and reads the Get5 identity.
        elif command['type'] in ('abort', 'cleanup'):
            self.cleanup(command, status)
        else:
            raise ValueError('Unsupported command')


class GoldSrcRcon:
    def __init__(self, host, port, password):
        if any(c in password for c in '\r\n"\0'):
            raise ValueError('RCON password contains unsupported wire characters')
        self.host, self.port, self.password = host, port, password

    def command(self, command):
        if not re.fullmatch(r'[a-z0-9_ :.-]+', command):
            raise ValueError('Unsafe GoldSrc command')
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as stream:
            stream.settimeout(5)
            stream.connect((self.host, self.port))
            stream.send(b'\xff\xff\xff\xffchallenge rcon\n')
            challenge = stream.recv(4096)
            match = re.search(rb'challenge rcon (-?\d+)', challenge)
            if not match:
                raise ConnectionError('GoldSrc RCON challenge missing')
            request = 'rcon ' + match[1].decode() + ' "' + self.password + '" ' + command + '\n'
            stream.send(b'\xff\xff\xff\xff' + request.encode())
            data = stream.recv(65535)
            if not data.startswith(b'\xff\xff\xff\xffl'):
                raise ConnectionError('Unexpected GoldSrc response')
            return data[5:].rstrip(b'\0\n').decode('utf-8', 'replace').strip()


class AmxxAdapter(Get5Adapter):
    def __init__(self, config, spool):
        self.config, self.spool = config, spool
        self.root = Path(config['game_root']).resolve()
        self.rcon = GoldSrcRcon(config.get('rcon_host', '127.0.0.1'), int(config['rcon_port']), os.environ[config['rcon_password_env']])

    @staticmethod
    def build(payload):
        if payload['game'] != 'cs16' or not re.fullmatch(r'de_[a-z0-9_]+', payload['map']):
            raise ValueError('Invalid GoldSrc match')
        size = int(payload['team_size'])
        test = payload['rules'].get('test') is True
        count = len(payload['players'])
        if size not in (2, 5) or count != (1 if test else size * 2):
            raise ValueError('Invalid roster')
        lines = [f"{payload['match_id']} {payload['generation']} {payload['map']} {size} {payload['rules']['mr']} {payload['rules']['ot_mr']} {payload['config_hash']} {1 if test else 0}"]
        seen = set()
        teams = {1: 0, 2: 0}
        for player in payload['players']:
            steam = player['steam_id']
            if not re.fullmatch(r'7656119\d{10}', steam) or steam in seen:
                raise ValueError('Invalid Steam ID')
            account = int(steam) - 76561197960265728
            if not 0 <= account <= 4294967295:
                raise ValueError('Steam account out of range')
            team = int(player['team'])
            if team not in teams:
                raise ValueError('Unknown team')
            teams[team] += 1
            seen.add(steam)
            lines.append(f'STEAM_0:{account % 2}:{account // 2} {steam} {team}')
        if teams != ({1: 1, 2: 0} if test else {1: size, 2: size}):
            raise ValueError('Unbalanced roster')
        return '\n'.join(lines) + '\n'

    def execute(self, command):
        match_id, generation = command['match_id'], int(command['generation'])
        if not re.fullmatch(r'[a-f0-9]{24}', match_id) or generation < 1:
            raise ValueError('Invalid assignment')
        status = self.status()
        assignment = match_id + ':' + str(generation)
        active = status.get('matchid', '')
        if active and active != assignment:
            raise RuntimeError('Foreign server assignment')
        if command['type'] == 'load':
            if not status.get('healthy', False):
                raise RuntimeError('CS 1.6 recovery quarantine')
            version = str(status.get('controller_version', ''))
            if (status.get('controller') != 'matchbot'
                    or not re.fullmatch(r'\d+\.\d+\.\d+', version)
                    or tuple(map(int, version.split('.'))) < (0, 4, 0)):
                raise RuntimeError('MatchBot CSCO 0.4.0 or later is required')
            if active:
                return
            p = command['payload']
            if p['rules'].get('test') is True and status.get('solo_test') is not True:
                raise RuntimeError('Controller does not support solo tests')
            if p['match_id'] != match_id or int(p['generation']) != generation:
                raise ValueError('Payload assignment mismatch')
            path = self.root / 'addons/amxmodx/configs/mq2' / (match_id + '-' + str(generation) + '.txt')
            path.parent.mkdir(parents=True, exist_ok=True)
            content = self.build(p)
            if path.exists() and path.read_text(encoding='utf-8') != content:
                raise RuntimeError('Immutable configuration conflict')
            with path.open('w', encoding='utf-8') as stream:
                stream.write(content); stream.flush(); os.fsync(stream.fileno())
            self.rcon.command(f'mq2_load {match_id} {generation}')
        elif command['type'] in ('abort', 'cleanup'):
            self.cleanup(command, status)
        else:
            raise ValueError('Unsupported command')


class Agent:
    def __init__(self, config):
        self.config = config
        self.key = os.environ[config['key_env']]
        if len(self.key) < 32 or not config['api'].startswith('https://'):
            raise ValueError('HTTPS and a strong agent key are required')
        self.spool = Spool(config['database'])
        adapters = {'get5': Get5Adapter, 'amxx': AmxxAdapter}
        self.adapter = adapters[config['adapter']](config, self.spool)

    def send(self, body):
        raw = encode(body).encode()
        stamp = str(int(time.time()))
        signature = hmac.new(self.key.encode(), (self.config['server_id'] + '\n' + stamp + '\n').encode() + raw, hashlib.sha256).hexdigest()
        request = urllib.request.Request(self.config['api'], data=raw, headers={'Content-Type': 'application/json', 'X-MQ-Server': self.config['server_id'], 'X-MQ-Time': stamp, 'X-MQ-Signature': signature})
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    def step(self):
        healthy = False
        status = {}
        try:
            status = self.adapter.status()
            if not status.get('healthy', True):
                raise RuntimeError('Controller is in recovery quarantine')
            self.spool.tail(self.config['journal'])
            self.spool.flush(self.send)
            healthy = True
        except Exception:
            logging.exception('Bridge/transport unhealthy; assignment disabled')
        response = self.send({'action': 'poll', 'healthy': healthy, 'observation': status})
        # Abort and cleanup remain possible even if an earlier event is quarantined.
        for command in response['commands']:
            if healthy or command['type'] != 'load':
                self.adapter.execute(command)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    with open(sys.argv[1], encoding='utf-8') as stream:
        agent = Agent(json.load(stream))
    while True:
        try:
            agent.step()
        except Exception:
            logging.exception('Agent cycle failed; retrying without discarding events')
        time.sleep(2)
