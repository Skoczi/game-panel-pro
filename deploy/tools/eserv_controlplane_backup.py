#!/usr/bin/env python3
"""WAW2 daily receiver: verify off-host control-plane archives before retention."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tarfile
import tempfile
import time


def main():
    os.umask(0o077)
    with open('/run/eserv-controlplane-backup.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        root = Path('/mnt/ovh-backup/gamepanel-backups')
        fs = subprocess.check_output(['findmnt', '-T', str(root), '-t', 'nfs,nfs4,cifs', '-n', '-o', 'FSTYPE'], text=True).strip()
        assert fs in ['nfs', 'nfs4', 'cifs'], 'External storage unavailable'
        destination = root / 'control-plane'; destination.mkdir(exist_ok=True, mode=0o700)
        stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
        sources = json.loads(Path('/etc/eserv-backup-sources.json').read_text())
        results = []
        for source in sources:
            name = source['name']; assert name in ['fr1', 'waw1', 'waw2']
            partial = destination / ('.partial-' + name + '-' + stamp)
            target = destination / (name + '-' + stamp + '.tar.gz')
            command = ['/usr/local/sbin/eserv-controlplane-export'] if name == 'waw2' else [
                'ssh', '-4', '-F', '/dev/null', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                '-o', 'UserKnownHostsFile=/etc/eserv-backup-known-hosts', '-o', 'IdentitiesOnly=yes', '-o', 'ConnectTimeout=15',
                '-i', '/root/.ssh/eserv-controlplane-backup', '-p', str(source['port']), 'skoczi@' + source['host']]
            try:
                with partial.open('xb') as output:
                    subprocess.run(command, stdout=output, check=True, timeout=900)
                    output.flush(); os.fsync(output.fileno())
                with tarfile.open(partial) as archive:
                    members = archive.getmembers()
                    assert all(not Path(m.name).is_absolute() and '..' not in Path(m.name).parts and (m.isfile() or m.isdir()) for m in members)
                    manifest = json.load(archive.extractfile('manifest.json'))
                    assert manifest['sqliteIntegrity'] == 'ok'
                    assert archive.getmember('images.tar').size > 1000000
                    # Verify the received SQLite itself, not just the sender's claim.
                    with tempfile.NamedTemporaryFile() as database:
                        database.write(archive.extractfile('data/game-panel.db').read()); database.flush()
                        with sqlite3.connect('file:' + database.name + '?mode=ro', uri=True) as db:
                            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
                    # Iterate through every member to force gzip CRC/truncation checking.
                    for member in members:
                        if member.isfile():
                            with archive.extractfile(member) as data:
                                while data.read(1024 * 1024): pass
                with partial.open('rb') as received: digest = hashlib.file_digest(received, 'sha256').hexdigest()
                partial.rename(target)
                receipt = {'name': target.name, 'sha256': digest, 'bytes': target.stat().st_size, 'verifiedAt': stamp, 'sqliteIntegrity': 'ok', 'images': manifest['images']}
                target.with_suffix(target.suffix + '.json').write_text(json.dumps(receipt, indent=2))
                # Only archives previously accompanied by our verified receipt qualify.
                verified = sorted([p for p in destination.glob(name + '-*.tar.gz') if p.with_suffix(p.suffix + '.json').is_file()], reverse=True)
                for old in verified[14:]: old.unlink(); old.with_suffix(old.suffix + '.json').unlink()
                results.append(receipt)
                print(json.dumps({'source': name, 'bytes': receipt['bytes'], 'verified': True}), flush=True)
            finally:
                if partial.exists(): partial.unlink()
        status = Path('/var/lib/eserv-backups'); status.mkdir(exist_ok=True, mode=0o700)
        (status / 'last-success.json').write_text(json.dumps({'at': stamp, 'backups': results}, indent=2))


if __name__ == '__main__': main()
