"""Container-aware CPU capacity. A benchmark recommendation can narrow this cap."""
import math
import os
from pathlib import Path


def available_cpus():
    counts = [os.cpu_count() or 1]
    if hasattr(os, 'sched_getaffinity'):
        counts.append(len(os.sched_getaffinity(0)))
    # Linux cgroup v2, then v1. Fractional quotas conservatively use whole workers.
    try:
        quota, period = Path('/sys/fs/cgroup/cpu.max').read_text().split()
        if quota != 'max':
            counts.append(max(1, math.floor(int(quota) / int(period))))
    except (OSError, ValueError):
        try:
            quota = int(Path('/sys/fs/cgroup/cpu/cpu.cfs_quota_us').read_text())
            period = int(Path('/sys/fs/cgroup/cpu/cpu.cfs_period_us').read_text())
            if quota > 0:
                counts.append(max(1, math.floor(quota / period)))
        except (OSError, ValueError):
            pass
    return max(1, min(counts))
