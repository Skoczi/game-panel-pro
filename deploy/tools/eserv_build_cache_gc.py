#!/usr/bin/env python3
"""FR1: prune only unused build cache older than 24h; retain images/volumes."""
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request


def run(*args): return subprocess.check_output(args, text=True).strip()


def state():
    ids = run('docker', 'ps', '-q').split()
    return {c['Id']: c['State']['StartedAt'] for c in json.loads(run('docker', 'inspect', *ids))}


def main():
    os.umask(0o077)
    with open('/opt/gamepanel-pro/.release-channel.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = state(); images = set(run('docker', 'image', 'ls', '-q', '--no-trunc').split())
        volumes = set(run('docker', 'volume', 'ls', '-q').split()); free = shutil.disk_usage('/').free
        with urllib.request.urlopen('http://127.0.0.1:18081/api/health', timeout=5) as response: assert response.status == 200
        result = run('docker', 'buildx', 'prune', '--force', '--filter', 'until=24h', '--max-used-space', '8GB', '--reserved-space', '2GB')
        assert state() == before, 'Container state changed during cleanup'
        assert set(run('docker', 'image', 'ls', '-q', '--no-trunc').split()) == images, 'Image inventory changed'
        assert set(run('docker', 'volume', 'ls', '-q').split()) == volumes, 'Volume inventory changed'
        with urllib.request.urlopen('http://127.0.0.1:18081/api/health', timeout=5) as response: assert response.status == 200
        report = {'time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'filesystemBytesFreed': shutil.disk_usage('/').free - free,
            'containersUnchanged': True, 'imagesUnchanged': True, 'volumesUnchanged': True, 'backendHealthy': True, 'summary': result.splitlines()[-1:]}
        Path('/opt/gamepanel-pro/build-cache-cleanup.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report))


if __name__ == '__main__': main()
