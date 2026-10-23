# Windows compatibility validation — 23 October 2026

## Implementation

- One shared engine and React frontend; no Windows copy of the physics or protocol.
- Automatic Windows `spawn` selection, with a standalone process adapter installed after the generated transport/farm definitions.
- Stable importable worker functions initialize fresh child state explicitly. Routed initialization transfers topology, selected path, QKD configuration and physical/protocol seeds; benchmark initialization transfers its actual workload/seed constants.
- Existing resource lifecycles, authentication, physical RNG, lane completion ordering, measurement collection, reconciliation, privacy amplification, telemetry, session binding and AES nonce handling remain in the shared code.
- Windows affinity is included in the CPU-capacity calculation. Benchmark reports record their process start method.
- PowerShell setup, calibration, benchmark, cap configuration, backend/frontend launch, and verification scripts use the native Scripts/python.exe layout and npm.cmd.
- Configure preserves an existing API key. Startup reads .env as data, never as executable shell code. A guarded launcher calls freeze_support().

## Checks executed in this workspace

Host: macOS / Python 3.12. Native Windows execution was not available.

1. **Four backend checks passed:** direct-versus-spawn routed trajectory equivalence, original fork parity, invalid start-method rejection, and emulated Windows affinity limits. Physical fields matched at absolute tolerance 1e-15; resource IDs are excluded because object identity is not physics.
2. **Spawn benchmark passed:** one/two processes, four trajectories, one repeat, 20 km / one repeater / eight optical modes. Its report was written under /tmp, not used to configure a Windows server.
3. **Real protocol with spawn passed:** actual supplied calibration, Policy C preview, real ML-DSA authentication and 128-bit QKD establishment on a 200 km / two-repeater / eight-mode route. Native telemetry reported two CPU workers, eight quantum lanes, two processes observed, and no direct fallback. Elapsed time was approximately 159 seconds.
4. **Two-way AES passed:** Alice-to-Bob and Bob-to-Alice encryption and authenticated decryption using the QKD-established session. No synthetic routing calibration was used for this run.
5. **Nine frontend tests and production build passed.** Existing splash, footer, graph editor and protocol UI are shared unchanged.
6. **Windows wheel resolution passed:** downloaded every pinned runtime dependency for Windows x64 / CPython 3.12 with binary-only resolution. This includes the native numerical and cryptography packages. Downloading compatible wheels is not the same as executing their DLLs on Windows.

## Native-host acceptance

On a Windows x64 machine:

1. Follow README.Windows.md and run windows/Setup.ps1.
2. Prepare calibration, benchmark that machine and configure its cap.
3. Run windows/Verify.ps1. The POSIX fork test should skip; spawn parity should pass.
4. Start the backend/frontend, connect, import gui/examples/first-run-network.json and establish a 128-bit session.
5. Confirm actual applied workers, absence of unexpected fallback, progress, and both message directions.
6. Check PowerShell exit/restart behavior and any hosting reverse proxy on that host.

The PowerShell scripts have been reviewed here but not executed in PowerShell or on Windows. Native-host acceptance remains necessary. The implementation adds Windows support without claiming a Windows-host run that did not occur.

### Shared lifecycle regression

The backend process suite now contains five checks, including a POSIX regression for inherited Uvicorn SIGTERM handlers. The initializer restores default worker termination handling; it does not change physics, scheduling, or parent signal handling. That POSIX-only check skips on Windows, alongside fork parity. Spawn parity remains covered.

### Collection graph

The Windows launcher uses the same `gui` source as macOS, including the three live collection lines and their matching shaded areas (total pairs, ZZ bits and XX bits). The count axis starts at 0–700 and expands above 700; the time axis starts at 0–120 seconds and expands for longer runs. No separate Windows frontend build or source copy is required. All 13 shared frontend tests and the production build passed on macOS after these changes; native Windows visual acceptance remains pending.
