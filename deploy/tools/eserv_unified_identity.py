#!/usr/bin/env python3
"""One-time, offline migration of the verified WAW2 test server to shared ID 100.

Run node first, then panel. A private snapshot and the stopped old container are
retained for rollback. Does not remove game data or change network allocations.
"""
import argparse
import copy
import fcntl
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import subprocess
import time

NODE = '0089c856-8a20-42db-add8-6ac31ac3fe2f'
KEY = '672d65449310710b0174371296bd231d'
FLEET = '18243657-2860-40a9-b2ee-03d287bf3407'
OLD, NEW = 9, 100


def run(*args):
    return subprocess.check_output(args, text=True).strip()


class DockerConnection(http.client.HTTPConnection):
    def __init__(self):
        super().__init__('localhost', timeout=90)

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect('/var/run/docker.sock')


def docker_api(route, data):
    connection = DockerConnection()
    try:
        connection.request('POST', route, json.dumps(data), {'Content-Type': 'application/json'})
        response = connection.getresponse()
        body = response.read()
        if response.status not in (200, 201, 204):
            raise RuntimeError('Docker migration request failed: ' + str(response.status))
        return json.loads(body) if body else {}
    finally:
        connection.close()


def snapshot_db(source, target):
    with sqlite3.connect(source) as db, sqlite3.connect(target) as backup:
        db.backup(backup)


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')
    path.chmod(0o600)


def migrate_database(db, container_id, container_name):
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('BEGIN IMMEDIATE')
    db.execute('PRAGMA defer_foreign_keys=ON')
    references = []
    for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
        assert re.fullmatch(r'[a-zA-Z0-9_]+', table)
        for ref in db.execute(f'PRAGMA foreign_key_list("{table}")').fetchall():
            if ref[2] == 'game_servers':
                assert ref[4] == 'id' and re.fullmatch(r'[a-zA-Z0-9_]+', ref[3])
                references.append((table, ref[3]))
        columns = [r[1] for r in db.execute(f'PRAGMA table_info("{table}")')]
        if 'server_id' in columns and (table, 'server_id') not in references:
            references.append((table, 'server_id'))
    for table, column in references:
        db.execute(f'UPDATE "{table}" SET "{column}"=? WHERE "{column}"=?', (NEW, OLD))
    result = db.execute('UPDATE game_servers SET id=?,docker_container_id=?,docker_container_name=? WHERE id=? AND runtime_uuid=?',
                       (NEW, container_id, container_name, OLD, KEY))
    assert result.rowcount == 1
    db.execute("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='game_servers'", (NEW,))
    assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    db.commit()
    return references


