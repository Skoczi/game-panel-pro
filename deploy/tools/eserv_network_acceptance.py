"""Run with `unshare --net python3 ...`; never alter the host network namespace."""
import json
import os
from pathlib import Path
import tempfile
from eserv_network import Manager, atomic, run

assert os.readlink('/proc/self/ns/net') != os.readlink('/proc/1/ns/net'), 'An isolated network namespace is required'
run('ip', 'link', 'add', 'eth0', 'type', 'dummy'); run('ip', 'link', 'set', 'eth0', 'up')
entry = {'name': 'esip1', 'parent': 'eth0', 'ip': '51.83.150.150', 'mac': '02:00:00:12:34:56'}
with tempfile.TemporaryDirectory() as directory:
    manager = Manager(directory); atomic(manager.file, {'revision': 0, 'parents': ['eth0'], 'entries': [], 'retired': []})
    manager.snapshot = manager.read; manager.usage = lambda _: []
    manager.apply({'revision': 0, 'entries': [entry]})
    assert any(a.get('local') == entry['ip'] for i in manager.inventory() for a in i.get('addr_info', []))
    run('ip', 'link', 'delete', 'dev', 'esip1')
    # Simulate fresh network state at boot; only the saved host file remains.
    Manager(directory).boot()
    assert any(a.get('local') == entry['ip'] for i in manager.inventory() for a in i.get('addr_info', []))
    manager.apply({'revision': 1, 'entries': []})
    assert not any(i['ifname'] == 'esip1' for i in manager.inventory())
    Manager(directory).boot()
    assert not any(i['ifname'] == 'esip1' for i in manager.inventory())
print('PASS: real isolated Linux macvlan add, persistent boot restoration, removal and absence after next boot')
