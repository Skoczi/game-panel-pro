#!/usr/bin/env python3
"""Forced-command backup exporter. No caller-controlled paths or shell arguments.

Root-owned /etc/eserv-backup-export.json selects this host's installation.
Stdout is an archive containing consistent SQLite, private config and exact images.
"""
import fcntl
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time


def main():
    os.umask(0o077)
    config = json.loads(Path('/etc/eserv-backup-export.json').read_text())
    root = Path(config['root']).resolve()
    assert root in [Path('/opt/gamepanel-pro'), Path('/srv/eserv-agent'), Path('/srv/gamepanel-agent')]
    with (root / '.release-channel.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with tempfile.TemporaryDirectory(prefix='eserv-export-', dir='/var/tmp') as temporary:
            stage = Path(temporary)
            compose = json.loads((root / 'compose.json').read_text())
            services = config['services']
            assert services in [['backend', 'frontend'], ['agent']]
            for filename in ['compose.json', 'release.json', 'backend.env', 'runtime.env']:
                if (root / filename).is_file(): shutil.copy2(root / filename, stage / filename)
            if (root / 'identity').is_dir(): shutil.copytree(root / 'identity', stage / 'identity')
            shutil.copytree(root / 'data', stage / 'data', ignore=shutil.ignore_patterns('game-panel.db', 'game-panel.db-wal', 'game-panel.db-shm', 'game-panel.db-journal'))
            with sqlite3.connect('file:' + str(root / 'data/game-panel.db') + '?mode=ro', uri=True) as source:
                with sqlite3.connect(stage / 'data/game-panel.db') as backup:
                    source.backup(backup)
                    assert backup.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            nginx = Path('/etc/nginx/sites-enabled/eserv.pl')
            if services == ['backend', 'frontend'] and nginx.is_file(): shutil.copy2(nginx, stage / 'nginx-eserv.conf')
            images = [compose['services'][service]['image'] for service in services]
            image_info = json.loads(subprocess.check_output(['docker', 'image', 'inspect', *images]))
            subprocess.run(['docker', 'image', 'save', '-o', str(stage / 'images.tar'), *images], check=True, stdout=sys.stderr)
            manifest = {'schema': 1, 'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'root': str(root),
                'services': services, 'images': [{'reference': reference, 'id': info['Id']} for reference, info in zip(images, image_info)],
                'sqliteIntegrity': 'ok', 'gameFilesIncluded': False, 'tlsCertificatesIncluded': False}
            (stage / 'manifest.json').write_text(json.dumps(manifest, indent=2))
            with tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz') as archive:
                for file in sorted(stage.iterdir()): archive.add(file, arcname=file.name)


if __name__ == '__main__': main()
