import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

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


if __name__ == '__main__': unittest.main(verbosity=2)