def node_migration(root, dest):
    agent = f'gp-{NODE}-agent-1'
    db_path = root / 'data/game-panel.db'
    old_dir, new_dir = root / 'servers/9', root / 'servers/100'
    with sqlite3.connect(db_path) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute('SELECT * FROM game_servers').fetchall()
        assert len(rows) == 1 and rows[0]['id'] == OLD and rows[0]['runtime_uuid'] == KEY
        row = dict(rows[0])
        runtime = json.loads(row['runtime_config_json'] or '{}')
        assert not runtime.get('nativeOperation') and not runtime.get('nativeInterrupted')
    assert old_dir.is_dir() and not old_dir.is_symlink() and not new_dir.exists()
    assert not list(old_dir.glob('.*restore*'))
    for filename in old_dir.glob('.backup-jobs/*.json'):
        assert json.loads(filename.read_text()).get('status') != 'running'
    # There were no SFTP accounts at audit time. Stop if that changes instead of
    # silently migrating a live account or overwriting credentials.
    with sqlite3.connect(root / 'data/sftpgo/sftpgo.db') as sftp:
        assert sftp.execute('SELECT COUNT(*) FROM users').fetchone()[0] == 0
    original = json.loads(run('docker', 'inspect', row['docker_container_id']))[0]
    assert original['Config']['Labels']['gamepanel.serverId'] == str(OLD)
    assert original['Config']['Labels']['gamepanel.node'] == NODE
    assert len(original['NetworkSettings']['Networks']) == 1
    assert not original['HostConfig'].get('AutoRemove')
    save(dest / 'container-before.json', original)
    save(dest / 'server-before.json', row)
    nginx = Path('/etc/nginx/sites-available/waw2.eserv.pl')
    shutil.copy2(nginx, dest / 'nginx-before.conf')
    fastdl = root / 'data/fastdownload'
    shutil.copy2(fastdl / '9.json', dest / 'fastdownload-before.json')
    new_container = None
    moved = False
    committed = False
    was_running = original['State']['Running']
    try:
        run('docker', 'stop', agent)
        run('docker', 'stop', '--time', '30', original['Id'])
        for filename in old_dir.glob('.backup-jobs/*.json'):
            assert json.loads(filename.read_text()).get('status') != 'running'
        snapshot_db(db_path, dest / 'game-panel-before.db')
        print('Creating offline game-data backup', flush=True)
        run('tar', '--numeric-owner', '-czf', str(dest / 'server-9.tar.gz'), '-C', str(root / 'servers'), '9')
        run('tar', '-tzf', str(dest / 'server-9.tar.gz'))
        # Dry-run every database reference update on the snapshot before mutation.
        test_db = dest / 'migration-check.db'
        shutil.copy2(dest / 'game-panel-before.db', test_db)
        with sqlite3.connect(test_db) as check:
            migrate_database(check, 'preflight', 'preflight')
        old_dir.rename(new_dir)
        moved = True
        configuration = new_dir / 'data/serverfiles/cstrike/server.cfg'
        content = configuration.read_bytes()
        before = b'https://waw2.eserv.pl/fdl/srv9/'
        if before in content:
            configuration.write_bytes(content.replace(before, b'https://waw2.eserv.pl/fdl/srv100/'))
        (fastdl / '9.json').rename(fastdl / '100.json')
        state = json.loads((fastdl / '100.json').read_text())
        state['assets'] = {}
        save(fastdl / '100.json', state)
        name = re.sub(r'-9$', '-100', original['Name'].lstrip('/'))
        assert name != original['Name'].lstrip('/')
        payload = copy.deepcopy(original['Config'])
        payload['Image'] = original['Image']
        payload['Labels']['gamepanel.serverId'] = '100'
        payload['HostConfig'] = copy.deepcopy(original['HostConfig'])
        binds = payload['HostConfig'].get('Binds') or []
        assert len(binds) == 1 and binds[0].startswith(str(old_dir) + '/')
        payload['HostConfig']['Binds'] = [b.replace(str(old_dir) + '/', str(new_dir) + '/', 1) for b in binds]
        new_container = docker_api('/containers/create?name=' + name, payload)['Id']
        with sqlite3.connect(db_path) as db:
            references = migrate_database(db, new_container, name)
        committed = True
        text = nginx.read_text()
        marker = ' server_name waw2.eserv.pl;'
        assert text.count(marker) == 2
        text = text.replace(marker, marker + '\n # Compatibility for the pre-migration FastDL URL.\n rewrite ^/fdl/srv9(/.*)?$ /fdl/srv100$1 last;')
        nginx.write_text(text)
        run('nginx', '-t')
        run('systemctl', 'reload', 'nginx')
        # Keep the old container for rollback, but never restart it automatically.
        run('docker', 'update', '--restart=no', original['Id'])
        if was_running:
            run('docker', 'start', new_container)
        run('docker', 'start', agent)
        current = json.loads(run('docker', 'inspect', new_container))[0]
        assert current['State']['Running'] == was_running
        save(dest / 'result.json', {'oldId': OLD, 'newId': NEW, 'runtimeKey': KEY,
             'container': new_container, 'references': references, 'running': was_running,
             'backup': str(dest / 'server-9.tar.gz')})
        print(json.dumps({'migrated': NEW, 'running': was_running, 'backup': str(dest)}), flush=True)
    except Exception:
        # All rollback operations are confined to this server and its snapshots.
        if new_container:
            subprocess.run(['docker', 'rm', '-f', new_container], check=False, capture_output=True)
        if committed:
            snapshot_db(dest / 'game-panel-before.db', db_path)
        if moved:
            configuration = new_dir / 'data/serverfiles/cstrike/server.cfg'
            # Restore the exact original config from the offline archive.
            run('tar', '-xzf', str(dest / 'server-9.tar.gz'), '-C', str(dest), '9/data/serverfiles/cstrike/server.cfg')
            shutil.copy2(dest / '9/data/serverfiles/cstrike/server.cfg', configuration)
            new_dir.rename(old_dir)
        shutil.copy2(dest / 'fastdownload-before.json', fastdl / '9.json')
        (fastdl / '100.json').unlink(missing_ok=True)
        shutil.copy2(dest / 'nginx-before.conf', nginx)
        subprocess.run(['nginx', '-t'], check=False)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=False)
        run('docker', 'update', '--restart=' + original['HostConfig']['RestartPolicy']['Name'], original['Id'])
        if was_running:
            run('docker', 'start', original['Id'])
        run('docker', 'start', agent)
        raise


def panel_migration(root, dest):
    container = 'gamepanel-pro-backend'
    db_path = root / 'data/game-panel.db'
    run('docker', 'stop', container)
    try:
        snapshot_db(db_path, dest / 'game-panel-before.db')
        with sqlite3.connect(db_path) as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT node_id,runtime_id,runtime_key FROM fleet_servers WHERE id=?', (FLEET,)).fetchone()
            assert row == (NODE, 9, KEY) or row == (NODE, 100, KEY)
            assert db.execute('SELECT server_id FROM fleet_server_numbers WHERE number=28').fetchone() == (FLEET,)
            assert db.execute('SELECT 1 FROM fleet_server_numbers WHERE number=100').fetchone() is None
            # Retain the retired number as a tombstone; preserve UUID-based grants.
            db.execute('UPDATE fleet_server_numbers SET server_id=? WHERE number=28', ('retired:' + FLEET,))
            db.execute('INSERT INTO fleet_server_numbers(number,server_id) VALUES(100,?)', (FLEET,))
            db.execute('UPDATE fleet_servers SET runtime_id=100,placement_revision=placement_revision+1 WHERE id=?', (FLEET,))
            db.execute('INSERT INTO fleet_identity_reservations(node_id,runtime_key,fleet_id) VALUES(?,?,?)', (NODE, KEY, FLEET))
            db.execute("UPDATE sqlite_sequence SET seq=MAX(seq,100) WHERE name='fleet_server_numbers'")
            assert db.execute('PRAGMA foreign_key_check').fetchall() == []
            db.commit()
        save(dest / 'result.json', {'panelId': 100, 'runtimeId': 100, 'nextIdAtLeast': 101, 'fleetUuid': FLEET})
        print(json.dumps({'migrated': 100, 'backup': str(dest)}))
    finally:
        run('docker', 'start', container)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['node', 'panel'])
    args = parser.parse_args()
    os.umask(0o077)
    root = Path('/srv/gamepanel-agent' if args.phase == 'node' else '/opt/gamepanel-pro')
    with (root / '.unified-id-migration.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        dest = root / 'identity-migrations' / ('id-100-' + time.strftime('%Y%m%d-%H%M%S'))
        dest.mkdir(parents=True, exist_ok=False)
        (node_migration if args.phase == 'node' else panel_migration)(root, dest)


if __name__ == '__main__':
    main()
