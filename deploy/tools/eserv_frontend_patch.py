#!/usr/bin/env python3
"""FR1 custom-layout frontend patch; preflight smoke, snapshot and rollback.

Run on FR1 with a reviewed archive containing dist/, nginx.conf and
security-headers.conf. Does not touch backend, agents or game containers.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import time
import urllib.error
import urllib.request


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def inspect_others(frontend_id):
    ids = run('docker', 'ps', '-q').split()
    return {item['Id']: item['State']['StartedAt']
            for item in json.loads(run('docker', 'inspect', *ids))
            if item['Id'] != frontend_id}


def atomic_json(path, value):
    temp = path.with_suffix(path.suffix + '.next')
    with temp.open('w') as file:
        json.dump(value, file, indent=2)
        file.write('\n')
        file.flush()
        os.fsync(file.fileno())
    os.replace(temp, path)


def verify(base, expected_html):
    for path in ['/', '/s/27/backups', '/assets/missing-abcdefgh.js']:
        try:
            response = urllib.request.urlopen(base + path, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            assert response.headers.get('X-Frame-Options') == 'DENY'
            assert response.headers.get('X-Content-Type-Options') == 'nosniff'
            assert "frame-ancestors 'none'" in response.headers.get('Content-Security-Policy', '')
            assert response.headers.get('Strict-Transport-Security') == 'max-age=31536000'
            body = response.read()
            if path.startswith('/assets/'):
                assert response.status == 404
            else:
                assert response.status == 200 and body == expected_html


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    parser.add_argument('--patch', required=True)
    parser.add_argument('--commit', required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9-]{1,70}', args.patch):
        raise ValueError('Invalid patch name')
    if not re.fullmatch(r'[0-9a-f]{40}', args.commit):
        raise ValueError('Expected full source commit')
    os.umask(0o077)
    root = Path('/opt/gamepanel-pro')
    with (root / '.release-channel.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        compose_path = root / 'compose.json'
        old = json.loads(compose_path.read_text())
        old_release = json.loads((root / 'release.json').read_text())
        frontend = json.loads(run('docker', 'inspect', 'gamepanel-pro-frontend'))[0]
        assert frontend['Config']['Labels']['com.docker.compose.project.working_dir'] == str(root)
        assert not old['services']['frontend'].get('volumes'), 'Review frontend mounts before patching'
        before = inspect_others(frontend['Id'])
        dest = root / 'local-patches' / args.patch
        dest.mkdir(parents=True, exist_ok=False)
        with tarfile.open(args.archive) as archive:
            for member in archive.getmembers():
                path = Path(member.name)
                if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
                    raise ValueError('Unsafe archive entry')
            # Debian 12 Python predates tarfile's data filter. Copy only the
            # validated plain files/directories; never restore owners or modes.
            for member in archive.getmembers():
                target = dest / member.name
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.extractfile(member) as source, target.open('wb') as output:
                        shutil.copyfileobj(source, output)
            # The unprivileged nginx image needs read/traverse access.
            for target in dest.rglob('*'):
                target.chmod(0o755 if target.is_dir() else 0o644)
        html = (dest / 'dist/index.html').read_bytes()
        # BuildKit interprets a bare sha256 ID as a registry image name in FROM.
        # Give the inspected local image a unique, retained rollback tag.
        base_image = 'gamepanel-pro-frontend:base-' + args.patch
        run('docker', 'tag', frontend['Image'], base_image)
        (dest / 'Dockerfile').write_text(
            'FROM ' + base_image + '\n'
            'COPY dist/ /usr/share/nginx/html/\n'
            'COPY nginx.conf /etc/nginx/conf.d/default.conf\n'
            'COPY security-headers.conf /etc/nginx/security-headers.conf\n')
        image = 'gamepanel-pro-frontend:local-' + args.patch
        run('docker', 'build', '-t', image, str(dest))
        run('docker', 'run', '--rm', '--network', 'none', image, 'nginx', '-t')
        smoke = run('docker', 'run', '-d', '--memory', '256m', '--cpus', '1',
                    '-p', '127.0.0.1::8080', image)
        try:
            port = json.loads(run('docker', 'inspect', smoke))[0]['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort']
            for attempt in range(15):
                try:
                    verify('http://127.0.0.1:' + port, html)
                    break
                except (OSError, AssertionError):
                    if attempt == 14:
                        raise
                    time.sleep(1)
        finally:
            run('docker', 'rm', '-f', smoke)
        rollback = dest / 'rollback'
        rollback.mkdir()
        for filename in ['compose.json', 'release.json']:
            shutil.copy2(root / filename, rollback / filename)
        updated = json.loads(json.dumps(old))
        updated['services']['frontend']['image'] = image
        compose = ['docker', 'compose', '--project-directory', str(root), '-f', str(compose_path)]
        try:
            atomic_json(compose_path, updated)
            run(*compose, 'config', '--quiet')
            run(*compose, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'frontend')
            for attempt in range(20):
                try:
                    verify('http://127.0.0.1:18080', html)
                    break
                except (OSError, AssertionError):
                    if attempt == 19:
                        raise
                    time.sleep(1)
            current = json.loads(run('docker', 'inspect', 'gamepanel-pro-frontend'))[0]
            assert inspect_others(current['Id']) == before, 'Unrelated container state changed'
            release = dict(old_release)
            release['frontendImage'] = image
            release['frontendCommit'] = args.commit
            release['localPatch'] = {'id': args.patch, 'commit': args.commit, 'frontendImage': image}
            atomic_json(root / 'release.json', release)
            report = {'patch': args.patch, 'image': image, 'commit': args.commit,
                      'htmlSha256': hashlib.sha256(html).hexdigest(),
                      'headersAndRoutesVerified': True, 'otherContainersUnchanged': True,
                      'rollback': str(rollback)}
            atomic_json(dest / 'deployment.json', report)
            print(json.dumps(report))
        except BaseException:
            atomic_json(compose_path, old)
            atomic_json(root / 'release.json', old_release)
            run(*compose, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'frontend')
            raise


if __name__ == '__main__':
    main()
