# Standalone backend validation — 22 October 2026

## Source

Fetched `origin/main` and compared `NARAD_QC.ipynb` with the workspace file: identical. Commit `41d36349bf6d0a19a4d913ac0ee4eee845b16a58`; full notebook hash and the 137 selected cell entries are recorded in `narad_backend/source_manifest.json`. These entries cover the runtime, ordered transport patches, optional fitting, and optional benchmark modules.

No notebook source was modified. Runtime definitions and internal protocol checks remain; top-level notebook verification/demo execution is excluded. Generated modules compile and import without Colab, notebook widgets, Qiskit/Aer, Drive paths, or notebook execution. Startup does not print access keys.

## Initial extraction checks

Python 3.12 virtual environment with `requirements.lock.txt` runtime versions:

- Imported the extracted engine and ran a real 20-km, one-repeater, eight-mode trajectory, including provisioned ML-DSA identities, physical generation/swapping, endpoint measurement, and consumed-resource accounting.
- Ran real route mutual authentication and BBM92 collection/post-processing on that short route.
- Exercised one-time CSV preparation with a synthetic 80-configuration × eight-trial table: canonical outcomes → grouped cross-validation → model selection → final regressions → grouped reliability calibration → export → import/checksum/version validation. This checks the preparation plumbing; it is not the project's real calibration.
- Ran the standalone ASGI app with that temporary model bundle and the actual engine: liveness/readiness, GUI and original API health, topology preview, asynchronous job submission, live native progress, and successful **128-bit** establishment.
- The real HTTP-driven simulation used **two CPU workers and four quantum lanes**. Its execution audit reported two worker processes and no direct fallback.
- Used that established session for Alice → Bob and Bob → Alice AES-GCM encryption and authenticated decryption. The physical/QKD executor and AES were not mocked. Only the routing-calibration training input was synthetic.
- Ran the retained worker-equivalence benchmark at one and two workers, four seeded trajectories, one repeat, 20 km / one repeater / eight modes. Discrete outcomes and physical quantities matched. A JSON recommendation was written outside the repository. This short smoke workload is not a deployment-server capacity recommendation.
- Checked public GUI/original OpenAPI docs, original API mount-prefix authentication behavior, unauthorized GUI/original operational calls, allowed-origin preflight, rejection of unlisted origins, and profile-controlled worker capacity.
- Checked fail-closed behavior for missing real model artifacts and invalid startup API-key configuration.

The synthetic CSV/model files and smoke benchmark output were written only under `/tmp`. None is supplied as a production artifact or placed in `backend/artifacts/`. The HTTP validation scripts were also temporary and are not part of the deployable runtime.

## Final validation with the supplied real calibration

The supplied `backend/artifacts/phase4_calibration_raw.csv` contains **640 rows across 80 configurations**, eight trials per configuration, and no duplicate pair IDs. There are 617 finite positive delivery outcomes. Source CSV SHA-256:

```text
f3751d715925d4b17dff4fac3434f49bdf9d4dae474c21e22f3194e7032d1b3f
```

Executed the one-time `prepare-calibration` command on this actual dataset. It produced `backend/artifacts/policy_c.joblib` and `policy_c.json`. The fitted models are quadratic Ridge pipelines for latency and visibility loss, a scaled logistic reliability model, and a logistic Platt calibrator. The model checksum matches the exported metadata and the bundle loads successfully in the pinned Python environment.

Then ran the standalone ASGI service with **that real model bundle** and a **200 km / two-repeater / eight-optical-mode-per-fibre** network:

- Policy C discovered and ranked Alice → R1 → R2 → Bob using the actual calibration models.
- Real ML-DSA authentication, generation/swapping, BBM92 collection, reconciliation, and privacy amplification completed successfully.
- Established a **128-bit key** through the GUI job API.
- Observed native progress during execution.
- Execution audit confirmed **two CPU workers, eight quantum lanes, two worker processes observed, and no direct fallback**.
- Alice → Bob and Bob → Alice both encrypted and authenticated/decrypted successfully with the established session.
- The local integration run completed in approximately 129 seconds. This is a functional verification result, not a target-server performance benchmark.
- Liveness/readiness, unauthorized-call rejection, and allowed-origin CORS preflight checks passed for the GUI and original API mounts.

Also launched the actual Uvicorn CLI on a temporary localhost port, checked liveness and an authenticated capacity request over a TCP socket, and shut it down cleanly with exit code 0. No temporary server was left running.

No synthetic calibration model was used for this final run. The earlier fixture checks remain above to document the extraction work. The real CSV, model files, and any worker profiles stay Git-ignored under `backend/artifacts/`; copy or mount the required artifacts when deploying.

## Deployment-specific checks

- Run the representative one-time worker benchmark **on the hosting server**, using its intended CPU/container limits, before selecting its worker cap. The local short smoke run is not that server's recommendation.
- Docker deployment files are supplied but Docker is unavailable in this local environment, so the image has not been built/run here. The engine, ASGI, and Uvicorn checks ran directly in Python on macOS; confirm Linux/container operation on the hosting machine.

The calibration-file dependency is resolved. Normal startup loads the fitted models without rerunning calibration or notebook cells. The example environment now leaves the worker profile optional so a first start can conservatively use one worker; enable the profile after benchmarking the target server.
