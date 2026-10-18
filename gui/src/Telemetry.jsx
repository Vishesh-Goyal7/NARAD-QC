import React from "react";
import { Activity, Cpu, Layers, CheckCheck } from "lucide-react";
import { progressView } from "./progress";
const number = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 3 })
    : "—";
export default function Telemetry({
  progress,
  session,
  busy,
  mode,
  workers,
  lanes,
}) {
  const p = progress || {};
  const view = progressView(p, !!session);
  const audit = session?.execution || {};
  const appliedWorkers =
    p.worker_state?.applied_cpu_workers ??
    audit.applied_cpu_workers ??
    p.applied_cpu_workers;
  const appliedLanes =
    audit.applied_parallel_quantum_lanes ?? p.applied_parallel_quantum_lanes;
  const bar = (label, value, caption) => (
    <div className="telemetry-bar">
      <div>
        <span>{label}</span>
        <strong>
          {value === null
            ? "Waiting for telemetry"
            : `${Math.round(value * 100)}%`}
        </strong>
      </div>
      <div
        className={`progress-track ${value === null && busy ? "indeterminate" : ""}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(value === null
          ? {}
          : { "aria-valuenow": Math.round(value * 100) })}
      >
        <span style={{ width: value === null ? "0%" : `${value * 100}%` }} />
      </div>
      <small>{caption}</small>
    </div>
  );
  return (
    <section className="telemetry panel" aria-label="Live QKD telemetry">
      <div className="panel-heading">
        <span>
          <Activity size={16} />
          QKD collection progress
        </span>
        <span className="tag">
          {mode === "demo"
            ? "ILLUSTRATIVE DEMO"
            : session
              ? "KEY VERIFIED"
              : busy
                ? "LIVE TELEMETRY"
                : "LAST RUN"}
        </span>
      </div>
      <div className="telemetry-body">
        <div className="telemetry-progress">
          <strong>
            {mode === "demo"
              ? "Demo pipeline — no physical QKD measurements"
              : view.label}
          </strong>
          {bar(
            "Forecast secret yield",
            mode === "demo" ? null : view.forecast,
            `Forecast only; 100% does not guarantee a usable key. Target: ${number(p.target_secret_bits ?? session?.final_secret_bits)} bits.`,
          )}
          {bar(
            "Pair budget used",
            mode === "demo" ? null : view.budget,
            `${number(p.delivered_pairs ?? session?.delivered_pairs)} / ${number(p.max_delivered_pairs)} measured pairs. This is budget consumption, not protocol completion.`,
          )}
        </div>
        <div className="telemetry-metrics">
          <div>
            <span>ZZ raw bits</span>
            <strong>{number(p.zz_bits ?? session?.zz_raw_key_bits)}</strong>
          </div>
          <div>
            <span>XX estimation bits</span>
            <strong>
              {number(p.xx_bits ?? session?.xx_parameter_estimation_bits)}
            </strong>
          </div>
          <div>
            <span>Observed X QBER</span>
            <strong>
              {typeof p.observed_x_qber === "number"
                ? `${number(p.observed_x_qber * 100)}%`
                : typeof session?.observed_x_qber === "number"
                  ? `${number(session.observed_x_qber * 100)}%`
                  : "—"}
            </strong>
          </div>
          <div>
            <span>Forecast secret bits</span>
            <strong>{number(p.forecast_extractable_bits)}</strong>
          </div>
          <div>
            <span>Applied CPU workers</span>
            <strong>
              <Cpu size={12} />
              {number(appliedWorkers)} <small>/ {workers} requested</small>
            </strong>
          </div>
          <div>
            <span>Applied quantum lanes</span>
            <strong>
              <Layers size={12} />
              {number(appliedLanes)} <small>/ {lanes} requested</small>
            </strong>
          </div>
        </div>
      </div>
      {p.worker_state?.direct_fallback && (
        <div className="telemetry-fallback">
          Direct single-worker execution is active; physical quantum lanes are
          unchanged.
        </div>
      )}
    </section>
  );
}
