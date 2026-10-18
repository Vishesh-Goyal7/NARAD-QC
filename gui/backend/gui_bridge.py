"""NARAD-QC GUI bridge. Load into a completed notebook via install_gui_bridge(globals()).
No notebook cells are executed, no keys are returned to the browser, and no legacy
API routes are modified. The bridge owns a separate ASGI app and ephemeral state.
"""
from __future__ import annotations
import contextvars
import functools
import hmac
import inspect
import math
import os
import secrets
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, model_validator

VERSION = "1.1.0"
_OBSERVER = contextvars.ContextVar("narad_gui_observer", default=None)
_HOOK_LOCK = threading.RLock()

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

class NodeInput(StrictModel):
    name: str = Field(min_length=1, max_length=40)
    role: Literal["USER", "REPEATER"]
    x_km: float = Field(ge=-100000, le=100000)
    y_km: float = Field(ge=-100000, le=100000)
    memory_slots: int = Field(ge=1, le=4096)
    bsm_units: int = Field(ge=0, le=512)
    bsm_success_probability: float = Field(ge=0, le=1)
    active: bool = True

    @model_validator(mode="after")
    def validate_resources(self):
        if self.name != self.name.strip() or "--" in self.name:
            raise ValueError("Use trimmed node names without --.")
        if self.role == "REPEATER" and (self.memory_slots < 2 or self.bsm_units < 1):
            raise ValueError("Repeaters need at least two memory slots and one BSM unit.")
        if self.role == "USER" and (self.bsm_units or self.bsm_success_probability):
            raise ValueError("Users cannot have BSM resources.")
        return self

class LinkInput(StrictModel):
    source: str
    target: str
    modes: int = Field(ge=1, le=512)
    attenuation: float = Field(default=0.2, ge=0, le=10)
    active: bool = True

class GraphInput(StrictModel):
    name: str = Field(default="GUI network", max_length=80)
    nodes: list[NodeInput] = Field(min_length=2, max_length=24)
    links: list[LinkInput] = Field(max_length=48)

    @model_validator(mode="after")
    def validate_edges(self):
        names = {n.name for n in self.nodes}
        if len(names) != len(self.nodes):
            raise ValueError("Duplicate node names.")
        seen = set()
        for link in self.links:
            edge = tuple(sorted((link.source, link.target)))
            if link.source not in names or link.target not in names or link.source == link.target or edge in seen:
                raise ValueError("Fibres require distinct existing endpoints and no duplicate edges.")
            seen.add(edge)
        return self

class ExecutionInput(StrictModel):
    cpu_workers: int = Field(default=1, ge=1, le=64)
    parallel_quantum_lanes: int = Field(default=1, ge=1, le=512)
    max_hops: int = Field(default=8, ge=1, le=12)

class QKDInput(StrictModel):
    target_secret_bits: Literal[128, 192, 256] = 128
    z_probability: float = Field(default=.8, gt=0, lt=1)
    qber_abort_threshold: float = Field(default=.11, gt=0, lt=.5)
    minimum_parameter_estimation_bits: int = Field(default=24, ge=1, le=100000)
    parameter_estimation_margin: float = Field(default=.01, ge=0, lt=.5)
    security_margin_bits: int = Field(default=32, ge=0, le=100000)
    reconciliation_efficiency_forecast: float = Field(default=1.16, ge=1, le=10)
    collection_headroom_bits: int = Field(default=32, ge=0, le=100000)
    collection_check_interval_pairs: int = Field(default=16, ge=1, le=50000)
    max_delivered_pairs: int = Field(default=5000, ge=1, le=50000)
    max_slots_per_pair: int = Field(default=20000, ge=1, le=100000)
    cascade_passes: int = Field(default=8, ge=1, le=64)

class RunInput(StrictModel):
    graph: GraphInput
    sender: str
    receiver: str
    qkd: QKDInput = Field(default_factory=QKDInput)
    execution: ExecutionInput = Field(default_factory=ExecutionInput)

    @model_validator(mode="after")
    def validate_endpoints(self):
        users = {n.name for n in self.graph.nodes if n.role == "USER" and n.active}
        if self.sender == self.receiver or self.sender not in users or self.receiver not in users:
            raise ValueError("Choose two different active USER endpoints.")
        return self

