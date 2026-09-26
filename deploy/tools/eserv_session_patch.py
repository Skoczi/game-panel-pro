#!/usr/bin/env python3
"""Deploy tested session backend/frontend to the existing FR1 custom layout.

The archive contains backend/dist, backend/test/integration/session-acceptance.mjs,
frontend/dist and nginx configs. Games and agent services are not recreated.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import tarfile
import time
import urllib.error
import urllib.request
from eserv_frontend_patch import run, atomic_json, verify


def inventory(excluded):
    return {c['Id']: c['State']['StartedAt'] for c in json.loads(run('docker', 'inspect', *run('docker', 'ps', '-q').split())) if c['Name'].lstrip('/') not in excluded}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    parser.add_argument('--patch', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--backend-only', action='store_true')
    args = parser.parse_args()
    assert re.fullmatch('[a-z0-9-]{1,70}', args.patch)
    assert re.fullmatch('[0-9a-f]{40}', args.commit)
    os.umask(0o077)
    root = Path('/opt/gamepanel-pro')
    with (root / '.release-channel.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        compose_path = root / 'compose.json'
        old = json.loads(compose_path.read_text())
        release = json.loads((root / 'release.json').read_text())
        services = ['backend'] if args.backend_only else ['backend', 'frontend']
        excluded = {'gamepanel-pro-' + service for service in services}
        before = inventory(excluded)
        dest = root / 'local-patches' / args.patch
        dest.mkdir(parents=True, exist_ok=False)
        with tarfile.open(args.archive) as archive:
            for member in archive.getmembers():
                path = Path(member.name)
                assert not path.is_absolute() and '..' not in path.parts and (member.isfile() or member.isdir())
                assert path.parts[0] in ['backend', 'frontend']
            for member in archive.getmembers():
                target = dest / member.name
                if member.isdir(): target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.extractfile(member) as source, target.open('wb') as output: shutil.copyfileobj(source, output)
        for target in dest.rglob('*'): target.chmod(0o755 if target.is_dir() else 0o644)
        images = {}
        for service in services:
            current = json.loads(run('docker', 'inspect', 'gamepanel-pro-' + service))[0]
            assert current['Config']['Labels']['com.docker.compose.project.working_dir'] == str(root)
            base = 'gamepanel-pro-' + service + ':base-' + args.patch
            run('docker', 'tag', current['Image'], base)
            lines = ['FROM ' + base]
            if service == 'backend': lines += ['COPY dist/ /app/backend/dist/']
            else: lines += ['COPY dist/ /usr/share/nginx/html/', 'COPY nginx.conf /etc/nginx/conf.d/default.conf', 'COPY security-headers.conf /etc/nginx/security-headers.conf']
            (dest / service / 'Dockerfile').write_text('\n'.join(lines) + '\n')
            image = 'gamepanel-pro-' + service + ':local-' + args.patch
            run('docker', 'build', '-t', image, str(dest / service))
            images[service] = image
        # Verify the exact runtime image using synthetic credentials and empty DB.
        subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--memory', '512m', '--cpus', '1', '--tmpfs', '/data',
            '-v', str(dest / 'backend/test/integration/session-acceptance.mjs') + ':/app/backend/test/integration/session-acceptance.mjs:ro',
            '--entrypoint', 'node', images['backend'], 'test/integration/session-acceptance.mjs'], check=True, timeout=45)
        if not args.backend_only:
            run('docker', 'run', '--rm', '--network', 'none', images['frontend'], 'nginx', '-t')
            html = (dest / 'frontend/dist/index.html').read_bytes()
            smoke = run('docker', 'run', '-d', '--memory', '256m', '-p', '127.0.0.1::8080', images['frontend'])
            try:
                port = json.loads(run('docker', 'inspect', smoke))[0]['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort']
                for attempt in range(15):
                    try: verify('http://127.0.0.1:' + port, html); break
                    except (OSError, AssertionError):
                        if attempt == 14: raise
                        time.sleep(1)
            finally: run('docker', 'rm', '-f', smoke)
        rollback = dest / 'rollback'; rollback.mkdir(mode=0o700)
        for filename in ['compose.json', 'release.json', 'backend.env']: shutil.copy2(root / filename, rollback / filename)
        with sqlite3.connect('file:' + str(root / 'data/game-panel.db') + '?mode=ro', uri=True) as source:
            with sqlite3.connect(rollback / 'game-panel.db') as backup:
                source.backup(backup)
                assert backup.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        updated = json.loads(json.dumps(old))
        for service, image in images.items(): updated['services'][service]['image'] = image
        compose = ['docker', 'compose', '--project-directory', str(root), '-f', str(compose_path)]
        try:
            atomic_json(compose_path, updated)
            run(*compose, 'config', '--quiet')
            run(*compose, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', *services)
            for attempt in range(40):
                try:
                    if not args.backend_only: verify('http://127.0.0.1:18080', html)
                    with urllib.request.urlopen('http://127.0.0.1:18081/api/health', timeout=3) as response: assert response.status == 200
                    request = urllib.request.Request('http://127.0.0.1:18081/api/auth/session', data=b'{}', headers={'Content-Type': 'application/json', 'Origin': 'https://eserv.pl', 'X-GP-Session': '1'})
                    try: urllib.request.urlopen(request, timeout=3); raise AssertionError('Empty session accepted')
                    except urllib.error.HTTPError as response:
                        assert response.code == 401 and response.headers.get('Cache-Control') == 'no-store'
                    break
                except (OSError, AssertionError):
                    if attempt == 39: raise
                    time.sleep(1)
            assert before == inventory(excluded), 'Other containers changed'
            final = dict(release)
            for service, image in images.items(): final[service + 'Image'] = image; final[service + 'Commit'] = args.commit
            final['localPatch'] = {'id': args.patch, 'commit': args.commit, **images}
            atomic_json(root / 'release.json', final)
            report = {'patch': args.patch, 'commit': args.commit, 'images': images, 'acceptance': True, 'otherContainersUnchanged': True, 'rollback': str(rollback), 'archiveSha256': hashlib.sha256(args.archive.read_bytes()).hexdigest()}
            atomic_json(dest / 'deployment.json', report)
            print(json.dumps(report))
        except BaseException:
            # Additive session tables can remain; never overwrite live DB writes.
            atomic_json(compose_path, old); atomic_json(root / 'release.json', release)
            run(*compose, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', *services)
            raise


if __name__ == '__main__': main()
