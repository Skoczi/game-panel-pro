#!/usr/bin/env python3
"""Install on WAW1; pass a private JSON containing the authorized webhook."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

os.umask(0o077)
assert os.geteuid() == 0
secret = Path(sys.argv[1])
config = json.loads(secret.read_text())
assert re.fullmatch(r'https://discord\.com/api/webhooks/\d{15,22}/[A-Za-z0-9_-]{30,150}', config['webhook'])
destination = Path('/etc/eserv-availability-monitor.json')
destination.write_text(json.dumps({'webhook': config['webhook']}))
destination.chmod(0o600)
shutil.copyfile(Path(__file__).with_name('eserv_availability_monitor.py'), '/usr/local/sbin/eserv-availability-monitor')
Path('/usr/local/sbin/eserv-availability-monitor').chmod(0o700)
Path('/etc/systemd/system/eserv-availability-monitor.service').write_text('''[Unit]
Description=Independent eserv.pl availability checks
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /usr/local/sbin/eserv-availability-monitor
TimeoutStartSec=45
MemoryMax=128M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
StateDirectory=eserv-monitor
StateDirectoryMode=0700
PrivateTmp=true
UMask=0077
''')
Path('/etc/systemd/system/eserv-availability-monitor.timer').write_text('''[Unit]
Description=Check eserv.pl every minute

[Timer]
OnBootSec=30
OnUnitActiveSec=60
AccuracySec=5
Unit=eserv-availability-monitor.service

[Install]
WantedBy=timers.target
''')
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'start', 'eserv-availability-monitor.service'], check=True)
subprocess.run(['systemctl', 'enable', '--now', 'eserv-availability-monitor.timer'], check=True)
secret.unlink()
state = json.loads(Path('/var/lib/eserv-monitor/state.json').read_text())
assert state['successes'] >= 1 and state['failures'] == 0
print(json.dumps({'installed': True, 'status': state['status'], 'firstProbe': 'ok'}))