class JobInput(RunInput):
    request_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{8,80}$")

class MessageInput(StrictModel):
    sender: str
    receiver: str
    message: str = Field(max_length=16000)

class DecryptInput(StrictModel):
    ciphertext_b64: str = Field(max_length=22000)


def build_network(namespace, graph: GraphInput):
    network = namespace["OperatorQuantumNetwork"](name=graph.name)
    for node in graph.nodes:
        kwargs = dict(name=node.name, x_km=node.x_km, y_km=node.y_km,
                      memory_slots=node.memory_slots, active=node.active)
        if node.role == "USER":
            network.add_user(**kwargs)
        else:
            network.add_repeater(**kwargs, bsm_units=node.bsm_units,
                                 bsm_success_probability=node.bsm_success_probability)
    for link in graph.links:
        network.connect_fiber(link.source, link.target, multiplexing_modes=link.modes,
                              attenuation_db_per_km=link.attenuation, active=link.active)
    return network


def _notify(stage, message, **kwargs):
    callback = _OBSERVER.get()
    if callback is not None:
        callback(stage, message, **kwargs)


def install_observers(namespace):
    """Context-local, sanitized observer hooks; original return values are preserved."""
    def wrap(name, before=None, after=None):
        original = namespace[name]
        while getattr(original, "_narad_gui_hook", False) and hasattr(original, "__wrapped__"):
            original = original.__wrapped__
        @functools.wraps(original)
        def wrapped(*args, **kwargs):
            if before:
                before(args, kwargs)
            result = original(*args, **kwargs)
            if after:
                after(result)
            return result
        wrapped._narad_gui_hook = True
        namespace[name] = wrapped

    with _HOOK_LOCK:
        wrap("_narad_rank_routes_policy_c",
             before=lambda a, k: _notify("routing", "Discovering repeater-only paths and ranking with Policy C."),
             after=lambda result: _notify("routing", f"Policy C found {len(result[0])} executable routes.",
                                          nodes=list(result[0][0]["candidate"].node_names)))
        wrap("_narad_authenticate_selected_path",
             before=lambda a, k: _notify("authentication", "Fresh mutual ML-DSA authentication started.",
                                         nodes=[n.name for n in (k.get("stack") or a[0])["path"]]),
             after=lambda result: _notify("authentication", f"Authenticated {len(result)} selected-path nodes.", level="success"))
        wrap("_narad_run_qkd_until_actual_key",
             before=lambda a, k: _notify("generation", "Generating multiplexed Bell pairs; swapping and recovering failed links."))
        wrap("phase3k_distill_configurable_bbm92_key",
             before=lambda a, k: _notify("distillation", "Running Cascade reconciliation and Toeplitz privacy amplification."),
             after=lambda result: _notify("distillation", f"Post-processing produced {result.final_secret_bits} matching secret bits.", level="success"))
        kernel = namespace["SimulationKernel"]
        original_emit = kernel.emit
        while getattr(original_emit, "_narad_gui_hook", False) and hasattr(original_emit, "__wrapped__"):
            original_emit = original_emit.__wrapped__
        @functools.wraps(original_emit)
        def observed_emit(self, *args, **kwargs):
            event = original_emit(self, *args, **kwargs)
            observer = _OBSERVER.get()
            if observer and event is not None:
                observer.kernel_event(event)
            return event
        observed_emit._narad_gui_hook = True
        kernel.emit = observed_emit


