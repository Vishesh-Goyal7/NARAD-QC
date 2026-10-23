import { useEffect, useId, useRef, useState } from "react";
import { countAxis } from "./collectionHistory";

const series = [
  { key: "pairs", label: "Total pairs", color: "#377dff" },
  { key: "zz", label: "ZZ bits", color: "#149d85" },
  { key: "xx", label: "XX bits", color: "#8b61d9" },
];
const formatTime = (seconds) =>
  seconds < 60
    ? `${Math.round(seconds)}s`
    : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export default function CollectionChart({ history = [], mode }) {
  const container = useRef(null);
  const [width, setWidth] = useState(900);
  const [inspected, setInspected] = useState(null);
  const id = useId().replace(/:/g, "");
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const points = mode === "demo" ? [] : history;
  const hasData = points.length > 0;
  const current =
    points[Math.min(inspected ?? points.length - 1, points.length - 1)];
  const left = 54,
    right = width - 18,
    top = 18,
    bottom = 214;
  const firstTime = points[0]?.timestamp || 0;
  const duration = Math.max(
    120,
    ((points.at(-1)?.timestamp || firstTime) - firstTime) / 1000,
  );
  const axis = countAxis(Math.max(0, ...points.map((p) => p.pairs)));
  const x = (point) =>
    left + ((point.timestamp - firstTime) / 1000 / duration) * (right - left);
  const y = (value) => bottom - (value / axis.max) * (bottom - top);
  const inspect = (event) => {
    if (!hasData) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const target = ((event.clientX - rect.left) / rect.width) * width;
    let closest = 0;
    points.forEach((point, index) => {
      if (Math.abs(x(point) - target) < Math.abs(x(points[closest]) - target))
        closest = index;
    });
    setInspected(closest);
  };
  return (
    <div className="collection-chart">
      <div className="collection-chart-heading">
        <div>
          <h3>Collection over time</h3>
          <p>One route · observed XX bits, ZZ bits and delivered pairs</p>
        </div>
        <span className="chart-sample-time">
          {hasData
            ? `${inspected === null ? "Latest" : "Sample"} · ${formatTime((current.timestamp - firstTime) / 1000)}`
            : "Waiting for measurements"}
        </span>
      </div>
      <div className="collection-legend" aria-live="off">
        {series.map((item) => (
          <div key={item.key} style={{ "--series-color": item.color }}>
            <span className="collection-swatch" />
            <span>{item.label}</span>
            <strong>
              {current ? current[item.key].toLocaleString() : "—"}
            </strong>
          </div>
        ))}
      </div>
      <div className="collection-plot" ref={container}>
        <svg
          viewBox={`0 0 ${width} 258`}
          role="img"
          aria-label="QKD collection history: total delivered pairs, ZZ bits, and XX bits"
          onPointerMove={inspect}
          onPointerLeave={() => setInspected(null)}
        >
          <desc>
            {hasData
              ? `${points.length} observed snapshots. Latest total ${points.at(-1).pairs} pairs, ${points.at(-1).zz} ZZ bits, ${points.at(-1).xx} XX bits.`
              : "No actual QKD collection measurements received yet."}
          </desc>
          <defs>
            {series.map((item) => (
              <linearGradient
                id={`${id}-${item.key}`}
                key={item.key}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={item.color} stopOpacity="0.2" />
                <stop
                  offset="100%"
                  stopColor={item.color}
                  stopOpacity="0.025"
                />
              </linearGradient>
            ))}
          </defs>
          {axis.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={right}
                y1={y(tick)}
                y2={y(tick)}
                className="collection-gridline"
              />
              <text x={left - 10} y={y(tick) + 4} textAnchor="end">
                {tick.toLocaleString()}
              </text>
            </g>
          ))}
          {[0, 1, 2, 3, 4].map((tick) => (
            <text
              key={tick}
              x={left + (tick / 4) * (right - left)}
              y={bottom + 21}
              textAnchor={tick === 0 ? "start" : tick === 4 ? "end" : "middle"}
            >
              {formatTime((duration * tick) / 4)}
            </text>
          ))}
          <text x={left} y="10" className="collection-axis-label">
            Count
          </text>
          <text
            x={(left + right) / 2}
            y="254"
            textAnchor="middle"
            className="collection-axis-label"
          >
            Time since first observed sample
          </text>
          {series.map((item) => {
            if (!hasData) return null;
            const line = points
              .map(
                (point, index) =>
                  `${index ? "L" : "M"}${x(point)},${y(point[item.key])}`,
              )
              .join(" ");
            return (
              <g key={item.key}>
                <path
                  d={`${line} L${x(points.at(-1))},${bottom} L${x(points[0])},${bottom} Z`}
                  fill={`url(#${id}-${item.key})`}
                />
                <path
                  d={line}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="2.3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
          {current && (
            <g>
              <line
                x1={x(current)}
                x2={x(current)}
                y1={top}
                y2={bottom}
                stroke="#bcc9db"
                strokeDasharray="3 4"
              />
              {series.map((item) => (
                <circle
                  key={item.key}
                  cx={x(current)}
                  cy={y(current[item.key])}
                  r="3.5"
                  fill={item.color}
                  stroke="white"
                  strokeWidth="1.5"
                />
              ))}
            </g>
          )}
        </svg>
        {!hasData && (
          <div className="collection-empty">
            {mode === "demo"
              ? "Connect the backend to chart actual QKD measurements."
              : "The graph will fill as collection telemetry arrives."}
          </div>
        )}
      </div>
      {points.length > 1 && (
        <label className="collection-scrubber">
          Inspect samples
          <input
            type="range"
            min="0"
            max={points.length - 1}
            value={inspected ?? points.length - 1}
            onChange={(event) => setInspected(Number(event.target.value))}
            aria-label="Inspect QKD collection sample"
            aria-valuetext={`${current.pairs} pairs, ${current.zz} ZZ bits, ${current.xx} XX bits`}
          />
          <button type="button" onClick={() => setInspected(null)}>
            Latest
          </button>
        </label>
      )}
      <p className="collection-chart-note">
        Sampled from live polling; not every pair is a plotted point. History
        restarts if route counters reset. Missing measurements are never filled
        with simulated values.
      </p>
    </div>
  );
}
