import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('mq_agent', Path(__file__).with_name('mq_agent.py'))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


def payload(game='csgo'):
    return {'match_id': 'a'*24, 'generation': 2, 'config_hash':'b'*64,'game': game, 'team_size': 2, 'mode': '2v2', 'map': 'de_nuke',
            'rules': {'mr': 8, 'ot_mr': 3}, 'players': [{'steam_id': str(76561198000000000+i), 'team': 1 if i<2 else 2, 'name': str(i)} for i in range(4)]}


class AgentTests(unittest.TestCase):
    def test_retry_survives_restart_and_preserves_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp)/'spool.db')
            spool = agent.Spool(path)
            for n in (1, 2): spool.put({'event_id': str(n), 'type': 'round'})
            def failed(_): raise ConnectionError('offline')
            with self.assertRaises(ConnectionError): spool.flush(failed)
            spool.db.close()
            recovered = agent.Spool(path)
            sent = []
            recovered.flush(sent.append)
            recovered.flush(sent.append)
            self.assertEqual(['1', '2'], [x['event']['event_id'] for x in sent])
            recovered.db.close()

    def test_conflicting_event_is_not_silently_overwritten(self):
        spool = agent.Spool(':memory:')
        spool.put({'event_id': '1', 'score': 1})
        with self.assertRaises(ValueError): spool.put({'event_id': '1', 'score': 2})
        spool.db.close()

    def test_partial_line_does_not_advance_cursor(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'journal';path.write_bytes(b'{"event_id":"1"}\n{"event')
            spool=agent.Spool(':memory:');spool.tail(path)
            self.assertEqual(1,spool.db.execute('SELECT COUNT(*) FROM events').fetchone()[0])
            with path.open('ab') as f:f.write(b'_id":"2"}\n')
            spool.tail(path)
            self.assertEqual(2,spool.db.execute('SELECT COUNT(*) FROM events').fetchone()[0])
            spool.db.close()

    def test_source_roster_map_rules_generation(self):
        data=agent.Get5Adapter.build(payload())
        self.assertEqual('a'*24+':2',data['matchid'])
        self.assertEqual(2,len(data['team1']['players']))
        self.assertEqual(16,data['cvars']['mp_maxrounds'])
        self.assertEqual(['de_nuke'],data['maplist'])

    def test_unsafe_map_and_duplicate_steam_rejected(self):
        p=payload();p['map']='de_nuke;quit'
        with self.assertRaises(ValueError):agent.Get5Adapter.build(p)
        p=payload();p['players'][1]['steam_id']=p['players'][0]['steam_id']
        with self.assertRaises(ValueError):agent.Get5Adapter.build(p)

    def test_goldsrc_steam_conversion_and_size(self):
        text=agent.AmxxAdapter.build(payload('cs16'))
        rows=text.splitlines()
        self.assertEqual(5,len(rows))
        self.assertIn('STEAM_0:0:19867136 76561198000000000 1',rows[1])

    def test_solo_flag_never_relaxes_normal_roster(self):
        p=payload('cs16');p['players']=p['players'][:1]
        with self.assertRaises(ValueError): agent.AmxxAdapter.build(p)
        p['rules']['test']=True
        rows=agent.AmxxAdapter.build(p).splitlines()
        self.assertEqual(2,len(rows));self.assertTrue(rows[0].endswith(' 1'))
        p['players'][0]['team']=2
        with self.assertRaises(ValueError): agent.AmxxAdapter.build(p)

    def test_source_cannot_claim_solo_support(self):
        p=payload();p['rules']['test']=True
        with self.assertRaises(ValueError): agent.Get5Adapter.build(p)

    def test_legacy_controller_cannot_receive_a_new_cs16_assignment(self):
        a = agent.AmxxAdapter.__new__(agent.AmxxAdapter)
        a.rcon = Mock()
        a.rcon.command.return_value = json.dumps({'bridge':1,'healthy':True,'idle':True,'matchid':'','solo_test':True,'controller_version':'0.3.0'})
        p = payload('cs16')
        with self.assertRaisesRegex(RuntimeError, 'MatchBot'):
            a.execute({'type':'load','match_id':p['match_id'],'generation':p['generation'],'payload':p})
        self.assertEqual(['mq2_status'],[c.args[0] for c in a.rcon.command.call_args_list])


class CleanupTests(unittest.TestCase):
    command = {'id': 'c'*24, 'match_id': 'a'*24, 'generation': 2, 'type': 'abort'}
    idle = {'bridge': 1, 'healthy': True, 'idle': True, 'matchid': ''}
    active = {**idle, 'idle': False, 'matchid': 'a'*24+':2'}

    def adapter(self, cls, replies):
        adapter = cls.__new__(cls)
        adapter.spool = agent.Spool(':memory:')
        self.addCleanup(adapter.spool.db.close)
        adapter.rcon = Mock()
        adapter.rcon.command.side_effect = [json.dumps(r) if isinstance(r, dict) else r for r in replies]
        return adapter

    def events(self, adapter):
        sent = []
        adapter.spool.flush(sent.append)
        return [item['event'] for item in sent]

    def test_retry_on_empty_server_confirms_once_without_another_clear(self):
        for cls in (agent.AmxxAdapter, agent.Get5Adapter):
            with self.subTest(adapter=cls.__name__):
                a = self.adapter(cls, [self.idle, self.idle])
                a.execute(self.command)
                a.execute(self.command)
                self.assertEqual(['mq2_status']*2, [c.args[0] for c in a.rcon.command.call_args_list])
                events = self.events(a)
                self.assertEqual(1, len(events))
                self.assertEqual(('idle-'+'c'*24, 'a'*24, 2, 'idle'),
                                 tuple(events[0][k] for k in ('event_id','match_id','generation','type')))

    def test_lost_clear_reply_reconciles_only_with_verified_idle(self):
        for cls in (agent.AmxxAdapter, agent.Get5Adapter):
            for error in (TimeoutError('dropped UDP reply'), RuntimeError('broker_rejected')):
                with self.subTest(adapter=cls.__name__, error=type(error).__name__):
                    a = self.adapter(cls, [self.active, error, self.idle])
                    a.execute(self.command)
                    self.assertEqual(['mq2_status','mq2_clear','mq2_status'],
                                     [c.args[0] for c in a.rcon.command.call_args_list])
                    self.assertEqual(['idle'], [e['type'] for e in self.events(a)])

    def test_acknowledgement_alone_does_not_release_connected_players(self):
        for cls in (agent.AmxxAdapter, agent.Get5Adapter):
            with self.subTest(adapter=cls.__name__):
                draining = {**self.idle, 'idle': False}
                a = self.adapter(cls, [self.active, 'ok', draining, self.idle])
                a.execute(self.command)
                self.assertEqual([], self.events(a))
                a.execute(self.command)
                self.assertEqual(['idle'], [e['type'] for e in self.events(a)])
                self.assertEqual(1, sum(c.args[0]=='mq2_clear' for c in a.rcon.command.call_args_list))

    def test_foreign_assignment_is_never_cleared(self):
        for cls in (agent.AmxxAdapter, agent.Get5Adapter):
            for foreign in ('b'*24+':2', 'a'*24+':3'):
                with self.subTest(adapter=cls.__name__, assignment=foreign):
                    a = self.adapter(cls, [{**self.active, 'matchid': foreign}])
                    with self.assertRaises(RuntimeError): a.execute(self.command)
                    self.assertEqual(['mq2_status'], [c.args[0] for c in a.rcon.command.call_args_list])
                    self.assertEqual([], self.events(a))

    def test_lost_reply_without_idle_proof_keeps_assignment_reserved(self):
        invalid = [self.active, {}, {**self.idle, 'healthy': False},
                   {**self.idle, 'idle': 1}, {**self.idle, 'matchid': None},
                   {**self.idle, 'matchid': 'b'*24+':3'}, TimeoutError('offline')]
        for cls in (agent.AmxxAdapter, agent.Get5Adapter):
            for observed in invalid:
                with self.subTest(adapter=cls.__name__, observed=observed):
                    a = self.adapter(cls, [self.active, TimeoutError('clear reply lost'), observed])
                    with self.assertRaises(Exception): a.execute(self.command)
                    self.assertEqual([], self.events(a))

    def test_failed_post_clear_read_recovers_on_retry_and_preserves_event_order(self):
        for cls in (agent.AmxxAdapter, agent.Get5Adapter):
            with self.subTest(adapter=cls.__name__):
                a = self.adapter(cls, [self.active, '', TimeoutError('status reply lost'), self.idle])
                a.spool.put({'event_id':'loaded-1','match_id':'a'*24,'generation':2,'type':'loaded','data':{}})
                with self.assertRaises(TimeoutError): a.execute(self.command)
                a.execute({**self.command, 'type':'cleanup'})
                events = self.events(a)
                self.assertEqual(['loaded','idle'], [e['type'] for e in events])
                self.assertEqual([1,2], [e['sequence'] for e in events])
                self.assertEqual(1, sum(c.args[0]=='mq2_clear' for c in a.rcon.command.call_args_list))


if __name__ == '__main__': unittest.main(verbosity=2)