class JobObserver:
    def __init__(self, job, state_lock):
        self.job, self.lock = job, state_lock
        self.pairs = 0
        self.last_activity = 0.0
        self.owner_pid = os.getpid()

    def __call__(self, stage, message, level="info", nodes=None, edges=None, **unused):
        # The notebook forks trajectory workers. Never enter parent-thread locks
        # or mutate a copied job from a child; native collection telemetry is
        # published by the parent executor instead.
        if os.getpid() != self.owner_pid:
            return
        with self.lock:
            self.job["seq"] += 1
            self.job["events"].append({"seq": self.job["seq"], "time": time.time(),
                "stage": stage, "level": level, "message": str(message)[:800],
                "nodes": list(nodes or []), "edges": list(edges or [])})

    def progress(self, payload):
        if os.getpid() != self.owner_pid:
            return
        numeric_fields = {
            "timestamp_unix", "target_secret_bits", "max_delivered_pairs",
            "delivered_pairs", "zz_bits", "xx_bits", "observed_x_qber",
            "mean_predicted_qber", "phase_error_estimate", "forecast_extractable_bits",
            "forecast_secret_fraction", "pair_budget_fraction", "modeled_physical_time_s",
            "elementary_generation_cycles", "optical_mode_attempts", "bsm_attempts",
            "applied_cpu_workers", "applied_parallel_quantum_lanes", "final_secret_bits",
        }
        update = {"stage": str(payload.get("stage", "QKD_COLLECTION"))[:80]}
        for name in numeric_fields:
            value = payload.get(name)
            if name not in payload:
                continue
            update[name] = value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None
        if "collection_ready" in payload:
            update["collection_ready"] = bool(payload["collection_ready"])
        if isinstance(payload.get("worker_state"), dict):
            update["worker_state"] = {
                k: v for k, v in payload["worker_state"].items()
                if k in {"requested_cpu_workers", "applied_cpu_workers", "worker_processes_created",
                         "worker_processes_seen", "jobs_submitted", "trajectories_retrieved",
                         "jobs_pending", "direct_fallback"} and isinstance(v, (int, float, bool)) and math.isfinite(v)
            }
            if "applied_cpu_workers" in update["worker_state"]:
                update["applied_cpu_workers"] = update["worker_state"]["applied_cpu_workers"]
        with self.lock:
            if payload.get("stage") == "QKD_COLLECTION" and payload.get("route") and "delivered_pairs" not in payload:
                self.job["progress"].clear()
            self.job["progress"].update(update)
        stage = "complete" if update["stage"] in {"COMPLETE", "SESSION_ESTABLISHED"} else "distillation" if update["stage"] == "QKD_POSTPROCESS" else "generation"
        message = (f"Collected {update['delivered_pairs']} pairs · ZZ {update.get('zz_bits', '—')} · XX {update.get('xx_bits', '—')} · forecast {update.get('forecast_extractable_bits', '—')} bits."
                   if "delivered_pairs" in update else "Native QKD telemetry connected.")
        self(stage, message)

    def kernel_event(self, event):
        if os.getpid() != self.owner_pid:
            return
        kind = event.event_type
        if kind == "QKD_BELL_PAIR_MEASURED":
            self.pairs += 1
            if self.pairs == 1 or self.pairs % 16 == 0:
                self("generation", f"{self.pairs} end-to-end Bell pairs measured and consumed.")
            return
        now = time.monotonic()
        if now - self.last_activity < .5:
            return
        names = list(event.node_names)
        if kind in {"ENTANGLEMENT_SWAP_SUCCEEDED", "ENTANGLEMENT_SWAP_FAILED"}:
            self.last_activity = now
            self("generation", f"{kind.replace('_', ' ').title()}: {' → '.join(names)}",
                 level="warning" if kind.endswith("FAILED") else "info",
                 edges=list(zip(names[:-1], names[1:])))
        elif "AUTHENTICATION" in kind:
            self.last_activity = now
            self("authentication", str(event.message)[:250])


