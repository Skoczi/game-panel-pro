import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from eserv_network import Manager, Rejected, atomic

ENTRY = {'name': 'macvlan1', 'parent': 'eth0', 'ip': '51.83.150.149', 'mac': '02:00:00:70:ec:b6'}
PARENT = {'ifname': 'eth0', 'ifindex': 2, 'addr_info': [{'local': '51.68.155.190', 'prefixlen': 24}]}
LIVE = {'ifname': 'macvlan1', 'link': 'eth0', 'address': ENTRY['mac'], 'flags': ['UP'], 'linkinfo': {'info_kind': 'macvlan', 'info_data': {'mode': 'bridge'}}, 'addr_info': [{'local': ENTRY['ip'], 'prefixlen': 32}]}

class NetworkTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.manager = Manager(self.tmp.name)
        atomic(self.manager.file, {'revision': 0, 'parents': ['eth0'], 'entries': [], 'retired': []})
        self.live = [copy.deepcopy(PARENT), copy.deepcopy(LIVE)]
        self.manager.inventory = lambda: self.live
        self.manager.usage = lambda ip: []
        self.manager.snapshot = lambda: self.manager.read()
    def test_import_is_non_disruptive_and_persistent(self):
        calls = []
        with patch('eserv_network.run', side_effect=lambda *args: calls.append(args) or ''):
            saved = self.manager.apply({'revision': 0, 'entries': [ENTRY]})
        self.assertEqual(saved['entries'], [ENTRY]); self.assertEqual(saved['revision'], 1)
        self.assertEqual(calls, [('ip', 'link', 'set', 'dev', 'macvlan1', 'alias', 'eserv-managed-ip:51.83.150.149')])
        self.assertEqual(self.manager.file.stat().st_mode & 0o777, 0o600)
    def test_reboot_recreates_from_disk_without_docker_or_panel(self):
        atomic(self.manager.file, {**self.manager.read(), 'entries': [ENTRY]}); self.live = [PARENT]
        calls = []
        with patch('eserv_network.run', side_effect=lambda *args: calls.append(args) or ''): self.manager.boot()
        self.assertIn(('ip', 'address', 'add', ENTRY['ip'] + '/32', 'dev', 'macvlan1'), calls)
        self.assertTrue(all(c[0] == 'ip' for c in calls))
    def test_invalid_primary_conflicting_mac_and_stale_revision(self):
        for e in [{**ENTRY, 'name': 'eth0'}, {**ENTRY, 'ip': PARENT['addr_info'][0]['local']}, {**ENTRY, 'mac': 'ff:ff:ff:ff:ff:ff'}, {**ENTRY, 'parent': 'eth0;reboot'}, {**ENTRY, 'mac': '02:00:00:00:00:01'}]:
            with self.assertRaises(Rejected): self.manager.plan({'revision': 0, 'entries': [e]})
        with self.assertRaises(Rejected): self.manager.plan({'revision': 99, 'entries': [ENTRY]})
        self.assertEqual(self.manager.read()['entries'], [])
    def test_used_and_unowned_interfaces_cannot_be_deleted(self):
        atomic(self.manager.file, {**self.manager.read(), 'entries': [ENTRY]})
        self.manager.usage = lambda ip: ['Container eserv-sftp']
        with self.assertRaisesRegex(Rejected, 'in use'): self.manager.plan({'revision': 0, 'entries': []})
        self.manager.usage = lambda ip: []
        with self.assertRaisesRegex(Rejected, 'no longer owned'): self.manager.plan({'revision': 0, 'entries': []})
    def test_failed_apply_restores_saved_config(self):
        before = self.manager.read()
        with patch.object(self.manager, 'ensure', side_effect=[Rejected('failed'), None]), patch.object(self.manager, 'remove'):
            with self.assertRaisesRegex(Rejected, 'failed'): self.manager.apply({'revision': 0, 'entries': [ENTRY]})
        self.assertEqual(self.manager.read(), before)
    def test_removal_tombstone_is_reconciled_at_boot(self):
        self.live[1]['ifalias'] = self.manager.tag(ENTRY)
        atomic(self.manager.file, {**self.manager.read(), 'retired': [ENTRY]})
        calls = []
        with patch('eserv_network.run', side_effect=lambda *args: calls.append(args) or ''): self.manager.boot()
        self.assertIn(('ip', 'link', 'delete', 'dev', 'macvlan1'), calls)
        self.assertEqual(self.manager.read()['retired'], [])

if __name__ == '__main__': unittest.main()
