# NARAD-QC React network console

An interactive React/Vite workspace for designing an optical quantum network, running the notebook protocol, observing link activity, and exchanging AES-GCM messages. The original notebook is unchanged.

## Start the GUI

From the repository root, with Node 20.19+ or 22.12+:

```sh
npm --prefix gui install
npm --prefix gui run dev
```

Open **http://127.0.0.1:5173**. The app initially uses a clearly labelled interactive demo. The demo animates the workflow and uses a fresh, non-extractable browser AES-GCM key. It does **not** claim to execute ML-DSA, BBM92, physical simulation, or Policy C. Its route preview is a local distance/multiplexing heuristic.

## Connect a local or hosted backend

See [`../backend/README.md`](../backend/README.md) for the standalone Python server. Start it with fitted calibration artifacts, then use the existing **Connect notebook** control with `http://127.0.0.1:8002` (or your hosted HTTPS backend URL) and the configured API key. The same GUI API supports workers, telemetry, and two-way messaging without Colab.

## Connect the actual notebook

The existing Phase 6 endpoints cannot submit a custom topology or stream protocol events. The separate bridge supplies those features without rewriting the notebook or routing requests through the existing access middleware.

1. Run `NARAD_QC.ipynb` through the new **Runtime Parallelism + Live QKD Telemetry** and **API Worker + Progress Wiring** cells, as well as its earlier Phase 6 definitions and fitted calibration models in Colab. Preserve the existing notebook execution order and prerequisites.
2. Ensure the Colab runtime has the bridge dependencies:

   ```python
   %pip install 'fastapi>=0.115,<1' 'pydantic>=2.9,<3' 'uvicorn>=0.30,<1'
   ```

3. Upload the **updated `gui/backend/gui_bridge.py`**. Your notebook uses `/content/drive/MyDrive/NARAD_QC/gui_bridge.py`; replace that Drive copy. The supplied setup cell also accepts `/content/gui_bridge.py`, preferring the Drive file if both exist.
4. Paste and run the updated contents of **`gui/backend/colab_cell.py`** in a new cell after the parallelism/progress cells. It can replace an idle old GUI server, but refuses to interrupt active jobs; replacing it clears bridge jobs/sessions. It starts a separate bridge on **127.0.0.1:8002**. Running the original API server is optional; the initialized notebook objects are required.
5. In another Colab cell, start a tunnel to this new port:

   ```python
   !cloudflared tunnel --url http://127.0.0.1:8002
   ```

   Leave the tunnel running. Use the generated HTTPS URL, not the old port-8001 tunnel. Installing cloudflared is already covered by the notebook.
6. In the React app, choose **Connect notebook**. Paste the tunnel URL (without `/gui`) and the notebook's existing `NARAD_API_ACCESS_KEY`. The key is retained only in tab memory and sent as `X-NARAD-API-Key`; it is not written to localStorage, URLs, logs, or graph exports.
7. **Test & connect**, then preview routes or run the protocol. No bridge needs to run on your laptop when Colab hosts the notebook.

For a locally initialized notebook/kernel, call `install_gui_bridge(globals())` in that same kernel and serve the returned ASGI app with Uvicorn. A standalone import of the module cannot initialize notebook physics or load calibration models by itself.

The bridge defaults to frontend origins `http://localhost:5173`, `http://127.0.0.1:5173`, and equivalent port 4173 preview URLs. To host the React app elsewhere, pass its exact origin:

```python
NARAD_GUI_APP = _bridge.install_gui_bridge(
    globals(), allowed_origins=['https://your-console.example']
)
```

CORS wraps authentication so browser OPTIONS preflight can complete. Operational requests still require the runtime API key. Do not embed a runtime key in a public build.

## Using the workspace

