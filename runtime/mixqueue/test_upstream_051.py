"""Host inventory and submission errors; never synthesize controller loaded."""
import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from test_upstream import agent, payload


def bsp(path, version=30):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(struct.pack('<31i', version, 124, 2, *([0]*28)) + b'{}')


class InventoryAndLoad(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.a = agent.AmxxAdapter.__new__(agent.AmxxAdapter)
        self.a.root = self.root
        self.a.spool = agent.Spool(':memory:')
        self.addCleanup(self.a.spool.db.close)
        self.a.rcon = Mock()
        self.status = dict(bridge=1, controller='matchbot', controller_version='0.5.1',
                           assignment_contract=2, healthy=True, idle=True, matchid='')
        # v1 payload deliberately uses legacy metadata fallback.
        self.status['assignment_contract'] = 1
        self.p = payload('cs16')
        self.command = dict(id='c'*24, type='load', match_id=self.p['match_id'],
                            generation=self.p['generation'], payload=self.p)
        bsp(self.root/'maps/de_nuke.bsp')

    def reply(self, text):
        self.a.rcon.command.side_effect = [json.dumps(self.status), text]

    def test_inventory_requires_readable_valid_bsp_and_rescans_removal(self):
        bsp(self.root/'maps/de_dust2.bsp')
        bsp(self.root/'maps/de_wrong.bsp', 29)
        bsp(self.root/'maps/DE_upper.bsp')
        (self.root/'maps/de_short.bsp').write_bytes(b'\x1e')
        (self.root/'maps/de_range.bsp').write_bytes(struct.pack('<31i',30,124,999,*([0]*28)))
        (self.root/'maps/de_pipe.bsp').mkdir()
        inventory = self.a.map_inventory()
        self.assertTrue(inventory['complete'])
        self.assertEqual(['de_dust2','de_nuke'], inventory['maps'])
        (self.root/'maps/de_nuke.bsp').unlink()
        self.assertEqual(['de_dust2'], self.a.map_inventory()['maps'])
        self.a.root /= 'missing'
        self.assertFalse(self.a.map_inventory()['complete'])

    def test_explicit_rejections_do_not_report_loaded(self):
        for reply, code in agent.AmxxAdapter.LOAD_ERRORS.items():
            with self.subTest(reply=reply):
                self.reply(reply)
                with self.assertRaises(agent.LoadRejected) as error: self.a.execute(self.command)
                self.assertEqual(code, error.exception.code)
                self.assertEqual(0, self.a.spool.db.execute('SELECT count(*) FROM events').fetchone()[0])

    def test_acceptance_is_only_submission_and_ambiguous_transport_stays_ambiguous(self):
        for reply in ('loaded','loading_map','already_loaded'):
            self.reply(reply); self.a.execute(self.command)
        self.assertEqual(0, self.a.spool.db.execute('SELECT count(*) FROM events').fetchone()[0])
        for reply in ('', 'Unknown command: mq2_load', 'not actually loaded', TimeoutError()):
            self.reply(reply)
            with self.assertRaises((ConnectionError,TimeoutError)): self.a.execute(self.command)

    def test_removed_map_is_rejected_before_write_or_rcon_load(self):
        (self.root/'maps/de_nuke.bsp').unlink()
        self.reply('loaded')
        with self.assertRaises(agent.LoadRejected) as error: self.a.execute(self.command)
        self.assertEqual('missing_map', error.exception.code)
        self.assertEqual(['mq2_status'], [x.args[0] for x in self.a.rcon.command.call_args_list])
        self.assertFalse((self.root/'addons').exists())

    def test_storage_error_is_safe_and_does_not_load(self):
        (self.root/'addons').write_text('file blocking directory',encoding='utf-8')
        self.reply('loaded')
        with self.assertRaises(agent.LoadRejected) as error: self.a.execute(self.command)
        self.assertEqual('storage_failure', error.exception.code)
        self.assertEqual(1,self.a.rcon.command.call_count)

    def test_rejection_spools_once_and_flushes_while_controller_quarantined(self):
        worker = agent.Agent.__new__(agent.Agent)
        worker.config = {'journal':str(self.root/'events.jsonl')}
        (self.root/'events.jsonl').write_text('',encoding='utf-8')
        worker.spool = self.a.spool; worker.adapter = Mock()
        worker.adapter.status.return_value = self.status
        worker.adapter.execute.side_effect = agent.LoadRejected('missing_map')
        worker.send = Mock(return_value={'commands':[self.command], 'load_rejection_contract':1})
        worker.step(); worker.step()
        self.assertEqual(1,worker.adapter.execute.call_count)
        events=[json.loads(r[0]) for r in worker.spool.db.execute('SELECT body FROM events')]
        self.assertEqual(['load_rejected'], [x['type'] for x in events])
        self.assertEqual({'code':'missing_map'},events[0]['data'])
        worker.spool.db.execute('UPDATE events SET sent=0')
        worker.adapter.status.return_value = {**self.status,'healthy':False}
        worker.step()
        self.assertTrue(any(x.args[0]['action']=='event' for x in worker.send.call_args_list))
        self.assertFalse(worker.send.call_args_list[-1].args[0]['healthy'])

    def test_old_www_does_not_receive_unknown_rejection_event(self):
        worker = agent.Agent.__new__(agent.Agent)
        worker.config = {'journal':str(self.root/'events.jsonl')}
        (self.root/'events.jsonl').write_text('',encoding='utf-8')
        worker.spool = self.a.spool; worker.adapter = Mock()
        worker.adapter.status.return_value = self.status
        worker.adapter.execute.side_effect = agent.LoadRejected('missing_map')
        worker.send = Mock(return_value={'commands':[self.command]})
        with self.assertRaises(agent.LoadRejected): worker.step()
        self.assertEqual(0,worker.spool.db.execute('SELECT count(*) FROM events').fetchone()[0])


if __name__ == '__main__': unittest.main(verbosity=2)
