"""HTTP integration tests with real AES and a fixture protocol executor.
These test bridge semantics, not quantum physics or notebook model accuracy.
"""
import copy
from dataclasses import dataclass
import importlib.util
import json
from pathlib import Path
import secrets
import sys
import threading
import time
import types
import unittest
from Crypto.Cipher import AES
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gui_bridge import install_gui_bridge

@dataclass
class Config:
    target_secret_bits: int = 128
    z_probability: float = .8
    qber_abort_threshold: float = .11
    minimum_parameter_estimation_bits: int = 24
    parameter_estimation_margin: float = .01
    security_margin_bits: int = 32
    reconciliation_efficiency_forecast: float = 1.16
    collection_headroom_bits: int = 32
    collection_check_interval_pairs: int = 16
    max_delivered_pairs: int = 5000
    max_slots_per_pair: int = 20000
    cascade_passes: int = 8

class FakeNetwork:
    def __init__(self, name): self.name, self.nodes, self.links = name, [], []
    def add_user(self, **kwargs): self.nodes.append(kwargs)
    def add_repeater(self, **kwargs): self.nodes.append(kwargs)
    def connect_fiber(self, *args, **kwargs): self.links.append((args, kwargs))

class Kernel:
    def emit(self, **kwargs): return types.SimpleNamespace(**kwargs)

def fixture_namespace(parallel=False):
    import contextvars
    ns = {"OperatorQuantumNetwork": FakeNetwork, "SimulationKernel": type('FixtureKernel', (Kernel,), {}),
          "PHASE3J_BIASED_BBM92_CONFIG": Config(), "NARAD_API_ACCESS_KEY": "fixture-access-only",
          "NARAD_API_ESTABLISHMENT_EXECUTION_LOCK": threading.Lock(),
          "_NARAD_REQUEST_QKD_CONFIG": contextvars.ContextVar('fixture_config', default=None),
          "calls": 0, "SimpleNamespace": types.SimpleNamespace, "secrets": secrets, "time": time}
    exec('''
def _narad_rank_routes_policy_c(network, sender_name, receiver_name, max_hops=None):
    candidate = SimpleNamespace(node_names=(sender_name, 'R1', receiver_name),path_index=0,display_path='fixture path')
    row = dict(candidate=candidate, score=1.0,predicted_service_probability=.99,predicted_median_delivery_s=.01,predicted_delivered_visibility=.98,predicted_delivered_qber=.01)
    return ((row,), (candidate,), (), (candidate,))
def _narad_authenticate_selected_path(stack): return (1,2,3)
def _narad_run_qkd_until_actual_key(**kw): return None
def phase3k_distill_configurable_bbm92_key(**kw): return SimpleNamespace(final_secret_bits=128)
def narad_qc_establish_key(network,sender_name,receiver_name,qkd_config,**kw):
    global calls
    calls += 1
    routes = _narad_rank_routes_policy_c(network,sender_name,receiver_name)
    stack = dict(path=[SimpleNamespace(name=n) for n in routes[0][0]['candidate'].node_names])
    _narad_authenticate_selected_path(stack=stack)
    _narad_run_qkd_until_actual_key(stack=stack)
    SimulationKernel().emit(event_type='QKD_BELL_PAIR_MEASURED',node_names=(sender_name,receiver_name),message='fixture pair')
    phase3k_distill_configurable_bbm92_key()
    time.sleep(.02)
    return SimpleNamespace(key=secrets.token_bytes(qkd_config.target_secret_bits//8), sender=sender_name,receiver=receiver_name,selected_node_names=(sender_name,'R1',receiver_name),final_secret_bits=qkd_config.target_secret_bits)
def narad_api_public_result(result):
    return dict(sender=result.sender,receiver=result.receiver,selected_node_names=list(result.selected_node_names),final_secret_bits=result.final_secret_bits,delivered_pairs=16,observed_x_qber=.01,modeled_physical_time_s=.2)
''', ns)
    def encrypt(plain, key):
        cipher = AES.new(key, AES.MODE_GCM, nonce=secrets.token_bytes(12))
        encrypted, tag = cipher.encrypt_and_digest(plain)
        return cipher.nonce + encrypted + tag
    def decrypt(blob, key):
        return AES.new(key, AES.MODE_GCM, nonce=blob[:12]).decrypt_and_verify(blob[12:-16], blob[-16:])
    ns.update(aes_gcm_encrypt=encrypt, aes_gcm_decrypt=decrypt)
    if parallel:
        import ast, math
        notebook = json.loads((Path(__file__).resolve().parents[3] / 'NARAD_QC.ipynb').read_text())
        source = next(''.join(c['source']) for c in notebook['cells'] if ''.join(c.get('source',[])).startswith('# @title  Runtime Parallelism + Live QKD Telemetry'))
        helpers = [node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name in {'_narad_safe_float','_narad_progress_payload','_narad_applied_cpu_workers'}]
        native = dict(math=math,time=time,NARAD_CONTROLLER_MAX_CPU_WORKERS=4,_narad_runtime_cpu_count=lambda:8)
        exec(compile(ast.Module(body=helpers,type_ignores=[]),'notebook_parallel_helpers','exec'),native)
        original=ns['narad_qc_establish_key']
        def establish(network,sender_name,receiver_name,qkd_config,*,cpu_workers=1,parallel_quantum_lanes=1,progress_callback=None,execution_audit=None,**kwargs):
            applied=native['_narad_applied_cpu_workers'](cpu_workers,parallel_quantum_lanes)
            ns['forwarded']=(cpu_workers,parallel_quantum_lanes)
            execution_audit.update(requested_cpu_workers=cpu_workers,requested_parallel_quantum_lanes=parallel_quantum_lanes,applied_cpu_workers=applied,applied_parallel_quantum_lanes=parallel_quantum_lanes)
            summary=types.SimpleNamespace(delivered_pairs=320,zz_key_basis_bits=205,xx_parameter_estimation_bits=17,observed_x_qber=.038,mean_predicted_qber=.041,phase_error_estimate=.051,forecast_extractable_bits=71,collection_ready=False,physical_time_s=2.75,elementary_generation_cycles=1550,optical_mode_attempts=8220,bsm_attempts=640)
            ns['published']=native['_narad_progress_payload']('QKD_COLLECTION',qkd_config,summary,applied_cpu_workers=applied,applied_parallel_quantum_lanes=parallel_quantum_lanes)
            progress_callback({**ns['published'],'key':'must-not-leak'})
            result=original(network,sender_name,receiver_name,qkd_config,**kwargs)
            if ns.get('simulate_worker_fallback'):
                execution_audit.update(applied_cpu_workers=1,worker_snapshot={'applied_cpu_workers':1,'direct_fallback':True})
                progress_callback(dict(stage='COMPLETE',final_secret_bits=128,worker_state={'applied_cpu_workers':1,'direct_fallback':True}))
            return result
        ns.update(narad_qc_establish_key=establish,NARAD_CONTROLLER_MAX_CPU_WORKERS=4,_narad_runtime_cpu_count=lambda:8)
    return ns

