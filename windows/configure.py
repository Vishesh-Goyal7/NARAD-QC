"""Configure Windows without replacing an existing private operator key."""
import argparse
import json
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from narad_backend.capacity import available_cpus


def read_environment(path):
    values = {}
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            name, separator, value = line.partition('=')
            if not separator or not name.startswith('NARAD_'):
                raise ValueError(f'Invalid environment setting: {name}')
            values[name] = value.strip().strip('\"\'')
    return values


def configure(max_workers=0):
    path = ROOT / 'backend/.env'
    values = read_environment(path)
    profile_path = ROOT / 'backend/artifacts/workers.json'
    profile = json.loads(profile_path.read_text()) if profile_path.exists() else None
    if max_workers < 0:
        raise ValueError('MaxWorkers must be positive, or omitted to use the benchmark.')
    if not max_workers:
        if not profile or not profile.get('physics_equivalent'):
            raise ValueError('Run Benchmark-Workers.ps1, or provide -MaxWorkers 1 for a conservative first start.')
        if profile.get('process_start_method') != 'spawn':
            raise ValueError('This worker profile is not a Windows/spawn benchmark. Benchmark this machine again.')
        max_workers = int(profile['recommended_workers'])
    cap = min(max_workers, available_cpus(), 64)
    if cap < 1:
        raise ValueError('Invalid worker cap.')
    values.setdefault('NARAD_API_ACCESS_KEY', secrets.token_urlsafe(32))
    if len(values['NARAD_API_ACCESS_KEY']) < 24:
        raise ValueError('Existing API key is too short. Correct it in backend/.env first.')
    values.setdefault('NARAD_ALLOWED_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173')
    values['NARAD_CALIBRATION_PATH'] = 'backend/artifacts/policy_c.joblib'
    values['NARAD_CONTROLLER_MAX_CPU_WORKERS'] = str(cap)
    values['NARAD_MP_START_METHOD'] = 'spawn'
    if profile and profile.get('process_start_method') == 'spawn' and profile.get('physics_equivalent'):
        values['NARAD_WORKER_PROFILE'] = 'backend/artifacts/workers.json'
    else:
        values.pop('NARAD_WORKER_PROFILE', None)
    path.write_text(''.join(f'{key}={value}\n' for key,value in values.items()), encoding='utf-8')
    print(f'Configured backend/.env. Hard CPU-worker cap: {cap}. API key retained privately in that file.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--max-workers', type=int, default=0)
    configure(parser.parse_args().max_workers)
