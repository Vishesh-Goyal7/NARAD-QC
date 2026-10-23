import argparse
import importlib.metadata
import json
import math
import os
from pathlib import Path
import statistics
import time

from .capacity import available_cpus
from .runtime import ROOT


def prepare(args):
    import numpy as np
    import pandas as pd
    from . import engine
    from .calibration import FEATURES, export_calibration
    ns = vars(engine)
    ns['phase4_raw'] = pd.read_csv(args.csv)
    source = Path(__file__).with_name('fitting.py')
    exec(compile(source.read_text(), str(source), 'exec'), ns)
    df = ns['PHASE4_CAL_IMPROVED_SUMMARY_DF']
    ns['PHASE4_POLICY_C_CALIBRATION_BOUNDS'] = {
        name:[float(df[name].min()),float(df[name].max())] for name in FEATURES}
    meta = export_calibration(ns, args.output)
    print(json.dumps({'artifact':str(args.output), 'metadata':meta},indent=2))


def benchmark(args):
    import psutil
    from . import engine
    ns = vars(engine)
    source = Path(__file__).with_name('farm.py')
    exec(compile(source.read_text(), str(source), 'exec'), ns)
    from .parallel import install_parallel_support
    start_method = install_parallel_support(engine)
    capacity = available_cpus()
    if args.workers:
        counts = sorted(set(int(x) for x in args.workers.split(',')))
        if min(counts) < 1 or max(counts) > capacity:
            raise ValueError(f'Workers must be between 1 and available CPU capacity {capacity}.')
    else:
        # Sweep rather than assuming the old Colab recommendation of four workers.
        counts = sorted({1, *[2**i for i in range(capacity.bit_length()) if 2**i <= capacity],
                         min(capacity, psutil.cpu_count(logical=False) or capacity), capacity})
    counts = sorted(set([1,*counts]))
    pairs = args.pairs or max(48, 2*max(counts))
    if pairs < max(counts) or args.repeats < 1:
        raise ValueError('Use at least one pair per worker and one repeat.')
    ns.update(PHASE3K_FARM_DISTANCE_KM=args.distance_km,
              PHASE3K_FARM_REPEATER_COUNT=args.repeaters,
              PHASE3K_FARM_MODE_COUNT=args.modes)
    indices = tuple(range(1200,1200+pairs))
    reference = None
    rows=[]
    for count in counts:
        runs=[]
        for repeat in range(args.repeats):
            records, summary = engine.phase3k_run_trajectory_farm(indices,count)
            if reference is None:
                reference={r['pair_index']:r['payload'] for r in records}
            failures=engine.phase3k_validate_farm_against_reference(reference,records)
            if failures:
                raise RuntimeError(f'Physics equivalence failed at {count} workers: {failures[:2]}')
            summary = {k:(None if isinstance(v,float) and not math.isfinite(v) else v) for k,v in summary.items()}
            summary['repeat']=repeat+1
            summary['physics_equivalent']=True
            runs.append(summary)
        rows.append({'workers':count,'pairs_per_s':statistics.median(r['pairs_per_s'] for r in runs),
                     'runs':runs})
    best=max(rows,key=lambda r:r['pairs_per_s'])
    # Pick the smallest worker count within 3% of peak throughput.
    recommended=min(r['workers'] for r in rows if r['pairs_per_s']>=best['pairs_per_s']*.97)
    report={'schema_version':1,'process_start_method':start_method,'created_unix':time.time(),'available_cpus':capacity,
            'recommended_workers':recommended,'physics_equivalent':True,'pairs_per_repeat':pairs,
            'workload':{'distance_km':args.distance_km,'repeaters':args.repeaters,'modes':args.modes},
            'results':rows}
    path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print(f'Physics preserved. Recommended worker cap: {recommended}. Report: {path}')


def main():
    parser=argparse.ArgumentParser(description='NARAD-QC standalone backend')
    commands=parser.add_subparsers(dest='command',required=True)
    fit=commands.add_parser('prepare-calibration',help='One-time fit using real notebook calibration CSV')
    fit.add_argument('--csv',type=Path,required=True)
    fit.add_argument('--output',type=Path,default=ROOT/'backend/artifacts/policy_c.joblib')
    fit.set_defaults(func=prepare)
    bench=commands.add_parser('benchmark-workers',help='One-time real physical trajectory scaling/equivalence sweep')
    bench.add_argument('--workers',help='Comma-separated counts; default sweeps available CPU capacity')
    bench.add_argument('--pairs',type=int)
    bench.add_argument('--repeats',type=int,default=3)
    bench.add_argument('--distance-km',type=float,default=600.)
    bench.add_argument('--repeaters',type=int,default=6)
    bench.add_argument('--modes',type=int,default=8)
    bench.add_argument('--output',type=Path,default=ROOT/'backend/artifacts/workers.json')
    bench.set_defaults(func=benchmark)
    serve=commands.add_parser('serve',help='Serve one ASGI controller; internal CPU workers handle trajectories')
    serve.add_argument('--host',default='127.0.0.1')
    serve.add_argument('--port',type=int,default=8002)
    serve.set_defaults(func=lambda a: serve_backend(a))
    args=parser.parse_args();args.func(args)


def serve_backend(args):
    import uvicorn
    uvicorn.run('narad_backend.app:create_app',factory=True,host=args.host,port=args.port,workers=1)


if __name__=='__main__':
    import multiprocessing
    multiprocessing.freeze_support()
    main()
