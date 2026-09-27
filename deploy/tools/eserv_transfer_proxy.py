#!/usr/bin/env python3
"""Install a narrowly scoped archive receive limit in an eserv agent vhost."""
import argparse
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('host', choices=['waw1', 'waw2'])
args = parser.parse_args()
target = Path('/etc/nginx/sites-enabled/' + args.host + '.eserv.pl').resolve()
original = target.read_text()
marker = 'location ~ ^/api/servers/[0-9]+/clone/receive$'
if marker not in original:
    match = re.search(r'location ~ \^/api\(\?:/\|\$\) \{[^{}]+\}', original)
    if not match:
        raise RuntimeError('Expected API proxy location missing; no change made')
    block = match.group().replace('location ~ ^/api(?:/|$)', marker)
    block = block.replace('{', '{\n client_max_body_size 50g;', 1)
    updated = original[:match.start()] + block + '\n ' + original[match.start():]
    backup = target.with_name(target.name + '.before-transfer')
    # Keep the rollback outside sites-enabled, never accidentally load it as another vhost.
    backup = Path('/var/backups') / backup.name
    if backup.exists():
        raise RuntimeError('Rollback already exists; inspect before retrying')
    backup.write_text(original); backup.chmod(0o600)
    try:
        target.write_text(updated)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except BaseException:
        target.write_text(original)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise
    print('Scoped transfer receive proxy installed; rollback:', backup)
else:
    print('Scoped transfer receive proxy already installed')
