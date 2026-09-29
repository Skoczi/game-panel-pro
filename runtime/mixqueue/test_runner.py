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
        adapter.rcon = SimpleNamespace(command=lambda command: '{"bridge":1,"solo_test":true,"healthy":true,"idle":true,"controller":"matchbot","controller_version":"0.5.1","assignment_contract":2,"full_test":true,"rules_ready":true}')
        agent.adapter = adapter
        self.assertTrue(cycle(agent)['ready'])
        self.assertEqual(calls[-1]['observation']['agent_protocol'], 2)
        self.assertEqual(calls[-1]['observation']['controller'], 'matchbot')
        self.assertIs(calls[-1]['observation']['rules_ready'], True)
        self.assertIs(calls[-1]['observation']['solo_test'], True)
        self.assertEqual(calls[-1]['observation']['controller_version'], '0.5.1')
        self.assertEqual(calls[-1]['observation']['agent_version'], '0.5.1')
        self.assertEqual(calls[-1]['observation']['assignment_contract'], 2)
        self.assertIs(calls[-1]['observation']['full_test'], True)
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


if __name__ == '__main__':
    unittest.main()
