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
