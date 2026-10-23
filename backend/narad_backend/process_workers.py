"""Spawn-safe worker entry points. Initialization payloads exclude API keys, sessions, and parent locks."""
from pathlib import Path
import signal

_INITIALIZATION_ERROR = None


def reset_worker_termination():
    # fork inherits Uvicorn's main-process SIGTERM handler. Pool.terminate()
    # must terminate a worker, not set an unused child server.should_exit flag.
    signal.signal(signal.SIGTERM, signal.SIG_DFL)


def initialize_forked_routed():
    reset_worker_termination()
    from . import engine
    engine._narad_routed_worker_initializer()


def initialize_forked_benchmark():
    reset_worker_termination()
    from . import engine
    engine.phase3k_farm_worker_initializer()


def initialize_routed(context):
    global _INITIALIZATION_ERROR
    reset_worker_termination()
    try:
        from . import engine
        ns = vars(engine)
        # Rebuild definitions and ContextVars in the fresh interpreter. This does
        # not fit models, run experiments, start HTTP, or load parent sessions.
        source = Path(__file__).with_name('transport.py')
        exec(compile(source.read_text(), str(source), 'exec'), ns)
        ns['_NARAD_ROUTED_FARM_CONTEXT'] = context
        engine._narad_routed_worker_initializer()
    except Exception as error:
        # Raising from Pool initializers can cause an endless respawn loop.
        # Let the first task report failure to the existing parent fallback path.
        _INITIALIZATION_ERROR = f'{type(error).__name__}: {error}'


def routed_pair(pair_index):
    if _INITIALIZATION_ERROR:
        raise RuntimeError('Spawned routed worker initialization failed: ' + _INITIALIZATION_ERROR)
    from . import engine
    return engine._narad_routed_worker_simulate_pair(pair_index)


def initialize_benchmark(configuration):
    global _INITIALIZATION_ERROR
    reset_worker_termination()
    try:
        from . import engine
        ns = vars(engine)
        source = Path(__file__).with_name('farm.py')
        exec(compile(source.read_text(), str(source), 'exec'), ns)
        ns.update(configuration)
        engine.phase3k_farm_worker_initializer()
    except Exception as error:
        _INITIALIZATION_ERROR = f'{type(error).__name__}: {error}'


def benchmark_pair(pair_index):
    if _INITIALIZATION_ERROR:
        raise RuntimeError('Spawned benchmark worker initialization failed: ' + _INITIALIZATION_ERROR)
    from . import engine
    return engine.phase3k_farm_worker(pair_index)