def request():
    nodes = [dict(name='Alice',role='USER',x_km=0,y_km=0,memory_slots=2,bsm_units=0,bsm_success_probability=0),
             dict(name='R1',role='REPEATER',x_km=50,y_km=0,memory_slots=8,bsm_units=2,bsm_success_probability=.4),
             dict(name='Bob',role='USER',x_km=100,y_km=0,memory_slots=2,bsm_units=0,bsm_success_probability=0)]
    links = [dict(source='Alice',target='R1',modes=8),dict(source='R1',target='Bob',modes=8)]
    return dict(request_id='fixture-job-001',graph=dict(name='Custom graph',nodes=nodes,links=links),sender='Alice',receiver='Bob')

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.ns = fixture_namespace()
        self.app = install_gui_bridge(self.ns)
        self.client = TestClient(self.app)
        self.headers = {'X-NARAD-API-Key':self.ns['NARAD_API_ACCESS_KEY']}
    def tearDown(self):
        self.app.state.gui_pool.shutdown(wait=True)
        self.client.close()
    def get(self,path): return self.client.get('/gui'+path,headers=self.headers)
    def post(self,path,body): return self.client.post('/gui'+path,json=body,headers=self.headers)
    def complete_job(self, body=None):
        self.assertEqual(self.post('/jobs',body or request()).status_code,202)
        for _ in range(100):
            response=self.get('/jobs/fixture-job-001').json()
            if response['status'] in ['SUCCEEDED','FAILED']:break
            time.sleep(.01)
        self.assertEqual(response['status'],'SUCCEEDED',response)
        return response
    def test_auth_and_browser_preflight(self):
        self.assertEqual(self.client.get('/gui/health').status_code,401)
        self.assertEqual(self.client.get('/gui/health',headers={'X-NARAD-API-Key':'wrong'}).status_code,401)
        preflight=self.client.options('/gui/jobs',headers={'Origin':'http://localhost:5173','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-narad-api-key'})
        self.assertEqual(preflight.status_code,200)
        self.assertEqual(preflight.headers['access-control-allow-origin'],'http://localhost:5173')
        response=self.client.get('/gui/health',headers={**self.headers,'Origin':'http://localhost:5173'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.headers['cache-control'],'no-store')
    def test_graph_validation_and_custom_preview(self):
        body=request();body.pop('request_id')
        self.assertEqual(self.post('/preview',body).status_code,200)
        body['graph']['links'].append(body['graph']['links'][0])
        self.assertEqual(self.post('/preview',body).status_code,422)
        body=request();body['receiver']='R1'
        self.assertEqual(self.post('/jobs',body).status_code,422)
    def test_progress_key_secrecy_idempotency_and_cursor(self):
        job=self.complete_job()
        self.assertNotIn('key',job['result'])
        self.assertEqual(job['result']['execution']['applied_cpu_workers'],1)
        stages={e['stage'] for e in job['events']}
        self.assertTrue({'routing','authentication','generation','distillation','complete'}.issubset(stages))
        self.assertEqual(self.get(f"/jobs/fixture-job-001?after={job['cursor']}").json()['events'],[])
        self.assertEqual(self.post('/jobs',request()).status_code,202)
        self.assertEqual(self.ns['calls'],1)
        different=request();different['graph']['name']='Changed'
        self.assertEqual(self.post('/jobs',different).status_code,409)
    def test_real_aes_roundtrip_tamper_and_session_destruction(self):
        job=self.complete_job();sid=job['result']['session_id']
        data=self.post(f'/sessions/{sid}/messages',dict(sender='Alice',receiver='Bob',message='Hello, दुनिया!')).json()
        self.assertNotIn('message',data)
        inbox=self.get(f'/sessions/{sid}/messages').json()
        self.assertEqual(inbox['messages'][0]['ciphertext_b64'],data['ciphertext_b64'])
        self.assertNotIn('message',inbox['messages'][0])
        self.assertEqual(self.get(f'/sessions/{sid}/messages?after=1').json()['messages'],[])
        decoded=self.post(f'/sessions/{sid}/decrypt',dict(ciphertext_b64=data['ciphertext_b64']))
        self.assertEqual(decoded.json()['message'],'Hello, दुनिया!')
        import base64
        blob=bytearray(base64.b64decode(data['ciphertext_b64']));blob[-1]^=1
        self.assertEqual(self.post(f'/sessions/{sid}/decrypt',dict(ciphertext_b64=base64.b64encode(blob).decode())).status_code,400)
        shared_key=self.app.state.gui_sessions[sid]['key']
        reply=self.post(f'/sessions/{sid}/messages',dict(sender='Bob',receiver='Alice',message='Reply using the same key!'))
        self.assertEqual(reply.status_code,200)
        self.assertEqual((reply.json()['sender'],reply.json()['receiver']),('Bob','Alice'))
        self.assertEqual(self.app.state.gui_sessions[sid]['key'],shared_key)
        self.assertNotEqual(base64.b64decode(reply.json()['ciphertext_b64'])[:12],base64.b64decode(data['ciphertext_b64'])[:12])
        self.assertEqual(self.post(f'/sessions/{sid}/decrypt',dict(ciphertext_b64=reply.json()['ciphertext_b64'])).json()['message'],'Reply using the same key!')
        self.assertEqual(self.post(f'/sessions/{sid}/messages',dict(sender='Charlie',receiver='Alice',message='Not a participant')).status_code,403)
        self.assertEqual(self.post(f'/sessions/{sid}/messages',dict(sender='Alice',receiver='Alice',message='Self-send')).status_code,403)
        self.assertEqual(self.client.delete(f'/gui/sessions/{sid}',headers=self.headers).status_code,200)
        self.assertEqual(self.post(f'/sessions/{sid}/decrypt',dict(ciphertext_b64=data['ciphertext_b64'])).status_code,404)
    def test_expired_session_is_unusable(self):
        job=self.complete_job();sid=job['result']['session_id']
        self.app.state.gui_sessions[sid]['created']-=1801
        self.assertEqual(self.post(f'/sessions/{sid}/messages',dict(sender='Alice',receiver='Bob',message='Expired')).status_code,404)
    def test_concurrent_two_way_sends_share_a_unique_nonce_space(self):
        from concurrent.futures import ThreadPoolExecutor
        import base64
        sid=self.complete_job()['result']['session_id']
        def send(i):
            a,b=('Alice','Bob') if i%2==0 else ('Bob','Alice')
            response=self.post(f'/sessions/{sid}/messages',dict(sender=a,receiver=b,message=f'Message {i}'))
            self.assertEqual(response.status_code,200)
            return response.json()
        with ThreadPoolExecutor(max_workers=4) as pool:
            records=list(pool.map(send,range(16)))
        nonces=[base64.b64decode(r['ciphertext_b64'])[:12] for r in records]
        self.assertEqual(len(set(nonces)),16)
        self.assertEqual({r['message_index'] for r in records},set(range(1,17)))
        self.assertEqual(len(self.get(f'/sessions/{sid}/messages').json()['messages']),16)

class ParallelBridgeTests(BridgeTests):
    def setUp(self):
        self.ns=fixture_namespace(parallel=True)
        self.app=install_gui_bridge(self.ns)
        self.client=TestClient(self.app)
        self.headers={'X-NARAD-API-Key':self.ns['NARAD_API_ACCESS_KEY']}
    def test_workers_capacity_and_real_callback_fields(self):
        capacity=self.get('/runtime/capacity').json()
        self.assertEqual(capacity['max_safe_cpu_workers'],4)
        self.assertTrue(capacity['native_progress_supported'])
        body=request();body['execution']=dict(cpu_workers=4,parallel_quantum_lanes=8)
        job=self.complete_job(body)
        self.assertEqual(self.ns['forwarded'],(4,8))
        self.assertEqual(job['result']['execution']['applied_cpu_workers'],4)
        self.assertEqual(job['result']['execution']['applied_parallel_quantum_lanes'],8)
        self.assertEqual(job['progress']['zz_bits'],205)
        self.assertEqual(job['progress']['xx_bits'],17)
        self.assertEqual(job['progress']['forecast_secret_fraction'],71/128)
        self.assertNotIn('key',job['progress'])
    def test_one_lane_bounds_workers_and_worker_fallback_is_reported(self):
        body=request();body['execution']=dict(cpu_workers=4,parallel_quantum_lanes=1)
        job=self.complete_job(body)
        self.assertEqual(job['result']['execution']['applied_cpu_workers'],1)
        self.ns['simulate_worker_fallback']=True
        body['request_id']='fixture-job-fallback';body['execution']['parallel_quantum_lanes']=8
        self.assertEqual(self.post('/jobs',body).status_code,202)
        for _ in range(100):
            job=self.get('/jobs/fixture-job-fallback').json()
            if job['status'] in ('SUCCEEDED','FAILED'):break
            time.sleep(.01)
        self.assertEqual(job['status'],'SUCCEEDED')
        self.assertEqual(job['progress']['applied_cpu_workers'],1)
        self.assertEqual(job['result']['execution']['applied_parallel_quantum_lanes'],8)

    def test_forked_workers_do_not_acquire_parent_observer_locks(self):
        from gui_bridge import JobObserver
        import multiprocessing as mp
        if 'fork' not in mp.get_all_start_methods():self.skipTest('Requires fork backend')
        lock=threading.Lock();lock.acquire()
        job={'seq':0,'events':[],'progress':{}}
        observer=JobObserver(job,lock)
        receive,send=mp.get_context('fork').Pipe(False)
        def child():
            observer('generation','child must not publish')
            observer.progress({'stage':'QKD_COLLECTION','delivered_pairs':1})
            send.send('returned without parent lock')
        process=mp.get_context('fork').Process(target=child)
        process.start()
        try:
            self.assertTrue(receive.poll(3),'Child attempted to acquire an inherited locked observer')
            self.assertEqual(receive.recv(),'returned without parent lock')
        finally:
            lock.release();process.join(1)
            if process.is_alive():process.terminate();process.join()
            receive.close();send.close()

if __name__=='__main__':unittest.main(verbosity=2)
