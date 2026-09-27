#!/usr/bin/env python3
"""Install the host manager without changing existing interface addresses."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
from eserv_network import atomic, run

p = argparse.ArgumentParser(); p.add_argument('--root', type=Path, required=True); p.add_argument('--backend', required=True); p.add_argument('--parent', required=True); a = p.parse_args()
os.umask(0o077)
root = a.root.resolve(); assert root in [Path('/opt/gamepanel-pro'), Path('/srv/eserv-agent'), Path('/srv/gamepanel-agent')]
assert (Path('/sys/class/net') / a.parent / 'device').exists(), 'Parent must be a physical interface'
backend = json.loads(run('docker', 'inspect', a.backend))[0]
assert backend['Config']['Labels']['com.docker.compose.project.working_dir'] == str(root)
def addresses():
    return [(i['ifname'], [(a['local'], a['prefixlen']) for a in i.get('addr_info', [])]) for i in json.loads(run('ip', '-j', '-4', 'address', 'show'))]
before = addresses()
inventory = {c['Id']: c['State']['StartedAt'] for c in json.loads(run('docker', 'inspect', *run('docker', 'ps', '-q').split()))}
directory = Path('/etc/eserv'); directory.mkdir(mode=0o700, exist_ok=True)
config = directory / 'network.json'
if not config.exists(): atomic(config, {'revision': 0, 'parents': [a.parent], 'entries': [], 'retired': []})
else: assert a.parent in json.loads(config.read_text())['parents']
backup = root / 'host-network-migration'; backup.mkdir(mode=0o700, exist_ok=True)
for source in [root / 'compose.json', Path('/usr/local/sbin/waw2-additional-ips.sh'), Path('/etc/systemd/system/waw2-additional-ips.service')]:
    if source.exists() and not (backup / source.name).exists(): shutil.copy2(source, backup / source.name)
shutil.copy2(Path(__file__).with_name('eserv_network.py'), '/usr/local/sbin/eserv-network'); Path('/usr/local/sbin/eserv-network').chmod(0o700)
boot = f'''[Unit]
Description=eServ persistent additional IP interfaces
Wants=network-online.target
Requires=sys-subsystem-net-devices-{a.parent}.device
After=network-online.target sys-subsystem-net-devices-{a.parent}.device
Before=docker.service wings.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/eserv-network boot
RemainAfterExit=yes
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
'''
api = '''[Unit]
Description=eServ local host network manager
Wants=eserv-network-boot.service
After=eserv-network-boot.service

[Service]
Type=simple
ExecStart=/usr/local/sbin/eserv-network serve
Restart=on-failure
RuntimeDirectory=eserv-network
RuntimeDirectoryMode=0700
RuntimeDirectoryPreserve=yes
UMask=0077
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/etc/eserv /run/eserv-network
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_RAW
MemoryMax=128M
TasksMax=32

[Install]
WantedBy=multi-user.target
'''
Path('/etc/systemd/system/eserv-network-boot.service').write_text(boot)
Path('/etc/systemd/system/eserv-network-api.service').write_text(api)
run('systemctl', 'daemon-reload')
run('systemctl', 'enable', 'eserv-network-boot.service', 'eserv-network-api.service')
run('systemctl', 'start', 'eserv-network-boot.service', 'eserv-network-api.service')
original = json.loads((root / 'compose.json').read_text()); service = backend['Config']['Labels']['com.docker.compose.service']
mounts = original['services'][service].setdefault('volumes', [])
if not any('/run/eserv-network' in str(v) for v in mounts): mounts.append({'type': 'bind', 'source': '/run/eserv-network', 'target': '/run/eserv-network', 'read_only': True, 'bind': {'create_host_path': False}})
atomic(root / 'compose.json', original)
assert addresses() == before, 'Interface addresses changed unexpectedly'
assert {c['Id']: c['State']['StartedAt'] for c in json.loads(run('docker', 'inspect', *inventory))} == inventory
print(json.dumps({'installed': True, 'parent': a.parent, 'existingInterfacesUnchanged': True, 'containersUnchanged': True, 'backendMountPendingRecreate': True}))