- **Select tool:** drag a node to change its coordinates. Click a node/fibre to edit the inspector. Coordinates are kilometres; fibre lengths follow Euclidean distance.
- **Add user / Add repeater:** select the tool, then click an empty canvas position.
- **Connect fibre:** select two nodes. Select the resulting line to edit optical multiplexing modes, attenuation, and activity.
- **Inspector:** memory slots, BSM units/probability, positions and activity are editable. Quantum multiplexing modes are properties of physical links, not node counts.
- **Import / export:** use graph JSON to preserve or share topology. An example is included at `gui/examples/network.json`. No API keys, session keys or messages enter the exported file.
- **Endpoints:** choose distinct active USER nodes. Repeater nodes cannot be endpoints or USER transit nodes.
- **Execution:** CPU workers and quantum lanes are forwarded to the new routed executor. Worker usage is bounded by requested workers, lanes, runtime logical CPUs, and the controller worker limit. One causal lane uses one worker. Capacity is loaded from the notebook, and actual applied values (including process-farm fallback) appear in live telemetry and the completed session. Older notebook runtimes still fall back to one worker/lane.
- **Preview routes:** live mode submits the current graph and QKD configuration to Policy C. Selecting a preview changes its highlight; execution chooses/falls back between ranked paths itself.
- **Run protocol:** sends the frozen graph/configuration as an asynchronous, idempotent job. The bridge validates it, creates an `OperatorQuantumNetwork`, and invokes the actual `narad_qc_establish_key(..., return_details=True)`. No notebook results are mocked in live mode.
- **Progress:** blue = routing; purple = authentication; amber = pair generation/swapping; teal = distillation; green = established; red = failure. Moving arrowheads indicate direction/activity on highlighted links. Live events come from observer hooks and the native `progress_callback`. Two separate progress bars show **forecast secret yield** and **pair budget used**. Forecast 100% is not completion: the UI waits for successful actual distillation and a server session. Metrics include ZZ/XX counts, observed QBER, forecast bits, and applied workers/lanes; no physical completion ETA is invented.
- **Messaging:** both participants have a composer and an inbox. Alice can send to Bob and Bob can reply to Alice using the **same established key and session ID**. Each send allocates a unique AES-GCM nonce from one shared, locked counter across both directions. Inbox records preserve sender/receiver metadata and arrows reverse on a reply. The server retains bounded ciphertext history; plaintext is returned only on decrypt. The shared key stays on the backend. The browser demo uses the same unique-counter design with its non-extractable key.
- **New / end session:** destroys the bridge's server session, clears local messages, and unlocks topology editing. Sessions expire after the notebook's configured absolute TTL (default 30 minutes). Expired sessions cannot send or decrypt.
- **Logs:** capped at 500 visible events, downloadable as text. The server retains 2,000 events per job and samples high-frequency physical events to avoid overwhelming the UI.

## Live bridge routes