def install_gui_bridge(namespace: dict[str, Any], *, allowed_origins=None):
    """Return a separate FastAPI app after the notebook runtime has initialized.

    Reuse this returned app/server; reinstalling is allowed only after its jobs finish.
    The runtime API key is reused, never printed or saved by this module.
    """
    required = ["OperatorQuantumNetwork", "SimulationKernel", "narad_qc_establish_key",
                "_narad_rank_routes_policy_c", "_narad_authenticate_selected_path",
                "_narad_run_qkd_until_actual_key", "phase3k_distill_configurable_bbm92_key",
                "narad_api_public_result", "PHASE3J_BIASED_BBM92_CONFIG",
                "aes_gcm_encrypt", "aes_gcm_decrypt"]
    missing = [name for name in required if name not in namespace]
    if missing:
        raise RuntimeError("Run the notebook through Phase 6 first. Missing: " + ", ".join(missing))
    if not namespace.get("NARAD_API_ACCESS_KEY"):
        namespace["NARAD_API_ACCESS_KEY"] = secrets.token_urlsafe(32)
    install_observers(namespace)
    app = FastAPI(title="NARAD-QC GUI Bridge", version=VERSION)
    jobs, sessions = {}, {}
    lock, run_lock = threading.RLock(), threading.Lock()
    pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="narad-gui")
    ttl = float(namespace.get("NARAD_API_SESSION_TTL_S", 1800))

    def capacity():
        params = inspect.signature(namespace["narad_qc_establish_key"]).parameters
        parallel = {"cpu_workers", "parallel_quantum_lanes", "execution_audit"}.issubset(params)
        progress = "progress_callback" in params
        runtime = max(1, int(namespace.get("_narad_runtime_cpu_count", lambda: os.cpu_count() or 1)()))
        controller = max(1, int(namespace.get("NARAD_CONTROLLER_MAX_CPU_WORKERS", 1)))
        maximum = min(64, runtime, controller) if parallel else 1
        return {"parallel_cpu_workers_supported": parallel, "parallel_quantum_lanes_supported": parallel,
                "native_progress_supported": progress, "runtime_logical_cpus": runtime,
                "controller_worker_limit": controller, "max_safe_cpu_workers": maximum,
                "supported_cpu_worker_values": list(range(1, maximum + 1)),
                "worker_rule": "min(requested workers, quantum lanes, logical CPUs, controller limit)"}

    def authorize(x_narad_api_key: str | None = Header(default=None)):
        expected = namespace["NARAD_API_ACCESS_KEY"]
        if x_narad_api_key is None or not hmac.compare_digest(x_narad_api_key.encode("utf-8"), expected.encode("utf-8")):
            raise HTTPException(401, "A valid X-NARAD-API-Key header is required.")

    def prune():
        now = time.time()
        with lock:
            for sid in list(sessions):
                if now - sessions[sid]["created"] >= ttl:
                    sessions.pop(sid, None)
            for jid in list(jobs):
                if jobs[jid]["status"] in {"SUCCEEDED", "FAILED"} and now - jobs[jid]["updated"] >= ttl:
                    jobs.pop(jid, None)

    def get_session(sid):
        prune()
        with lock:
            session = sessions.get(sid)
        if session is None:
            raise HTTPException(404, "Session is missing, destroyed, or expired. Establish a new session.")
        return session

    def config_for(request):
        from dataclasses import replace
        return replace(namespace["PHASE3J_BIASED_BBM92_CONFIG"], **request.qkd.model_dump())

    def run_job(request, job):
        observer = JobObserver(job, lock)
        token = _OBSERVER.set(observer)
        try:
            with lock:
                job["status"] = "RUNNING"
            observer("validation", "Validating submitted topology and hardware resources.")
            network = build_network(namespace, request.graph)
            observer("validation", f"Graph accepted: {len(request.graph.nodes)} nodes, {len(request.graph.links)} fibres.", level="success")
            capabilities = capacity()
            observer("validation", f"Requested {request.execution.cpu_workers} CPU workers / {request.execution.parallel_quantum_lanes} quantum lanes.")
            execution_audit = {}
            native = {}
            if capabilities["parallel_cpu_workers_supported"]:
                native.update(cpu_workers=request.execution.cpu_workers,
                              parallel_quantum_lanes=request.execution.parallel_quantum_lanes,
                              execution_audit=execution_audit)
            else:
                observer("validation", "Legacy notebook detected: execution is limited to one worker and one lane.", level="warning")
            if capabilities["native_progress_supported"]:
                native["progress_callback"] = observer.progress
            # Independent global serialization also respects legacy establishment endpoints.
            shared_lock = namespace.get("NARAD_API_ESTABLISHMENT_EXECUTION_LOCK", run_lock)
            with shared_lock:
                result = namespace["narad_qc_establish_key"](network=network,
                    sender_name=request.sender, receiver_name=request.receiver,
                    qkd_config=config_for(request), max_hops=request.execution.max_hops,
                    physical_seed=secrets.randbits(32), protocol_seed=secrets.randbits(32),
                    postprocess_seed=secrets.randbits(32), verbose=False, return_details=True, **native)
            public = namespace["narad_api_public_result"](result)
            sid = secrets.token_urlsafe(24)
            execution = {"requested_cpu_workers": request.execution.cpu_workers,
                         "requested_parallel_quantum_lanes": request.execution.parallel_quantum_lanes,
                         "applied_cpu_workers": 1, "applied_parallel_quantum_lanes": 1,
                         **execution_audit, "runtime_logical_cpus": capabilities["runtime_logical_cpus"],
                         "controller_worker_limit": capabilities["controller_worker_limit"]}
            # Telemetry reports active lanes (which may be capped by the pair budget).
            with lock:
                for field in ("applied_cpu_workers", "applied_parallel_quantum_lanes"):
                    if job["progress"].get(field) is not None:
                        execution[field] = job["progress"][field]
                snapshot = execution_audit.get("worker_snapshot")
                if snapshot and "applied_cpu_workers" in snapshot:
                    execution["applied_cpu_workers"] = snapshot["applied_cpu_workers"]
            public.update(session_id=sid, session_ttl_s=ttl, execution=execution)
            observer("complete", "Actual QKD distillation succeeded; shared key retained on the server.",
                     nodes=list(result.selected_node_names), level="success")
            with lock:
                sessions[sid] = {"key": bytes(result.key), "sender": result.sender,
                                 "receiver": result.receiver, "created": time.time(), "count": 0,
                                 "messages": deque(maxlen=200),
                                 "nonce_prefix": secrets.token_bytes(4), "nonce_counter": 0}
                job.update(status="SUCCEEDED", result=public, updated=time.time())
        except Exception as error:
            # Errors may contain route details; never serialize result/key objects.
            message = f"{type(error).__name__}: {error}"[:4000]
            observer("failed", message, level="error")
            with lock:
                job.update(status="FAILED", error=message, updated=time.time())
        finally:
            _OBSERVER.reset(token)

    @app.get("/gui/health", dependencies=[Depends(authorize)])
    def health():
        return {"bridge": "NARAD-QC-GUI", "version": VERSION, "ready": True,
                "capacity": capacity(), "bidirectional_messaging": True, "session_ttl_s": ttl}

    @app.get("/gui/runtime/capacity", dependencies=[Depends(authorize)])
    def runtime_capacity():
        return capacity()

    @app.post("/gui/preview", dependencies=[Depends(authorize)])
    def preview(request: RunInput):
        from dataclasses import replace
        try:
            network = build_network(namespace, request.graph)
            # Scope the preview exactly as the existing hardened establishment wrapper does.
            context = namespace.get("_NARAD_REQUEST_QKD_CONFIG")
            token = context.set(config_for(request)) if context is not None else None
            try:
                ranked, valid, rejected, physical = namespace["_narad_rank_routes_policy_c"](
                    network=network, sender_name=request.sender, receiver_name=request.receiver,
                    max_hops=request.execution.max_hops)
            finally:
                if token is not None:
                    context.reset(token)
            return {"physical_paths": len(physical), "role_valid_paths": len(valid),
                "rejected_user_transit_paths": len(rejected), "ranked_routes": [
                    {"rank": i, "path_index": r["candidate"].path_index,
                     "nodes": list(r["candidate"].node_names), "path": r["candidate"].display_path,
                     "score": r["score"], "service_probability": r["predicted_service_probability"],
                     "predicted_delivery_s": r["predicted_median_delivery_s"],
                     "predicted_visibility": r["predicted_delivered_visibility"],
                     "predicted_qber": r["predicted_delivered_qber"]}
                    for i, r in enumerate(ranked, 1)]}
        except Exception as error:
            raise HTTPException(400, f"{type(error).__name__}: {error}") from error

    @app.post("/gui/jobs", dependencies=[Depends(authorize)], status_code=202)
    def submit(request: JobInput):
        prune()
        fingerprint = request.model_dump_json(exclude={"request_id"})
        with lock:
            if request.request_id in jobs:
                job = jobs[request.request_id]
                if job["fingerprint"] != fingerprint:
                    raise HTTPException(409, "This request ID already belongs to a different job.")
                return {"job_id": request.request_id, "status": job["status"]}
            if sum(j["status"] in {"QUEUED", "RUNNING"} for j in jobs.values()) >= 4:
                raise HTTPException(429, "Four jobs are already pending. Wait for an existing job.")
            job = {"status": "QUEUED", "events": deque(maxlen=2000), "seq": 0,
                   "result": None, "error": None, "updated": time.time(), "fingerprint": fingerprint,
                   "progress": {}}
            jobs[request.request_id] = job
            JobObserver(job, lock)("validation", "Request queued for the notebook executor.")
            pool.submit(run_job, request, job)
        return {"job_id": request.request_id, "status": "QUEUED"}

    @app.get("/gui/jobs/{job_id}", dependencies=[Depends(authorize)])
    def status(job_id: str, after: int = 0):
        prune()
        with lock:
            job = jobs.get(job_id)
            if job is None:
                raise HTTPException(404, "Unknown or expired job.")
            return {"job_id": job_id, "status": job["status"], "cursor": job["seq"],
                    "events": [event for event in job["events"] if event["seq"] > after],
                    "events_truncated": bool(job["events"] and after < job["events"][0]["seq"] - 1),
                    "result": job["result"], "error": job["error"], "progress": dict(job["progress"])}

    @app.post("/gui/sessions/{sid}/messages", dependencies=[Depends(authorize)])
    def send(sid: str, request: MessageInput):
        import base64
        with lock:
            session = get_session(sid)
            if request.sender == request.receiver or {request.sender, request.receiver} != {session["sender"], session["receiver"]}:
                raise HTTPException(403, "Message endpoints do not match this session.")
            plaintext = request.message.encode("utf-8")
            if len(plaintext) > 16000:
                raise HTTPException(400, "Message exceeds 16,000 UTF-8 bytes.")
            # One shared key, one serialized nonce space across BOTH directions.
            # Prefix + monotonic 64-bit counter guarantees per-session uniqueness.
            from Crypto.Cipher import AES
            if session["nonce_counter"] >= 2**64:
                raise HTTPException(409, "Session nonce space exhausted. Establish a new session.")
            nonce = session["nonce_prefix"] + session["nonce_counter"].to_bytes(8, "big")
            session["nonce_counter"] += 1
            cipher = AES.new(session["key"], AES.MODE_GCM, nonce=nonce)
            ciphertext, tag = cipher.encrypt_and_digest(plaintext)
            encrypted = nonce + ciphertext + tag
            session["count"] += 1
            message = {"id": secrets.token_urlsafe(16), "ciphertext_b64": base64.b64encode(encrypted).decode("ascii"),
                       "message_index": session["count"], "sender": request.sender,
                       "receiver": request.receiver, "time": time.time(),
                       "plaintext_bytes": len(plaintext), "cipher": "AES-GCM"}
            session["messages"].append(message)
            return message

    @app.get("/gui/sessions/{sid}/messages", dependencies=[Depends(authorize)])
    def inbox(sid: str, after: int = 0):
        with lock:
            session = get_session(sid)
            return {"messages": [dict(m) for m in session["messages"] if m["message_index"] > after],
                    "cursor": session["count"], "participants": [session["sender"], session["receiver"]]}

    @app.post("/gui/sessions/{sid}/decrypt", dependencies=[Depends(authorize)])
    def decrypt(sid: str, request: DecryptInput):
        import base64
        with lock:
            session = get_session(sid)
            try:
                blob = base64.b64decode(request.ciphertext_b64, validate=True)
                message = namespace["aes_gcm_decrypt"](blob, session["key"]).decode("utf-8")
            except Exception as error:
                raise HTTPException(400, "AES-GCM authentication/decryption failed.") from error
            return {"verified": True, "message": message}

    @app.delete("/gui/sessions/{sid}", dependencies=[Depends(authorize)])
    def destroy(sid: str):
        with lock:
            if sessions.pop(sid, None) is None:
                raise HTTPException(404, "Session is missing or already destroyed.")
        return {"status": "DESTROYED", "memory_zeroization_guaranteed": False}

    @app.middleware("http")
    async def no_store(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    # Added last so CORS is outermost and handles unauthenticated OPTIONS preflights.
    app.add_middleware(CORSMiddleware, allow_origins=allowed_origins or [
        "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"],
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-NARAD-API-Key"], allow_credentials=False)
    app.state.gui_jobs = jobs
    app.state.gui_sessions = sessions
    app.state.gui_pool = pool
    return app
