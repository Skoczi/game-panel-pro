import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from runner import cycle


class RunnerTests(unittest.TestCase):
    def agent(self, journal_error=False, event_error=False, game='cs16', build=''):
        calls = []
        class Spool:
            def tail(self, path):
                if journal_error:
                    raise RuntimeError('secret journal error')
            def flush(self, send):
                if event_error:
                    raise RuntimeError('secret upstream error')
        def send(body):
            calls.append(body)
            return {'commands': []}
        return SimpleNamespace(
            adapter=SimpleNamespace(status=lambda: {'bridge': 1, 'healthy': True, 'idle': True}),
            spool=Spool(), config={'journal':'/journal/events.jsonl','game':game,'verified_build':build}, send=send,
        ), calls

    def test_journal_failure_reports_unhealthy_even_with_heartbeat(self):
        agent, calls = self.agent(journal_error=True)
        result = cycle(agent)
        self.assertTrue(result['heartbeat'])
        self.assertFalse(result['ready'])
        self.assertFalse(calls[-1]['healthy'])
        self.assertEqual(result['error'], 'journal_or_events')

    def test_rejected_events_block_new_matches(self):
        agent, calls = self.agent(event_error=True)
        self.assertFalse(cycle(agent)['ready'])
        self.assertFalse(calls[-1]['healthy'])

    def test_csco_requires_build_attestation(self):
        agent, calls = self.agent(game='csco')
        self.assertFalse(cycle(agent)['ready'])
        self.assertFalse(calls[-1]['healthy'])

    def test_healthy_idle_bridge_can_be_ready(self):
        agent, calls = self.agent()
        self.assertTrue(cycle(agent)['ready'])
        self.assertTrue(calls[-1]['healthy'])

    def test_protocol_and_solo_capability_reach_signed_poll_unchanged(self):
        from mq_agent import AmxxAdapter
        agent, calls = self.agent()
        adapter = object.__new__(AmxxAdapter)
        adapter.root = Path('/unavailable-game-inventory')
        adapter.spool = SimpleNamespace(metrics=lambda: {'pending': 0, 'oldest_pending_seconds': None, 'database_bytes': 4096})
        adapter.rcon = SimpleNamespace(command=lambda command: '{"bridge":1,"solo_test":true,"healthy":true,"idle":true,"controller":"matchbot","controller_version":"0.6.3","assignment_contract":3,"stats_version":2,"pause_policy":2,"ready_seconds":300,"full_test":true,"rules_ready":true}')
        agent.adapter = adapter
        self.assertTrue(cycle(agent)['ready'])
        self.assertEqual(calls[-1]['observation']['agent_protocol'], 2)
        self.assertEqual(calls[-1]['observation']['controller'], 'matchbot')
        self.assertIs(calls[-1]['observation']['rules_ready'], True)
        self.assertIs(calls[-1]['observation']['solo_test'], True)
        self.assertEqual(calls[-1]['observation']['controller_version'], '0.6.3')
        self.assertEqual(calls[-1]['observation']['agent_version'], '0.6.1')
        self.assertEqual(calls[-1]['observation']['assignment_contract'], 3)
        self.assertIs(calls[-1]['observation']['full_test'], True)
        self.assertEqual(calls[-1]['observation']['stats_version'], 2)
        self.assertEqual(calls[-1]['observation']['pause_policy'], 2)
        self.assertEqual(calls[-1]['observation']['ready_seconds'], 300)
        self.assertEqual(calls[-1]['observation']['delivery'], adapter.spool.metrics())
        self.assertEqual(calls[-1]['observation']['map_inventory'],
                         {'version': 1, 'source': 'bsp_v30', 'complete': False, 'maps': []})

    def test_dispatch_negotiation_and_unhealthy_cleanup_preserve_journal_delivery(self):
        from unittest.mock import Mock
        for healthy in (True, False):
            with self.subTest(healthy=healthy):
                agent, calls = self.agent()
                agent.adapter.status = lambda: {'healthy': healthy, 'idle': True}
                agent.spool = Mock()
                agent.dispatch = Mock()
                commands = [{'type': 'load'}, {'type': 'cleanup'}]
                agent.send = Mock(return_value={'commands': commands, 'load_rejection_contract': 1})
                cycle(agent)
                agent.spool.tail.assert_called_once_with(agent.config['journal'])
                agent.spool.flush.assert_called_once_with(agent.send)
                expected = commands if healthy else commands[1:]
                self.assertEqual([((command, 1),) for command in expected],
                                 [(call.args,) for call in agent.dispatch.call_args_list])

    def test_missing_contract_remains_unnegotiated(self):
        from unittest.mock import Mock
        agent, _ = self.agent()
        command = {'type': 'cleanup'}
        agent.dispatch = Mock()
        agent.send = Mock(return_value={'commands': [command]})
        cycle(agent)
        agent.dispatch.assert_called_once_with(command, 0)

    def test_spools_keep_identity_sequences_separate_across_restarts(self):
        from mq_agent import Spool
        with tempfile.TemporaryDirectory() as directory:
            paths = [str(Path(directory) / name) for name in ('a.sqlite','b.sqlite')]
            a, b = [Spool(path) for path in paths]
            event = {'event_id':'event-1','match_id':'a'*24,'generation':1,'type':'test'}
            a.put(event)
            self.assertEqual(b.db.execute('SELECT COUNT(*) FROM events').fetchone()[0], 0)
            a.db.close()
            a = Spool(paths[0])
            a.put(event)
            self.assertEqual(a.db.execute('SELECT COUNT(*) FROM events').fetchone()[0], 1)
            a.db.close()
            b.db.close()

    def test_optional_round_reasons_survive_blocked_delivery_and_restart(self):
        import copy
        import json
        from mq_agent import Spool
        with tempfile.TemporaryDirectory() as directory:
            database = str(Path(directory) / 'spool.sqlite')
            journal = Path(directory) / 'events.jsonl'
            events = []
            for index, (kind, reason) in enumerate((('round', 'time'), ('finished', 'bomb_exploded'),
                                                   ('round', None), ('finished', None))):
                data = {'team1_score': 15 + index % 2, 'team2_score': 10, 'stats_version': 2, 'players': {}}
                if reason is not None:
                    data['round_reason'] = reason
                events.append({'event_id': f'result-{index}', 'match_id': ('a' if index < 2 else 'b') * 24,
                               'generation': 3, 'type': kind, 'data': data})
            journal.write_text(''.join(json.dumps(event) + '\n' for event in events))
            agent, _ = self.agent()
            agent.config['journal'] = str(journal)
            agent.spool = Spool(database)
            attempts = []
            def unavailable(body):
                if body['action'] == 'event':
                    attempts.append(copy.deepcopy(body))
                    raise ConnectionError('fixture upstream unavailable')
                return {'commands': []}
            agent.send = unavailable
            self.assertFalse(cycle(agent)['ready'])
            self.assertEqual(agent.spool.metrics()['pending'], len(events))
            cursor = agent.spool.get('tail:' + str(journal.resolve()))
            agent.spool.db.close()
            agent.spool = Spool(database)
            try:
                self.assertEqual(agent.spool.get('tail:' + str(journal.resolve())), cursor)
                accepted = []
                def available(body):
                    if body['action'] == 'event':
                        accepted.append(copy.deepcopy(body))
                    return {'commands': []}
                agent.send = available
                self.assertTrue(cycle(agent)['ready'])
                self.assertEqual(accepted[0], attempts[0])
                for index, expected in enumerate(events):
                    event = accepted[index]['event']
                    self.assertEqual(event, {**expected, 'schema_version': 1, 'sequence': index % 2 + 1,
                                             'boot_id': attempts[0]['event']['boot_id']})
                    self.assertEqual('round_reason' in event['data'], index < 2)
                self.assertEqual(agent.spool.metrics()['pending'], 0)
                self.assertTrue(cycle(agent)['ready'])
                self.assertEqual(len(accepted), len(events))
            finally:
                agent.spool.db.close()


    def test_upgrade_keeps_legacy_events_cursors_and_sequences(self):
        import json
        import sqlite3
        from mq_agent import Spool
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / 'spool.sqlite')
            previous = sqlite3.connect(path)
            previous.executescript('CREATE TABLE events(id TEXT PRIMARY KEY,body TEXT NOT NULL,sent INTEGER DEFAULT 0); CREATE TABLE state(key TEXT PRIMARY KEY,value TEXT NOT NULL);')
            event = {'event_id': 'old', 'match_id': 'a'*24, 'generation': 15,
                     'type': 'loaded', 'data': {'map': 'de_nuke'}}
            body = json.dumps({**event, 'schema_version': 1, 'sequence': 7, 'boot_id': 'original'})
            cursor = {'offset': 4096, 'inode': 12345}
            previous.execute('INSERT INTO events VALUES(?,?,0)', ('old', body))
            previous.executemany('INSERT INTO state VALUES(?,?)', [
                ('sequence:'+'a'*24+':15', '7'), ('tail:/journal/events.jsonl', json.dumps(cursor))])
            previous.commit()
            previous.close()
            spool = Spool(path)
            try:
                self.assertEqual(spool.get('tail:/journal/events.jsonl'), cursor)
                self.assertEqual(spool.db.execute('SELECT body,sent FROM events').fetchone(), (body, 0))
                self.assertEqual(spool.metrics()['pending'], 1)
                self.assertIsNone(spool.metrics()['oldest_pending_seconds'])
                spool.put(event)
                spool.put({**event, 'event_id': 'new', 'type': 'live'})
                delivered = []
                spool.flush(delivered.append)
                self.assertEqual([e['event']['sequence'] for e in delivered], [7, 8])
                self.assertEqual(delivered[0]['event']['boot_id'], 'original')
                self.assertEqual(spool.db.execute('SELECT COUNT(*) FROM events').fetchone()[0], 2)
            finally:
                spool.db.close()


if __name__ == '__main__':
    unittest.main()