All routes require `X-NARAD-API-Key`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/gui/health` | Bridge readiness/version, native telemetry and worker capability |
| GET | `/gui/runtime/capacity` | Runtime/controller worker limits and supported worker values |
| POST | `/gui/preview` | Graph + endpoints + QKD/execution → ranked routes |
| POST | `/gui/jobs` | Submit job with caller-generated `request_id`; HTTP 202 |
| GET | `/gui/jobs/{id}?after={cursor}` | Job status, incremental events and public completed result |
| POST | `/gui/sessions/{id}/messages` | AES-GCM encrypt and enqueue either participant’s message |
| GET | `/gui/sessions/{id}/messages?after={index}` | Receive ciphertext inbox deliveries |
| POST | `/gui/sessions/{id}/decrypt` | Authenticate/decrypt a ciphertext package |
| DELETE | `/gui/sessions/{id}` | Remove session/key reference and its inbox |

A job request extends this payload with `request_id` (a UUID is suitable):

```json
{
  "graph": {
    "name": "Two-user network",
    "nodes": [
      {"name":"Alice","role":"USER","x_km":0,"y_km":0,"memory_slots":2,"bsm_units":0,"bsm_success_probability":0,"active":true},
      {"name":"R1","role":"REPEATER","x_km":50,"y_km":0,"memory_slots":8,"bsm_units":2,"bsm_success_probability":0.4,"active":true},
      {"name":"Bob","role":"USER","x_km":100,"y_km":0,"memory_slots":2,"bsm_units":0,"bsm_success_probability":0,"active":true}
    ],
    "links": [
      {"source":"Alice","target":"R1","modes":8,"attenuation":0.2,"active":true},
      {"source":"R1","target":"Bob","modes":8,"attenuation":0.2,"active":true}
    ]
  },
  "sender":"Alice", "receiver":"Bob",
  "qkd":{"target_secret_bits":128},
  "execution":{"cpu_workers":1,"parallel_quantum_lanes":1,"max_hops":8}
}
```

Independent clients can use the protected messaging endpoints with an established session ID. The GUI presents sender and receiver in one research console; it is not a separately authenticated account system or an internet chat directory. The shared runtime API key authorizes notebook operators.

## Architecture and limits

- React + SVG renders the editable network; no external graph service is used.
- A separate FastAPI app owns job/session/inbox state. Preview and execution receive the submitted network rather than mutating global `phase4_network`.
- Context-local observers wrap the existing route/authentication/QKD/distillation calls and `SimulationKernel.emit`, preserving original return values. Raw key material and raw QKD bits are excluded from public results and event payloads.
- The bridge serializes **sessions** with one job-controller thread and respects the notebook's existing establishment lock. Within a session the notebook can create multiple CPU worker processes and quantum lanes. The bridge forwards `cpu_workers`, `parallel_quantum_lanes`, `progress_callback` and `execution_audit`, and publishes the actual audit. Parent observer locks are never acquired from forked child processes. Requests with the same job ID replay the job; changed payloads under the same ID return 409. At most four jobs can be pending.
- Graph limits: 24 nodes, 48 fibres, max 12 hops; message limit: 16,000 UTF-8 bytes; inbox: latest 200 ciphertext deliveries. These bounds protect an interactive research session, but dense all-simple-path searches and full QKD runs can still take significant time.
- Seed streams use fresh random master seeds for each live execution. The underlying protocol remains the notebook's research simulator, including its known physical/security-model limitations. Per-node arbitrary decay/lifetime controls remain omitted because they are not applied by the existing executor.
- A bridge heartbeat confirms its required runtime definitions are present, not that every graph will establish a key. Incompatible BSM probabilities or infeasible quality/resource settings can still fail in the existing protocol. Failure and fallback events are surfaced.
- Reloading the browser clears tab state. Notebook restarts clear all jobs, keys and inboxes. There is no persistence or hard cancellation of an in-flight notebook simulation.
- If polling loses connection, use **Resume monitor** for the same job. Do not submit a duplicate establishment. Logs indicate sampled activity; they are not an exact replay of every optical-mode attempt.
- Existing notebook code is left unchanged by this GUI update. The bridge uses its own transport/CORS and request-scoped preview rather than patching those HTTP handlers.

## Verification

```sh
npm --prefix gui test
npm --prefix gui run build
python3 -m venv gui/.venv
gui/.venv/bin/python -m pip install -r gui/backend/requirements.txt
gui/.venv/bin/python -m unittest discover -s gui/backend/tests -v
```

Frontend tests cover graph validation, native forecast/budget semantics, same-key bidirectional WebCrypto, nonce uniqueness and exhaustion. Backend tests cover legacy and new notebook signatures, worker/capacity forwarding and fallback, native telemetry fields, fork-safe observers, HTTP auth/CORS, job idempotency, raw-key exclusion, concurrent two-way AES/inbox traffic, tamper detection, participant binding, expiration and destruction. The fixture uses worker-limit/progress-payload helpers extracted from the actual notebook. Full quantum trajectories are fixtures; a fresh complete Colab/QKD run still requires the initialized notebook.

Browser verification covers demo run → AES encryption → receiver authentication/decryption, canvas/property interaction, desktop and narrow layouts. `npm run build` emits the static React app to `gui/dist`.

## Updating an existing Colab bridge

The original bridge v1.0 ignored worker/progress arguments. Uploading only React changes cannot enable the new behavior. Replace the Drive copy of `gui_bridge.py`, then run the updated `colab_cell.py` after your new notebook parallelism cells. The health response should report **version 1.1.0**, `parallel_cpu_workers_supported: true`, and `native_progress_supported: true`. Reconnect the GUI after replacement; previous bridge sessions are cleared. The existing port-8002 tunnel can be reused if it is still running.

The notebook's legacy `/message/send` handler is unchanged. Bidirectional messaging is implemented on the GUI bridge's `/gui/sessions/{id}/messages` endpoint, which checks the unordered participant pair and excludes third-party and self-send attempts. One shared key does not imply reusing a GCM nonce: the bridge allocates a 4-byte session prefix plus an increasing 64-bit counter under its session lock.
