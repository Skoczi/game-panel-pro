#!/usr/bin/env python3
"""Update one installed agent; snapshot SQLite/config and preserve all other containers."""
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
import urllib.request
from eserv_frontend_patch import run, atomic_json


def inventory(exclude):
    return {c['Id']: c['State']['StartedAt'] for c in json.loads(run('docker', 'inspect', *run('docker', 'ps', '-q').split())) if c['Name'].lstrip('/') != exclude}


def main():
    p = argparse.ArgumentParser(); p.add_argument('archive', type=Path); p.add_argument('--root', required=True, type=Path)
    p.add_argument('--container', required=True); p.add_argument('--patch', required=True); p.add_argument('--commit', required=True)
    p.add_argument('--external-root', type=Path)
    p.add_argument('--control-backup-status', action='store_true')
    args = p.parse_args(); os.umask(0o077)
    root = args.root.resolve(); assert root in [Path('/srv/eserv-agent'), Path('/srv/gamepanel-agent')]
    assert re.fullmatch('[a-z0-9-]{1,70}', args.patch) and re.fullmatch('[a-f0-9]{40}', args.commit)
    with (root / '.release-channel.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        old = json.loads((root / 'compose.json').read_text()); release = json.loads((root / 'release.json').read_text())
        current = json.loads(run('docker', 'inspect', args.container))[0]
        assert current['Config']['Labels']['com.docker.compose.project.working_dir'] == str(root)
        assert current['Config']['Labels']['com.docker.compose.service'] == 'agent'
        before = inventory(args.container)
        dest = root / 'local-patches' / args.patch; dest.mkdir(parents=True, exist_ok=False)
        with tarfile.open(args.archive) as archive:
            for member in archive.getmembers():
                path = Path(member.name)
                assert not path.is_absolute() and '..' not in path.parts and member.isfile()
                assert path.parts[0] in ['dist', 'package.json', 'package-lock.json']
            for member in archive.getmembers():
                target = dest / member.name; target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, target.open('wb') as out: shutil.copyfileobj(source, out)
        source_package = json.loads((dest / 'package.json').read_text())
        installed_package = json.loads(run('docker', 'exec', args.container, 'cat', '/app/backend/package.json'))
        assert source_package['dependencies'] == installed_package['dependencies'], 'Dependency change requires full build'
        base = 'gamepanel-agent:base-' + args.patch; run('docker', 'tag', current['Image'], base)
        (dest / 'Dockerfile').write_text('FROM ' + base + '\nCOPY dist/ /app/backend/dist/\nCOPY package*.json /app/backend/\n')
        image = 'gamepanel-agent:local-' + args.patch; run('docker', 'build', '-t', image, str(dest))
        rollback = dest / 'rollback'; rollback.mkdir(mode=0o700)
        for name in ['compose.json', 'release.json', 'runtime.env']: shutil.copy2(root / name, rollback / name)
        with sqlite3.connect('file:' + str(root / 'data/game-panel.db') + '?mode=ro', uri=True) as source:
            with sqlite3.connect(rollback / 'game-panel.db') as backup:
                source.backup(backup); assert backup.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        updated = json.loads(json.dumps(old)); service = updated['services']['agent']; service['image'] = image
        service.setdefault('environment', {}).update({'GAMEPANEL_BUILD_COMMIT': args.commit, 'GAMEPANEL_BUILD_ID': args.patch})
        if args.control_backup_status:
            assert root == Path('/srv/gamepanel-agent')
            assert Path('/var/lib/eserv-backups/last-success.json').is_file()
            service['environment']['GAMEPANEL_CONTROL_BACKUP_STATUS'] = '/operational-backups/last-success.json'
            if not any('/operational-backups' in str(v) for v in service.get('volumes', [])):
                service.setdefault('volumes', []).append({'type': 'bind', 'source': '/var/lib/eserv-backups', 'target': '/operational-backups', 'read_only': True, 'bind': {'create_host_path': False}})
        if args.external_root:
            external = args.external_root.resolve()
            assert external == Path('/mnt/ovh-backup/gamepanel-backups')
            assert run('findmnt', '-T', str(external.parent), '-t', 'nfs,nfs4,cifs', '-n', '-o', 'FSTYPE') in ['nfs', 'nfs4', 'cifs']
            external.mkdir(mode=0o700, exist_ok=True)
            assert external.is_dir() and not args.external_root.is_symlink()
            service['environment'].update({'GAMEPANEL_EXTERNAL_BACKUP_ROOT': '/external-backups', 'GAMEPANEL_EXTERNAL_BACKUP_LABEL': 'OVH Backup Storage'})
            assert not any('/external-backups' in str(v) for v in service.get('volumes', []))
            service.setdefault('volumes', []).append({'type': 'bind', 'source': str(external), 'target': '/external-backups', 'bind': {'create_host_path': False}})
        compose = ['docker', 'compose', '--project-directory', str(root), '-f', str(root / 'compose.json')]
        try:
            atomic_json(root / 'compose.json', updated); run(*compose, 'config', '--quiet')
            run(*compose, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'agent')
            info = json.loads(run('docker', 'inspect', args.container))[0]
            port = info['NetworkSettings']['Ports']['3001/tcp'][0]['HostPort']
            for attempt in range(40):
                try:
                    with urllib.request.urlopen('http://127.0.0.1:' + port + '/api/health', timeout=3) as r: health = json.load(r)
                    assert health['version'] == source_package['version'] and health['commit'] == args.commit
                    assert health['capabilities']['nativeBackupPolicy'] == 1
                    break
                except (OSError, AssertionError):
                    if attempt == 39: raise
                    time.sleep(1)
            assert inventory(args.container) == before, 'Other containers changed'
            final = dict(release); final.update({'version': source_package['version'], 'commit': args.commit, 'agentImage': image, 'localPatch': args.patch, 'lastUpdateSnapshot': str(rollback)})
            atomic_json(root / 'release.json', final)
            report = {'patch': args.patch, 'image': image, 'version': health['version'], 'commit': health['commit'], 'nativeBackupPolicy': 1, 'otherContainersUnchanged': True, 'rollback': str(rollback)}
            atomic_json(dest / 'deployment.json', report); print(json.dumps(report))
        except BaseException:
            atomic_json(root / 'compose.json', old); atomic_json(root / 'release.json', release)
            run(*compose, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'agent'); raise


if __name__ == '__main__': main()
