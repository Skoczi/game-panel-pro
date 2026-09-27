import unittest
from eserv_availability_monitor import transition


class MonitorTests(unittest.TestCase):
    def test_thresholds_and_restart_deduplication(self):
        state = {}
        for now in range(2):
            state, event = transition(state, False, now)
            self.assertIsNone(event)
        state, event = transition(state, False, 3)
        self.assertEqual(event['status'], 'down')
        for now in range(4, 15):
            state, event = transition(dict(state), False, now)
            self.assertIsNone(event)
        state, event = transition(state, True, 15)
        self.assertIsNone(event)
        state, event = transition(state, True, 16)
        self.assertEqual(event['status'], 'ok')
        state, event = transition(state, True, 17)
        self.assertIsNone(event)


if __name__ == '__main__':
    unittest.main()
