"""Initialize one process-local engine, then its original Phase 6 transport."""
import importlib.util
import json
import os
from pathlib import Path
import sys

from .calibration import load_calibration
from .capacity import available_cpus

ROOT = Path(__file__).resolve().parents[2]


def load_bridge():
    path = ROOT / 'gui/backend/gui_bridge.py'
    spec = importlib.util.spec_from_file_location('narad_server_gui_bridge', path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def create_runtime(*, calibration_path, api_key, worker_limit=None, graph_path=None):
    if not api_key or len(api_key) < 24:
        raise RuntimeError('Set NARAD_API_ACCESS_KEY to a private value of at least 24 characters.')
    from . import engine
    ns = vars(engine)
    if ns.get('_LOCAL_SERVER_INITIALIZED'):
        raise RuntimeError('One runtime per process is required; restart the process to reconfigure.')
    load_calibration(ns, calibration_path)
    ns['NARAD_API_ACCESS_KEY'] = api_key
    limit = available_cpus() if worker_limit is None else int(worker_limit)
    if limit < 1:
        raise ValueError('NARAD_CONTROLLER_MAX_CPU_WORKERS must be positive.')
    ns['NARAD_CONTROLLER_MAX_CPU_WORKERS'] = min(limit, available_cpus())
    bridge = load_bridge()
    graph = bridge.GraphInput.model_validate(json.loads(Path(graph_path or ROOT/'gui/examples/network.json').read_text()))
    ns['phase4_network'] = bridge.build_network(ns, graph)
    transport = Path(__file__).with_name('transport.py')
    exec(compile(transport.read_text(), str(transport), 'exec'), ns)
    # Notebook counts host logical CPUs; servers need affinity and cgroup awareness.
    ns['_narad_runtime_cpu_count'] = available_cpus
    ns['_LOCAL_SERVER_INITIALIZED'] = True
    return engine, bridge


def environment_worker_limit():
    value = os.environ.get('NARAD_CONTROLLER_MAX_CPU_WORKERS')
    if value:
        return int(value)
    profile = os.environ.get('NARAD_WORKER_PROFILE')
    if profile:
        report = json.loads(Path(profile).read_text())
        if not report.get('physics_equivalent') or report.get('recommended_workers',0) < 1:
            raise RuntimeError('Invalid worker benchmark profile.')
        return int(report['recommended_workers'])
    return 1  # Safe bootstrap until the operator benchmarks/configures this server.
