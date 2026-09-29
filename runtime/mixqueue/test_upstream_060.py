import unittest,copy
from unittest.mock import Mock
from test_upstream import agent
import test_upstream
class Contract3(unittest.TestCase):
 def test_wire_both_sides_and_retries(self):
  p=test_upstream.FullTestContract().fixture();p['contract_version']=3
  for side in (1,2):
   p['starting_ct_team']=side;wire=agent.AmxxAdapter.build(p)
   self.assertTrue(wire.startswith('MQ2V3 '));self.assertTrue(wire.splitlines()[0].endswith(' 2 '+str(side)))
   self.assertEqual(wire,agent.AmxxAdapter.build(p));self.assertEqual(12,len(wire.splitlines()))
 def test_missing_and_invalid_sides(self):
  for side in (None,True,False,0,3,'1','ct'):
   p=test_upstream.FullTestContract().fixture();p.update(contract_version=3,starting_ct_team=side)
   with self.assertRaises(ValueError):agent.AmxxAdapter.build(p)
 def test_no_silent_downgrade(self):
  p=test_upstream.FullTestContract().fixture();p.update(contract_version=3,starting_ct_team=2)
  a=agent.AmxxAdapter.__new__(agent.AmxxAdapter);a.root=agent.Path('/unused');a.rcon=Mock()
  a.status=Mock(return_value=dict(controller='matchbot',controller_version='0.5.3',assignment_contract=2,healthy=True,idle=True,matchid='',full_test=True,solo_test=True,map_inventory={'complete':True,'maps':[p['map']]}))
  with self.assertRaises(agent.LoadRejected):a.execute(dict(type='load',match_id=p['match_id'],generation=p['generation'],payload=p))
  a.rcon.command.assert_not_called()
 def test_reason_on_v3(self):
  self.assertEqual('mq2_clear test_admin',agent.AmxxAdapter.clear_command(agent.AmxxAdapter.__new__(agent.AmxxAdapter),{'payload':{'reason':'test_admin'}},{'assignment_contract':3}))
if __name__=='__main__':unittest.main()
