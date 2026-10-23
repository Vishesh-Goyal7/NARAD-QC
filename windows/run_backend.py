"""Windows launcher: load data from .env, never execute it as a script."""
import multiprocessing
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))


def run():
    from configure import read_environment
    path = ROOT / 'backend/.env'
    if not path.exists():
        raise SystemExit('Run windows/Configure.ps1 first.')
    os.chdir(ROOT)
    os.environ.update(read_environment(path))
    os.environ['NARAD_MP_START_METHOD'] = 'spawn'
    from narad_backend.__main__ import main
    sys.argv = ['narad_backend', 'serve', *sys.argv[1:]]
    main()


if __name__ == '__main__':
    multiprocessing.freeze_support()
    run()
