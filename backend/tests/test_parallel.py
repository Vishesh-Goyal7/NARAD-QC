"""Small actual-physics checks for Windows spawn and POSIX fork, without model fitting."""
import math
import multiprocessing
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from narad_backend import engine
from narad_backend import process_workers
from narad_backend.parallel import SpawnPool, selected_start_method


def context():
    network = engine.OperatorQuantumNetwork(name='Process parity')
    network.add_user(name='Alice',x_km=0,y_km=0,memory_slots=2)
    network.add_repeater(name='R1',x_km=10,y_km=0,memory_slots=8,bsm_units=2,bsm_success_probability=.4)
    network.add_user(name='Bob',x_km=20,y_km=0,memory_slots=2)
    network.connect_fiber('Alice','R1',multiplexing_modes=8,attenuation_db_per_km=.2)
    network.connect_fiber('R1','Bob',multiplexing_modes=8,attenuation_db_per_km=.2)
    return {'network':network,
            'candidate_path':engine.phase4_build_candidate_path(network,0,('Alice','R1','Bob')),
            'qkd_config':engine.PHASE3J_BIASED_BBM92_CONFIG,'physical_seed':12345,'protocol_seed':67890}


class ProcessParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        process_workers.initialize_routed(context())
        cls.reference=[engine._narad_routed_worker_simulate_pair(i)['payload'] for i in range(3)]

    def compare(self, actual):
        for ref, got in zip(self.reference,actual):
            self.assertEqual(set(ref),set(got))
            for key,value in ref.items():
                if key=='resource_id':
                    continue
                if isinstance(value,float):
                    self.assertTrue(math.isclose(value,got[key],rel_tol=0,abs_tol=1e-15),key)
                else:
                    self.assertEqual(value,got[key],key)

    def test_spawn_preserves_routed_trajectory_physics(self):
        with SpawnPool(multiprocessing.get_context('spawn'),vars(engine),processes=2,
                       initializer=engine._narad_routed_worker_initializer) as pool:
            tasks=[pool.apply_async(engine._narad_routed_worker_simulate_pair,(i,)) for i in range(3)]
            self.compare([t.get(timeout=90)['payload'] for t in tasks])

    @unittest.skipUnless('fork' in multiprocessing.get_all_start_methods(),'fork is POSIX only')
    def test_original_fork_matches_same_reference(self):
        with multiprocessing.get_context('fork').Pool(2,initializer=engine._narad_routed_worker_initializer) as pool:
            self.compare([r['payload'] for r in pool.map(engine._narad_routed_worker_simulate_pair,range(3))])

    def test_invalid_start_method_rejected(self):
        with patch.dict(os.environ,{'NARAD_MP_START_METHOD':'invalid'}):
            with self.assertRaises(RuntimeError):selected_start_method()

    def test_windows_affinity_limits_capacity(self):
        from narad_backend.capacity import available_cpus
        with patch('narad_backend.capacity.os',SimpleNamespace(name='nt',cpu_count=lambda:8)), patch('psutil.Process') as process, patch('narad_backend.capacity.Path.read_text',side_effect=FileNotFoundError):
            process.return_value.cpu_affinity.return_value=[0,1]
            # macOS lacks sched_getaffinity; Linux affinity may further bound it.
            self.assertLessEqual(available_cpus(),2)


if __name__=='__main__':
    multiprocessing.freeze_support()
    unittest.main()
