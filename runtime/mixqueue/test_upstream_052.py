import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

spec=importlib.util.spec_from_file_location('mq_agent',Path(__file__).parent/'mq_agent.py')
mq=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mq)

class ControlChannel(unittest.TestCase):
    def test_rejected_event_does_not_block_cleanup_or_allow_load(self):
        agent=object.__new__(mq.Agent)
        agent.config={'journal':'unused'}
        agent.adapter=SimpleNamespace(status=lambda:{'healthy':True})
        agent.spool=Mock()
        agent.spool.flush.side_effect=RuntimeError('simulated rejection')
        agent.send=Mock(return_value={'commands':[{'type':'load'},{'type':'cleanup'}],'load_rejection_contract':1})
        agent.dispatch=Mock()
        with self.assertLogs(level='ERROR'): agent.step()
        self.assertFalse(agent.send.call_args.args[0]['healthy'])
        agent.dispatch.assert_called_once_with({'type':'cleanup'},1)
        agent.spool.tail.assert_called_once_with('unused')
        agent.spool.flush.assert_called_once_with(agent.send)


class SpoolMetrics(unittest.TestCase):
    def test_pending_age_and_retained_identity(self):
        spool = mq.Spool(':memory:')
        try:
            event={'event_id':'metrics-1','match_id':'a'*24,'generation':1,'type':'pause','data':{}}
            spool.put(event)
            self.assertEqual(1,spool.metrics()['pending'])
            self.assertGreaterEqual(spool.metrics()['oldest_pending_seconds'],0)
            spool.flush(lambda body: None)
            self.assertEqual(0,spool.metrics()['pending'])
            self.assertIsNone(spool.metrics()['oldest_pending_seconds'])
            spool.put(event)
            self.assertEqual(1,spool.db.execute('SELECT count(*) FROM events').fetchone()[0])
        finally: spool.db.close()

if __name__=='__main__': unittest.main()
