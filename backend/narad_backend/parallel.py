"""Process-creation adapter; the extracted physics and QKD functions stay unchanged."""
import multiprocessing
import os

from . import process_workers


def selected_start_method():
    method = os.environ.get('NARAD_MP_START_METHOD') or ('spawn' if os.name == 'nt' else 'fork')
    if method not in ('fork', 'spawn') or method not in multiprocessing.get_all_start_methods():
        raise RuntimeError(f'Unsupported NARAD_MP_START_METHOD={method!r}; use spawn on Windows.')
    return method


class SpawnPool:
    def __init__(self, context, namespace, *args, **kwargs):
        initializer = kwargs.get('initializer')
        name = getattr(initializer, '__name__', '')
        self.routed = name == '_narad_routed_worker_initializer'
        self.benchmark = name == 'phase3k_farm_worker_initializer'
        if self.routed:
            state = namespace.get('_NARAD_ROUTED_FARM_CONTEXT')
            if not state:
                raise RuntimeError('Routed worker configuration is missing.')
            # Only topology, selected path, protocol config, and deterministic
            # trajectory seeds. Never copy the whole engine namespace.
            state = {key: state[key] for key in (
                'network', 'candidate_path', 'qkd_config', 'physical_seed', 'protocol_seed')}
            kwargs.update(initializer=process_workers.initialize_routed, initargs=(state,))
        elif self.benchmark:
            state = {k:v for k,v in namespace.items() if k.startswith('PHASE3K_FARM_')}
            for key in ('PHASE3K_PARALLEL_PHYSICAL_MASTER_SEED', 'PHASE3K_PARALLEL_PROTOCOL_MASTER_SEED'):
                state[key] = namespace[key]
            kwargs.update(initializer=process_workers.initialize_benchmark, initargs=(state,))
        self.pool = context.Pool(*args, **kwargs)

    def apply_async(self, function, *args, **kwargs):
        if self.routed and function.__name__ == '_narad_routed_worker_simulate_pair':
            function = process_workers.routed_pair
        return self.pool.apply_async(function, *args, **kwargs)

    def imap_unordered(self, function, *args, **kwargs):
        if self.benchmark and function.__name__ == 'phase3k_farm_worker':
            function = process_workers.benchmark_pair
        return self.pool.imap_unordered(function, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self.pool, name)

    def __enter__(self):
        self.pool.__enter__()
        return self

    def __exit__(self, *args):
        return self.pool.__exit__(*args)


class SpawnContext:
    def __init__(self, context, namespace):
        self.context, self.namespace = context, namespace

    def Pool(self, *args, **kwargs):
        return SpawnPool(self.context, self.namespace, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self.context, name)


class ProcessModule:
    def __init__(self, namespace, method):
        self.namespace, self.method = namespace, method

    def get_context(self, method=None):
        # Original generated cells request fork. Resolve that request for the
        # standalone target OS without monkeypatching multiprocessing globally.
        context = multiprocessing.get_context(self.method)
        return SpawnContext(context, self.namespace) if self.method == 'spawn' else context

    def __getattr__(self, name):
        return getattr(multiprocessing, name)


def install_parallel_support(engine):
    method = selected_start_method()
    engine.mp = ProcessModule(vars(engine), method)
    engine.NARAD_PROCESS_START_METHOD = method
    return method
