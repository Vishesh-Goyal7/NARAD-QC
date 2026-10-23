import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Copy,
  Download,
  Expand,
  FileUp,
  GitBranch,
  Layers,
  Link2,
  Loader2,
  LockKeyhole,
  MessageSquare,
  MousePointer2,
  Network,
  PanelLeftClose,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Send,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Unplug,
  UserRound,
  Users,
  Wifi,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  defaultGraph,
  validateGraph,
  validateQkd,
  discoverRoutes,
  edgeId,
  defaultQkd,
  stages,
  stageColor,
} from "./graph";
import { apiRequest, toBase64, fromBase64 } from "./api";
import Telemetry from "./Telemetry";
import { appendCollectionSample } from "./collectionHistory";
import PeerMessaging from "./PeerMessaging";
import { createNonceState, nextSessionNonce } from "./progress";
const uid = () => crypto.randomUUID();
const fmt = (v, d = 1) =>
  Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
function IconButton({ icon: Icon, label, onClick, active, disabled, ...rest }) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      <Icon size={16} />
    </button>
  );
}
function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  type = "number",
  hint,
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) =>
          onChange(
            type === "number"
              ? e.target.value === ""
                ? ""
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
function NetworkCanvas({
  graph,
  setGraph,
  selected,
  setSelected,
  tool,
  setTool,
  stage,
  activeEdges,
  routeNodes,
  locked,
  onNotice,
}) {
  const svgRef = useRef(null),
    drag = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [first, setFirst] = useState(null);
  const nodes = graph.nodes;
  const xs = nodes.map((n) => n.x_km),
    ys = nodes.map((n) => n.y_km);
  const minX = Math.min(...xs) - 48,
    maxX = Math.max(...xs) + 48,
    minY = Math.min(...ys) - 55,
    maxY = Math.max(...ys) + 55;
  const box = useRef(null);
  if (!drag.current)
    box.current = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  const b = box.current;
  const vb = {
    x: b.x + (b.w * (1 - 1 / zoom)) / 2,
    y: b.y + (b.h * (1 - 1 / zoom)) / 2,
    w: b.w / zoom,
    h: b.h / zoom,
  };
  const point = (e) => {
    const p = new DOMPoint(e.clientX, e.clientY);
    const m = svgRef.current.getScreenCTM();
    return m ? p.matrixTransform(m.inverse()) : p;
  };
  const chooseNode = (e, n) => {
    e.stopPropagation();
    if (tool === "fibre" && !locked) {
      if (!first) {
        setFirst(n.name);
        return;
      }
      if (first !== n.name) {
        if (
          graph.links.some(
            (l) => edgeId(l.source, l.target) === edgeId(first, n.name),
          )
        )
          onNotice("Those nodes are already connected.");
        else
          setGraph((g) => ({
            ...g,
            links: [
              ...g.links,
              {
                source: first,
                target: n.name,
                modes: 8,
                attenuation: 0.2,
                active: true,
              },
            ],
          }));
        setFirst(null);
      }
      return;
    }
    setSelected({ kind: "node", id: n.name });
    if (!locked && tool === "select") {
      const p = point(e);
      drag.current = { id: n.name, dx: n.x_km - p.x, dy: -n.y_km - p.y };
      svgRef.current.setPointerCapture(e.pointerId);
    }
  };
  const bgClick = (e) => {
    if (locked || e.target !== svgRef.current) return;
    if (tool === "user" || tool === "repeater") {
      const p = point(e),
        role = tool === "user" ? "USER" : "REPEATER";
      let i = 1;
      while (
        nodes.some((n) => n.name === `${role === "USER" ? "User" : "R"}${i}`)
      )
        i++;
      if (nodes.length >= 24) {
        onNotice("The bridge supports up to 24 nodes.");
        return;
      }
      const name = `${role === "USER" ? "User" : "R"}${i}`;
      setGraph((g) => ({
        ...g,
        nodes: [
          ...g.nodes,
          {
            name,
            role,
            x_km: Math.round(p.x),
            y_km: Math.round(-p.y),
            memory_slots: role === "USER" ? 2 : 8,
            bsm_units: role === "USER" ? 0 : 2,
            bsm_success_probability: role === "USER" ? 0 : 0.4,
            active: true,
          },
        ],
      }));
      setSelected({ kind: "node", id: name });
      setTool("select");
    } else {
      setSelected(null);
      setFirst(null);
    }
  };
  useEffect(() => {
    if (tool !== "fibre") setFirst(null);
  }, [tool]);
  const color = stageColor[stage] || stageColor.routing;
  return (
    <div className={`canvas-wrap tool-${tool}`}>
      <div className="canvas-title">
        <span className="tiny-dot blue" />
        <span>PHYSICAL TOPOLOGY</span>
        <span className="canvas-sub">Coordinates in kilometres</span>
      </div>
      <div className="canvas-tools">
        <IconButton
          icon={MousePointer2}
          label="Select and drag nodes"
          active={tool === "select"}
          onClick={() => setTool("select")}
        />
        <span />
        <IconButton
          icon={UserRound}
          label="Add user: select then click the canvas"
          active={tool === "user"}
          disabled={locked}
          onClick={() => setTool("user")}
        />
        <IconButton
          icon={Radio}
          label="Add repeater: select then click the canvas"
          active={tool === "repeater"}
          disabled={locked}
          onClick={() => setTool("repeater")}
        />
        <IconButton
          icon={Link2}
          label="Connect fibre: select two nodes"
          active={tool === "fibre"}
          disabled={locked}
          onClick={() => setTool("fibre")}
        />
      </div>
      <svg
        ref={svgRef}
        className="network-svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onPointerDown={bgClick}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const p = point(e),
            d = drag.current;
          setGraph((g) => ({
            ...g,
            nodes: g.nodes.map((n) =>
              n.name === d.id
                ? {
                    ...n,
                    x_km: Math.round(p.x + d.dx),
                    y_km: Math.round(-(p.y + d.dy)),
                  }
                : n,
            ),
          }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        role="img"
        aria-label="Editable quantum network. Drag nodes to move; use add and connect tools to change the graph."
      >
        <defs>
          <pattern
            id="grid"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="0.6" cy="0.6" r="0.45" fill="#ced7e2" />
          </pattern>
          <marker
            id="route-arrow"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path d="M0 0 L6 3 L0 6Z" fill={color} />
          </marker>
        </defs>
        <rect
          x={vb.x}
          y={vb.y}
          width={vb.w}
          height={vb.h}
          fill="url(#grid)"
          pointerEvents="none"
        />
        {graph.links.map((l) => {
          let a = nodes.find((n) => n.name === l.source),
            b = nodes.find((n) => n.name === l.target);
          if (!a || !b) return null;
          const id = edgeId(l.source, l.target),
            isActive = activeEdges.includes(id),
            isSelected = selected?.kind === "link" && selected.id === id;
          const idx = routeNodes.indexOf(l.source);
          if (idx >= 0 && routeNodes[idx - 1] === l.target) [a, b] = [b, a];
          const dx = b.x_km - a.x_km,
            dy = -b.y_km + a.y_km,
            len = Math.hypot(dx, dy) || 1,
            ux = dx / len,
            uy = dy / len;
          const x1 = a.x_km + ux * 12,
            y1 = -a.y_km + uy * 12,
            x2 = b.x_km - ux * 14,
            y2 = -b.y_km - uy * 14;
          return (
            <g
              key={id}
              className={`fibre ${isActive ? "flowing" : ""} ${!l.active ? "inactive" : ""}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelected({ kind: "link", id });
              }}
              tabIndex={0}
              role="button"
              aria-label={`Fibre ${l.source} to ${l.target}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSelected({ kind: "link", id });
              }}
            >
              <line className="link-hit" x1={x1} y1={y1} x2={x2} y2={y2} />
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isActive ? color : isSelected ? "#377dff" : "#b5c1d0"}
                strokeWidth={isActive ? 1.8 : isSelected ? 1.6 : 0.9}
                strokeDasharray={!l.active ? "3 3" : undefined}
              />
              {isActive && (
                <line
                  className="flow-line"
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth="1.4"
                  markerEnd="url(#route-arrow)"
                />
              )}
              <g
                transform={`translate(${(a.x_km + b.x_km) / 2},${-(a.y_km + b.y_km) / 2})`}
                className="link-label"
              >
                <rect x="-15" y="-3.8" width="30" height="7.6" rx="2" />
                <text textAnchor="middle" dominantBaseline="central">
                  {fmt(len, 0)} km
                </text>
              </g>
            </g>
          );
        })}
        {nodes.map((n) => {
          const isUser = n.role === "USER",
            isSelected = selected?.kind === "node" && selected.id === n.name,
            lit = routeNodes.includes(n.name);
          return (
            <g
              key={n.name}
              className={`graph-node ${!n.active ? "inactive" : ""}`}
              transform={`translate(${n.x_km},${-n.y_km})`}
              onPointerDown={(e) => chooseNode(e, n)}
              tabIndex={0}
              role="button"
              aria-label={`Select ${n.name}`}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  setSelected({ kind: "node", id: n.name });
              }}
            >
              <circle
                r="14"
                fill="none"
                stroke={
                  isSelected || first === n.name
                    ? "#377dff"
                    : lit
                      ? color
                      : "transparent"
                }
                strokeWidth="0.8"
                strokeDasharray={first === n.name ? "2 2" : undefined}
              />
              {isUser ? (
                <rect
                  x="-10"
                  y="-10"
                  width="20"
                  height="20"
                  rx="6"
                  fill="#edf3ff"
                  stroke={lit ? color : "#8baded"}
                  strokeWidth="0.8"
                />
              ) : (
                <circle
                  r="9"
                  fill="white"
                  stroke={lit ? color : "#8295b0"}
                  strokeWidth="0.9"
                />
              )}
              {isUser ? (
                <g fill="none" stroke="#377dff" strokeWidth="1.1">
                  <circle cy="-2.7" r="2.2" />
                  <path d="M-4.5 4.8v-1c0-4 9-4 9 0v1" />
                </g>
              ) : (
                <g
                  fill="none"
                  stroke={lit ? color : "#5e789a"}
                  strokeWidth="1.1"
                >
                  <path d="M0 -5v10M-4 -2l4-3 4 3M-4 2l4 3 4-3" />
                </g>
              )}
              <text className="node-name" y="21" textAnchor="middle">
                {n.name}
              </text>
              <text className="node-meta" y="28" textAnchor="middle">
                {isUser
                  ? "END USER"
                  : `${n.memory_slots} memory · ${n.bsm_units} BSM`}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="canvas-hint">
        {locked
          ? "Topology is locked for this protocol session."
          : tool === "fibre"
            ? first
              ? `Now select a node to connect to ${first}`
              : "Select the first fibre endpoint"
            : tool === "user" || tool === "repeater"
              ? "Click an empty area to place your node"
              : "Drag nodes to reposition · Select a node or fibre to edit"}
      </div>
      <div className="canvas-zoom">
        <IconButton
          icon={ZoomOut}
          label="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.7, z - 0.2))}
        />
        <span>{Math.round(zoom * 100)}%</span>
        <IconButton
          icon={ZoomIn}
          label="Zoom in"
          onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
        />
        <IconButton
          icon={Expand}
          label="Fit network"
          onClick={() => setZoom(1)}
        />
      </div>
    </div>
  );
}
export default function App() {
  const [graph, setGraphState] = useState(defaultGraph);
  const [selection, setSelection] = useState({ kind: "node", id: "R1" });
  const [tool, setTool] = useState("select");
  const [sender, setSender] = useState("Alice");
  const [receiver, setReceiver] = useState("Bob");
  const [workers, setWorkers] = useState(1),
    [lanes, setLanes] = useState(1),
    [maxHops, setMaxHops] = useState(8),
    [qkd, setQkd] = useState(defaultQkd),
    [advanced, setAdvanced] = useState(false);
  const [mode, setMode] = useState("demo"),
    [connection, setConnection] = useState({ url: "", key: "" }),
    [connected, setConnected] = useState(false),
    [connectOpen, setConnectOpen] = useState(false),
    [connecting, setConnecting] = useState(false);
  const [capacity, setCapacity] = useState(null),
    [progress, setProgress] = useState(null),
    [collectionHistory, setCollectionHistory] = useState([]),
    [reply, setReply] = useState(
      "Hi Alice, received. This shared session works both ways.",
    );
  const [phase, setPhase] = useState("idle"),
    [busy, setBusy] = useState(false),
    [session, setSession] = useState(null),
    [jobId, setJobId] = useState(null),
    [monitorLost, setMonitorLost] = useState(false);
  const [logs, setLogs] = useState([
      {
        seq: 0,
        time: Date.now(),
        stage: "system",
        message: "Workspace ready. Edit the topology, then preview a route.",
        level: "info",
      },
    ]),
    [routes, setRoutes] = useState([]),
    [route, setRoute] = useState([]),
    [activeEdges, setActiveEdges] = useState([]);
  const [message, setMessage] = useState(
      "Hello Bob, our quantum-secured channel is ready.",
    ),
    [messages, setMessages] = useState([]),
    [sending, setSending] = useState(false),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("network"),
    [inspectorTab, setInspectorTab] = useState("properties");
  const demoKey = useRef(null),
    demoNonces = useRef(null),
    fileRef = useRef(null),
    logRef = useRef(null),
    pollTimer = useRef(null),
    alive = useRef(true),
    generation = useRef(0),
    seq = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      clearTimeout(pollTimer.current);
    };
  }, []);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 6500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const notify = (msg) => setNotice(msg);
  const log = (stage, message, level = "info") =>
    setLogs((l) => [
      ...l.slice(-499),
      { seq: ++seq.current, time: Date.now(), stage, message, level },
    ]);
  const lock = busy || !!session;
  const users = graph.nodes.filter((n) => n.role === "USER" && n.active);
  const setGraph = useCallback((updater) => {
    setGraphState((g) =>
      typeof updater === "function" ? updater(g) : updater,
    );
    setRoutes([]);
    setRoute([]);
    setActiveEdges([]);
    setPhase("idle");
  }, []);
  const routeEdges = (path) => path.slice(1).map((n, i) => edgeId(path[i], n));
  const selectedNode =
    selection?.kind === "node"
      ? graph.nodes.find((n) => n.name === selection.id)
      : null;
  const selectedLink =
    selection?.kind === "link"
      ? graph.links.find((l) => edgeId(l.source, l.target) === selection.id)
      : null;
  const renameNode = () => {
    const old = selectedNode.name;
    const name = nodeName.trim();
    if (
      !name ||
      name.length > 40 ||
      name.includes("--") ||
      graph.nodes.some((n) => n.name === name && n.name !== old)
    ) {
      notify("Choose a unique node name, up to 40 characters, without --.");
      return;
    }
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.name === old ? { ...n, name } : n)),
      links: g.links.map((l) => ({
        ...l,
        source: l.source === old ? name : l.source,
        target: l.target === old ? name : l.target,
      })),
    }));
    if (sender === old) setSender(name);
    if (receiver === old) setReceiver(name);
    setSelection({ kind: "node", id: name });
  };
  const updateNode = (key, value) =>
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) =>
        n.name === selectedNode.name ? { ...n, [key]: value } : n,
      ),
    }));
  const [nodeName, setNodeName] = useState("");
  useEffect(() => setNodeName(selectedNode?.name || ""), [selectedNode?.name]);
  const updateLink = (key, value) =>
    setGraph((g) => ({
      ...g,
      links: g.links.map((l) =>
        edgeId(l.source, l.target) === selection.id
          ? { ...l, [key]: value }
          : l,
      ),
    }));
  const removeSelected = () => {
    if (selectedNode) {
      const name = selectedNode.name;
      setGraph((g) => ({
        ...g,
        nodes: g.nodes.filter((n) => n.name !== name),
        links: g.links.filter((l) => l.source !== name && l.target !== name),
      }));
      if (sender === name) setSender("");
      if (receiver === name) setReceiver("");
    } else if (selectedLink)
      setGraph((g) => ({
        ...g,
        links: g.links.filter(
          (l) => edgeId(l.source, l.target) !== selection.id,
        ),
      }));
    setSelection(null);
  };
  const check = () => {
    validateGraph(graph);
    validateQkd(qkd);
    if (
      !sender ||
      !receiver ||
      sender === receiver ||
      !users.some((n) => n.name === sender) ||
      !users.some((n) => n.name === receiver)
    )
      throw new Error("Select two different active users.");
    if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > 12)
      throw new Error("Max hops must be between 1 and 12.");
    if (
      !Number.isInteger(workers) ||
      workers < 1 ||
      workers > 64 ||
      !Number.isInteger(lanes) ||
      lanes < 1 ||
      lanes > 512
    )
      throw new Error("Check the worker and lane limits.");
    return true;
  };
  const payload = () => ({
    graph,
    sender,
    receiver,
    qkd,
    execution: {
      cpu_workers: workers,
      parallel_quantum_lanes: lanes,
      max_hops: maxHops,
    },
  });
  const preview = async () => {
    try {
      check();
      setBusy(true);
      log(
        "routing",
        mode === "demo"
          ? "Previewing local role-safe routes (demo heuristic)."
          : "Requesting Policy-C route preview…",
      );
      let r;
      if (mode === "demo") r = discoverRoutes(graph, sender, receiver, maxHops);
      else {
        if (!connected) throw new Error("Connect the notebook bridge first.");
        const data = await apiRequest(connection, "/preview", {
          method: "POST",
          body: payload(),
          timeout: 30000,
        });
        r = data.ranked_routes;
      }
      setRoutes(r);
      setRoute(r[0]?.nodes || []);
      setActiveEdges(routeEdges(r[0]?.nodes || []));
      setPhase("routing");
      log(
        "routing",
        `${r.length} feasible route${r.length === 1 ? "" : "s"} found. ${r.length ? "Route preview ready." : "Try adding fibres or changing the hop limit."}`,
        r.length ? "success" : "warning",
      );
    } catch (e) {
      notify(e.message);
      log("routing", e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const consumeEvent = (e) => {
    if (e.stage) setPhase(e.stage);
    if (e.nodes?.length > 1) {
      setRoute(e.nodes);
      setActiveEdges(routeEdges(e.nodes));
    } else if (e.edges?.length)
      setActiveEdges(e.edges.map(([a, b]) => edgeId(a, b)));
    setLogs((l) => [
      ...l.slice(-499),
      { ...e, time: e.time * 1000, seq: ++seq.current },
    ]);
  };
  const monitor = async (id, cursor = 0, attempt = 0) => {
    try {
      const data = await apiRequest(connection, `/jobs/${id}?after=${cursor}`);
      if (!alive.current) return;
      if (data.events_truncated)
        log(
          "system",
          "Some early events were evicted from the bounded backend log.",
          "warning",
        );
      data.events.forEach(consumeEvent);
      if (data.progress && Object.keys(data.progress).length) {
        setProgress(data.progress);
        setCollectionHistory((history) =>
          appendCollectionSample(history, data.progress),
        );
      }
      setMonitorLost(false);
      if (data.status === "SUCCEEDED") {
        setSession(data.result);
        setCollectionHistory((history) =>
          appendCollectionSample(history, {
            delivered_pairs: data.result.delivered_pairs,
            zz_bits: data.result.zz_raw_key_bits,
            xx_bits: data.result.xx_parameter_estimation_bits,
          }),
        );
        setRoute(data.result.selected_node_names);
        setActiveEdges(routeEdges(data.result.selected_node_names));
        setPhase("complete");
        setBusy(false);
        log(
          "complete",
          "Shared key established. Encrypted messaging is available.",
          "success",
        );
        return;
      }
      if (data.status === "FAILED") {
        setPhase("failed");
        setBusy(false);
        log("failed", data.error || "Protocol execution failed.", "error");
        notify(data.error || "Protocol execution failed.");
        return;
      }
      pollTimer.current = setTimeout(() => monitor(id, data.cursor, 0), 750);
    } catch (e) {
      if (!alive.current) return;
      if (attempt < 3) {
        pollTimer.current = setTimeout(
          () => monitor(id, cursor, attempt + 1),
          1500 * (attempt + 1),
        );
        return;
      }
      setMonitorLost(true);
      log(
        "system",
        `Connection interrupted: ${e.message}. The backend may still be running. Resume monitoring; do not start a duplicate job.`,
        "warning",
      );
    }
  };
  const run = async () => {
    try {
      check();
      setBusy(true);
      setMonitorLost(false);
      setProgress(null);
      setCollectionHistory([]);
      setSession(null);
      demoKey.current = null;
      setMessages([]);
      setRoutes([]);
      setPhase("validation");
      setActiveEdges([]);
      log(
        "validation",
        mode === "demo"
          ? "Starting an illustrative demo. No notebook physics will execute."
          : "Submitting topology and protocol configuration to the notebook…",
      );
      if (mode === "live") {
        if (!connected) throw new Error("Connect the notebook bridge first.");
        const id = uid();
        setJobId(id);
        try {
          await apiRequest(connection, "/jobs", {
            method: "POST",
            body: { ...payload(), request_id: id },
            timeout: 30000,
          });
        } catch (error) {
          if (error.status && error.status < 500) throw error;
          log(
            "system",
            "Submission response was interrupted. Checking the same job ID before allowing another run.",
            "warning",
          );
        }
        monitor(id);
        return;
      }
      const demoGeneration = ++generation.current;
      const r = discoverRoutes(graph, sender, receiver, maxHops);
      if (!r.length)
        throw new Error("No role-safe route connects these users.");
      const path = r[0].nodes;
      setRoutes(r);
      const steps = [
        [
          "validation",
          "Node roles, memory profiles and fibre endpoints checked.",
        ],
        ["routing", `Illustrative route selected: ${path.join(" → ")}`],
        ["authentication", "Demo: mutual node authentication illustrated."],
        [
          "generation",
          "Demo: elementary generation and entanglement swapping illustrated.",
        ],
        [
          "distillation",
          "Demo: BBM92, reconciliation and privacy amplification illustrated.",
        ],
      ];
      for (const [s, msg] of steps) {
        await new Promise((r) => setTimeout(r, 1000));
        if (!alive.current || generation.current !== demoGeneration) return;
        setPhase(s);
        setRoute(path);
        setActiveEdges(routeEdges(path));
        log(s, msg, s === "validation" ? "success" : "info");
      }
      const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: qkd.target_secret_bits },
        false,
        ["encrypt", "decrypt"],
      );
      if (!alive.current) return;
      demoKey.current = key;
      demoNonces.current = createNonceState();
      setSession({
        session_id: `demo-${uid()}`,
        sender,
        receiver,
        final_secret_bits: qkd.target_secret_bits,
        selected_node_names: path,
        demo: true,
        execution: {
          applied_cpu_workers: 1,
          applied_parallel_quantum_lanes: 1,
        },
      });
      setPhase("complete");
      setBusy(false);
      log(
        "complete",
        `Demo ready. Browser-generated AES-${qkd.target_secret_bits} key available; this key was not produced by QKD.`,
        "success",
      );
    } catch (e) {
      setBusy(false);
      setPhase("failed");
      notify(e.message);
      log("failed", e.message, "error");
    }
  };
  const connect = async () => {
    setConnecting(true);
    try {
      const h = await apiRequest(connection, "/health");
      if (h.bridge !== "NARAD-QC-GUI")
        throw new Error(
          "This URL is not the GUI bridge. Run gui/backend/colab_cell.py in Colab first.",
        );
      if (!h.bidirectional_messaging)
        throw new Error(
          "Upload the updated gui_bridge.py (v1.1+) and restart the bridge to enable worker telemetry and two-way messaging.",
        );
      setCapacity(h.capacity || null);
      setConnected(true);
      setMode("live");
      setConnectOpen(false);
      log(
        "system",
        `Connected to notebook bridge ${h.version}. Real protocol mode enabled.`,
        "success",
      );
      log(
        "system",
        h.capacity?.parallel_cpu_workers_supported
          ? `Parallel execution available: up to ${h.capacity.max_safe_cpu_workers} CPU workers; applied count is also bounded by quantum lanes.`
          : "Legacy runtime: one worker and one lane. Run the new notebook parallelism cell to enable more.",
        h.capacity?.parallel_cpu_workers_supported ? "success" : "warning",
      );
    } catch (e) {
      notify(e.message);
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  };
  useEffect(() => {
    if (!session || session.demo) return;
    let disposed = false;
    let cursor = 0;
    const receive = async () => {
      try {
        const data = await apiRequest(
          connection,
          `/sessions/${session.session_id}/messages?after=${cursor}`,
        );
        if (disposed) return;
        cursor = data.cursor;
        setMessages((previous) => {
          const ids = new Set(previous.map((m) => m.id));
          return [
            ...previous,
            ...data.messages
              .filter((m) => !ids.has(m.id))
              .map((m) => ({
                id: m.id,
                sender: m.sender,
                receiver: m.receiver,
                ciphertext: m.ciphertext_b64,
                bytes: m.plaintext_bytes,
                plaintext: null,
                time: m.time * 1000,
              })),
          ].slice(-200);
        });
      } catch {
        /* Sending/decryption surfaces session errors; avoid repeated idle notifications. */
      }
    };
    receive();
    const timer = setInterval(receive, 1500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [session, connection]);
  const reset = async () => {
    if (busy || sending) return;
    if (session && !session.demo) {
      try {
        await apiRequest(connection, `/sessions/${session.session_id}`, {
          method: "DELETE",
        });
      } catch (e) {
        if (e.status !== 404) {
          notify(`Could not destroy server session: ${e.message}`);
          return;
        }
      }
    }
    demoKey.current = null;
    setSession(null);
    setMessages([]);
    setPhase("idle");
    setRoute([]);
    setActiveEdges([]);
    setJobId(null);
    setProgress(null);
    setCollectionHistory([]);
    demoNonces.current = null;
    log("system", "Session cleared. Network editing is available.");
  };
  const send = async (side = 0) => {
    const text = side === 0 ? message : reply;
    if (!session || !text.trim() || sending) return;
    const from = side === 0 ? session.sender : session.receiver;
    const to = side === 0 ? session.receiver : session.sender;
    setSending(from);
    try {
      let blob;
      let serverMessage = null;
      if (session.demo) {
        const nonce = nextSessionNonce(demoNonces.current);
        const encrypted = new Uint8Array(
          await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: nonce },
            demoKey.current,
            new TextEncoder().encode(text),
          ),
        );
        blob = toBase64(new Uint8Array([...nonce, ...encrypted]));
      } else {
        const r = await apiRequest(
          connection,
          `/sessions/${session.session_id}/messages`,
          {
            method: "POST",
            body: {
              sender: from,
              receiver: to,
              message: text,
            },
          },
        );
        blob = r.ciphertext_b64;
        serverMessage = r;
      }
      setMessages((m) => [
        ...m.filter((v) => v.id !== serverMessage?.id),
        {
          id: serverMessage?.id || uid(),
          sender: from,
          receiver: to,
          ciphertext: blob,
          bytes: new TextEncoder().encode(text).length,
          plaintext: null,
          sent: text,
          time: Date.now(),
        },
      ]);
      if (side === 0) setMessage("");
      else setReply("");
      setPhase("messaging");
      const path =
        side === 0
          ? session.selected_node_names
          : [...session.selected_node_names].reverse();
      setRoute(path);
      setActiveEdges(routeEdges(path));
      log(
        "messaging",
        `AES-${session.final_secret_bits}: ${new TextEncoder().encode(text).length} bytes encrypted from ${from} to ${to} using the shared session.`,
        "success",
      );
    } catch (e) {
      notify(e.message);
      log("messaging", e.message, "error");
    } finally {
      setSending(false);
    }
  };
  const decrypt = async (item) => {
    try {
      let plaintext;
      if (session.demo) {
        const blob = fromBase64(item.ciphertext);
        plaintext = new TextDecoder().decode(
          await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: blob.slice(0, 12) },
            demoKey.current,
            blob.slice(12),
          ),
        );
      } else {
        const r = await apiRequest(
          connection,
          `/sessions/${session.session_id}/decrypt`,
          { method: "POST", body: { ciphertext_b64: item.ciphertext } },
        );
        plaintext = r.message;
      }
      setMessages((m) =>
        m.map((v) => (v.id === item.id ? { ...v, plaintext } : v)),
      );
      log(
        "messaging",
        `Authentication tag verified. ${item.receiver} decrypted the message from ${item.sender}.`,
        "success",
      );
    } catch (e) {
      notify(e.message);
      log("messaging", "AES authentication/decryption failed.", "error");
    }
  };
  const exportGraph = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "narad-network.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importGraph = async (e) => {
    try {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 1e6) throw new Error("Graph file must be under 1 MB.");
      const g = validateGraph(JSON.parse(await f.text()));
      setGraph(g);
      setSelection(null);
      const u = g.nodes.filter((n) => n.role === "USER" && n.active);
      setSender(u[0]?.name || "");
      setReceiver(u[1]?.name || "");
      log(
        "system",
        `Imported ${g.nodes.length} nodes and ${g.links.length} fibres.`,
      );
    } catch (error) {
      notify(error.message);
    } finally {
      e.target.value = "";
    }
  };
  const downloadLogs = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          logs
            .map(
              (l) =>
                `${new Date(l.time).toISOString()} [${l.stage}] ${l.message}`,
            )
            .join("\n"),
        ],
        { type: "text/plain" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "narad-protocol.log";
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      notify("Copied to clipboard.");
    } catch {
      notify("Clipboard unavailable. Select and copy the text manually.");
    }
  };
  const stageIndex = stages.findIndex(
    ([id]) => id === (phase === "messaging" ? "complete" : phase),
  );
  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand-mark">
          <Network size={24} />
        </div>
        <button
          className={tab === "network" ? "rail-button current" : "rail-button"}
          title="Network workspace"
          aria-label="Network workspace"
          onClick={() => setTab("network")}
        >
          <Network size={20} />
        </button>
        <button
          className={tab === "messages" ? "rail-button current" : "rail-button"}
          title="Encrypted messages"
          aria-label="Encrypted messages"
          onClick={() => setTab("messages")}
        >
          <MessageSquare size={20} />
          {messages.length > 0 && <i />}
        </button>
        <button
          className="rail-button"
          title="Connection settings"
          aria-label="Connection settings"
          onClick={() => setConnectOpen(true)}
        >
          <Server size={19} />
        </button>
        <div className="rail-bottom">
          <button
            className="rail-button"
            title="How to use this workspace"
            aria-label="Help"
            onClick={() =>
              notify(
                "1. Edit or import the graph. 2. Set endpoints and hardware. 3. Preview or run. 4. Send and decrypt messages. Connect the notebook for real QKD.",
              )
            }
          >
            <CircleHelp size={20} />
          </button>
          <div className="avatar">VG</div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="wordmark">
            NARAD<span>-QC</span>
            <span className="product-label">NETWORK CONSOLE</span>
          </div>
          <div className="header-right">
            <span className="version">v1.1 / RESEARCH</span>
            <button
              className={`connection-pill ${mode === "live" && connected ? "online" : ""}`}
              onClick={() => setConnectOpen(true)}
            >
              <span className="tiny-dot" />
              {mode === "demo"
                ? "Demo workspace"
                : connected
                  ? "Notebook connected"
                  : "Disconnected"}
              <ChevronDown size={13} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">QUANTUM COMMUNICATIONS / WORKSPACE</div>
              <h1>
                {tab === "network"
                  ? "Build a connection."
                  : "A private conversation."}
              </h1>
              <p>
                {tab === "network"
                  ? "Design your network. Establish trust. Deliver securely."
                  : "From a shared secret to an authenticated message."}
              </p>
            </div>
            <div className="heading-actions">
              <button className="button secondary" onClick={exportGraph}>
                <Download size={15} />
                Export graph
              </button>
              <button
                className="button primary"
                disabled={busy || !!session}
                onClick={run}
              >
                {busy ? (
                  <Loader2 size={15} className="spin" />
                ) : (
                  <Play size={15} fill="currentColor" />
                )}
                {busy
                  ? "Protocol running"
                  : session
                    ? "Session established"
                    : "Run protocol"}
              </button>
            </div>
          </div>
          <div className={`mode-banner ${mode === "live" ? "live" : ""}`}>
            <span className="banner-icon">
              {mode === "demo" ? <Layers size={16} /> : <Wifi size={16} />}
            </span>
            <span>
              <strong>
                {mode === "demo" ? "Interactive demo" : "Live notebook mode"}
              </strong>
              {mode === "demo"
                ? " · Protocol animation is illustrative. Messaging uses real browser AES-GCM; its key is not QKD-derived."
                : " · Submitted graphs execute in the connected notebook. Logs and link activity come from backend events."}
            </span>
            <button
              disabled={busy || !!session}
              onClick={() => setConnectOpen(true)}
            >
              {mode === "demo" ? "Connect notebook" : "Connection settings"}
              <ArrowUpRight size={14} />
            </button>
          </div>
          {tab === "network" && (
            <>
              <div className="workspace-grid">
                <section className="config-panel panel">
                  <div className="panel-heading">
                    <span>
                      <SlidersHorizontal size={16} />
                      Network setup
                    </span>
                    <span className="section-number">01</span>
                  </div>
                  <div className="config-body">
                    <label className="field">
                      <span>Network name</span>
                      <input
                        value={graph.name}
                        disabled={lock}
                        maxLength={80}
                        onChange={(e) =>
                          setGraph((g) => ({ ...g, name: e.target.value }))
                        }
                      />
                    </label>
                    <div className="section-label">
                      ENDPOINTS <Users size={13} />
                    </div>
                    <label className="field">
                      <span>Sender</span>
                      <div className="select-wrap">
                        <UserRound size={14} />
                        <select
                          aria-label="Sender"
                          value={sender}
                          disabled={lock}
                          onChange={(e) => {
                            setSender(e.target.value);
                            setRoutes([]);
                            setRoute([]);
                            setActiveEdges([]);
                          }}
                        >
                          <option value="">Select user</option>
                          {users.map((n) => (
                            <option key={n.name} value={n.name}>
                              {n.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                    <div className="endpoint-connector">
                      <span />
                      <ArrowDown size={13} />
                    </div>
                    <label className="field">
                      <span>Receiver</span>
                      <div className="select-wrap">
                        <UserRound size={14} />
                        <select
                          aria-label="Receiver"
                          value={receiver}
                          disabled={lock}
                          onChange={(e) => {
                            setReceiver(e.target.value);
                            setRoutes([]);
                            setRoute([]);
                            setActiveEdges([]);
                          }}
                        >
                          <option value="">Select user</option>
                          {users.map((n) => (
                            <option key={n.name} value={n.name}>
                              {n.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                    <div className="section-label">
                      EXECUTION <Activity size={13} />
                    </div>
                    <div className="field-row">
                      <Field
                        label="CPU workers"
                        value={workers}
                        min={1}
                        max={64}
                        disabled={lock}
                        onChange={setWorkers}
                      />
                      <Field
                        label="Quantum lanes"
                        value={lanes}
                        min={1}
                        max={512}
                        disabled={lock}
                        onChange={setLanes}
                      />
                    </div>
                    <p className="micro-note">
                      {mode === "demo"
                        ? "Demo mode: worker selection is illustrative. Connect the notebook for parallel execution."
                        : capacity?.parallel_cpu_workers_supported
                          ? `Controller cap: ${capacity.max_safe_cpu_workers} workers. Expected upper bound for this request: ${Math.min(Number(workers) || 1, Number(lanes) || 1, capacity.max_safe_cpu_workers)} workers / ${lanes} lanes. Actual use is reported live.`
                          : "Legacy runtime: applies 1 worker / 1 lane."}
                    </p>
                    <div className="field-row">
                      <Field
                        label="Max hops"
                        value={maxHops}
                        min={1}
                        max={12}
                        disabled={lock}
                        onChange={setMaxHops}
                      />
                      <label className="field">
                        <span>Secret length</span>
                        <select
                          aria-label="Secret length"
                          value={qkd.target_secret_bits}
                          disabled={lock}
                          onChange={(e) =>
                            setQkd((q) => ({
                              ...q,
                              target_secret_bits: Number(e.target.value),
                            }))
                          }
                        >
                          {[128, 192, 256].map((n) => (
                            <option key={n} value={n}>
                              {n} bits
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      className="text-button advanced-toggle"
                      onClick={() => setAdvanced((v) => !v)}
                    >
                      <Settings2 size={13} />
                      Advanced QKD settings
                      {advanced ? (
                        <ChevronUp size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      )}
                    </button>
                    {advanced && (
                      <div className="advanced-fields">
                        {Object.entries(qkd)
                          .filter(([k]) => k !== "target_secret_bits")
                          .map(([key, value]) => (
                            <Field
                              key={key}
                              label={key.replaceAll("_", " ")}
                              value={value}
                              step={
                                [
                                  "z_probability",
                                  "qber_abort_threshold",
                                  "parameter_estimation_margin",
                                  "reconciliation_efficiency_forecast",
                                ].includes(key)
                                  ? 0.01
                                  : 1
                              }
                              disabled={lock}
                              onChange={(v) =>
                                setQkd((q) => ({ ...q, [key]: v }))
                              }
                            />
                          ))}
                      </div>
                    )}
                    <button
                      className="button secondary full"
                      disabled={lock}
                      onClick={preview}
                    >
                      <GitBranch size={15} />
                      Preview routes
                      <ArrowRight size={14} />
                    </button>
                    <div className="graph-files">
                      <button
                        disabled={lock}
                        onClick={() => fileRef.current.click()}
                      >
                        <FileUp size={13} />
                        Import JSON
                      </button>
                      <button
                        disabled={lock}
                        onClick={() => {
                          setGraph(defaultGraph());
                          setSelection(null);
                          setTool("select");
                          setSender("Alice");
                          setReceiver("Bob");
                        }}
                      >
                        <RotateCcw size={13} />
                        Reset graph
                      </button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".json,application/json"
                        hidden
                        onChange={importGraph}
                      />
                    </div>
                  </div>
                </section>
                <section className="graph-panel panel">
                  <div className="graph-topline">
                    <div>
                      <h2>{graph.name || "Untitled network"}</h2>
                      <span>
                        <span className="tiny-dot green" />
                        {graph.nodes.filter((n) => n.active).length} active
                        nodes <span className="separator">/</span>
                        {graph.links.length} optical fibres
                      </span>
                    </div>
                    <span className="tag">
                      {mode === "demo" ? "SANDBOX" : "NOTEBOOK"}
                    </span>
                  </div>
                  <NetworkCanvas
                    graph={graph}
                    setGraph={setGraph}
                    selected={selection}
                    setSelected={setSelection}
                    tool={tool}
                    setTool={setTool}
                    stage={phase}
                    activeEdges={activeEdges}
                    routeNodes={route}
                    locked={lock}
                    onNotice={notify}
                  />
                  <div className="graph-legend">
                    <span>
                      <i className="legend-user" />
                      End user
                    </span>
                    <span>
                      <i className="legend-repeater" />
                      Repeater
                    </span>
                    <span>
                      <i className="legend-line" />
                      Optical fibre
                    </span>
                    <span className="legend-spacer" />
                    {phase !== "idle" && (
                      <span style={{ color: stageColor[phase] }}>
                        <span className="tiny-dot" />
                        {phase === "messaging"
                          ? "Encrypted transport"
                          : stages.find(([id]) => id === phase)?.[1] || phase}
                      </span>
                    )}
                  </div>
                </section>
                <section className="inspector-panel panel">
                  <div className="panel-heading">
                    <span>
                      <Settings2 size={16} />
                      Inspector
                    </span>
                    <span className="section-number">02</span>
                  </div>
                  <div className="inspector-tabs">
                    <button
                      className={
                        inspectorTab === "properties" ? "selected" : ""
                      }
                      onClick={() => setInspectorTab("properties")}
                    >
                      Properties
                    </button>
                    <button
                      className={inspectorTab === "routes" ? "selected" : ""}
                      onClick={() => setInspectorTab("routes")}
                    >
                      Routes <span>{routes.length}</span>
                    </button>
                  </div>
                  <div className="inspector-body">
                    {inspectorTab === "properties" ? (
                      selectedNode ? (
                        <>
                          <div className="selected-identity">
                            <div
                              className={`node-avatar ${selectedNode.role === "USER" ? "user" : ""}`}
                            >
                              {selectedNode.role === "USER" ? (
                                <UserRound size={21} />
                              ) : (
                                <Radio size={21} />
                              )}
                            </div>
                            <div>
                              <h3>{selectedNode.name}</h3>
                              <span>
                                {selectedNode.role === "USER"
                                  ? "End user"
                                  : "Quantum repeater"}
                              </span>
                            </div>
                            <span
                              className={`tag ${selectedNode.active ? "green-tag" : ""}`}
                            >
                              {selectedNode.active ? "ACTIVE" : "OFFLINE"}
                            </span>
                          </div>
                          <div className="rename-field">
                            <Field
                              label="Node name"
                              type="text"
                              value={nodeName}
                              disabled={lock}
                              onChange={setNodeName}
                            />
                            <button
                              className="text-button"
                              disabled={lock || nodeName === selectedNode.name}
                              onClick={renameNode}
                            >
                              Rename
                            </button>
                          </div>
                          <div className="section-label">POSITION / KM</div>
                          <div className="field-row">
                            <Field
                              label="X coordinate"
                              value={selectedNode.x_km}
                              disabled={lock}
                              onChange={(v) => updateNode("x_km", v)}
                            />
                            <Field
                              label="Y coordinate"
                              value={selectedNode.y_km}
                              disabled={lock}
                              onChange={(v) => updateNode("y_km", v)}
                            />
                          </div>
                          <div className="section-label">
                            HARDWARE RESOURCES
                          </div>
                          <Field
                            label="Memory slots"
                            value={selectedNode.memory_slots}
                            min={selectedNode.role === "USER" ? 1 : 2}
                            max={4096}
                            disabled={lock}
                            onChange={(v) => updateNode("memory_slots", v)}
                          />
                          {selectedNode.role === "REPEATER" && (
                            <>
                              <Field
                                label="BSM units"
                                value={selectedNode.bsm_units}
                                min={1}
                                max={512}
                                disabled={lock}
                                onChange={(v) => updateNode("bsm_units", v)}
                              />
                              <Field
                                label="BSM success probability"
                                value={selectedNode.bsm_success_probability}
                                min={0}
                                max={1}
                                step={0.01}
                                disabled={lock}
                                onChange={(v) =>
                                  updateNode("bsm_success_probability", v)
                                }
                              />
                              <p className="micro-note">
                                The notebook executor currently supports p =
                                0.40.
                              </p>
                            </>
                          )}
                          <label className="check-field">
                            <input
                              type="checkbox"
                              checked={selectedNode.active}
                              disabled={lock}
                              onChange={(e) =>
                                updateNode("active", e.target.checked)
                              }
                            />
                            Node online
                          </label>
                          <div className="inspector-tip">
                            <ShieldCheck size={17} />
                            <p>
                              Node authentication is performed when the protocol
                              runs.
                            </p>
                          </div>
                          <button
                            className="text-button danger"
                            disabled={lock}
                            onClick={removeSelected}
                          >
                            <Trash2 size={13} />
                            Remove node & fibres
                          </button>
                        </>
                      ) : selectedLink ? (
                        <>
                          <div className="selected-identity">
                            <div className="node-avatar">
                              <Link2 size={21} />
                            </div>
                            <div>
                              <h3>Optical fibre</h3>
                              <span>
                                {selectedLink.source} ↔ {selectedLink.target}
                              </span>
                            </div>
                          </div>
                          <Field
                            label="Multiplexing modes"
                            min={1}
                            max={512}
                            value={selectedLink.modes}
                            disabled={lock}
                            onChange={(v) => updateLink("modes", v)}
                          />
                          <Field
                            label="Attenuation · dB/km"
                            min={0}
                            max={10}
                            step={0.01}
                            value={selectedLink.attenuation}
                            disabled={lock}
                            onChange={(v) => updateLink("attenuation", v)}
                          />
                          <label className="check-field">
                            <input
                              type="checkbox"
                              checked={selectedLink.active}
                              disabled={lock}
                              onChange={(e) =>
                                updateLink("active", e.target.checked)
                              }
                            />
                            Fibre online
                          </label>
                          <p className="micro-note">
                            Fibre distance follows the Euclidean separation of
                            its nodes. Optical modes are independent generation
                            attempts per cycle.
                          </p>
                          <button
                            className="text-button danger"
                            disabled={lock}
                            onClick={removeSelected}
                          >
                            <Trash2 size={13} />
                            Remove fibre
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="empty-inspector">
                            <MousePointer2 size={30} strokeWidth={1.3} />
                            <h3>A closer look.</h3>
                            <p>
                              Select a node or fibre on the canvas to inspect
                              its position and hardware.
                            </p>
                          </div>
                          <div className="network-stats">
                            <div>
                              <Users size={15} />
                              <span>End users</span>
                              <strong>{users.length}</strong>
                            </div>
                            <div>
                              <Radio size={15} />
                              <span>Repeaters</span>
                              <strong>
                                {
                                  graph.nodes.filter(
                                    (n) => n.role === "REPEATER",
                                  ).length
                                }
                              </strong>
                            </div>
                            <div>
                              <Layers size={15} />
                              <span>Total optical modes</span>
                              <strong>
                                {graph.links.reduce(
                                  (s, l) => s + Number(l.modes || 0),
                                  0,
                                )}
                              </strong>
                            </div>
                          </div>
                          <div className="inspector-tip">
                            <Link2 size={16} />
                            <p>
                              Use the fibre tool to connect two nodes. Select a
                              fibre to set its multiplexing modes.
                            </p>
                          </div>
                        </>
                      )
                    ) : (
                      <>
                        <p className="micro-note">
                          {mode === "demo"
                            ? "Local demo routes use a distance/mode heuristic, not Policy C."
                            : "Routes are ranked by the notebook’s empirical Policy C model."}
                        </p>
                        {routes.length ? (
                          routes.map((r, i) => (
                            <button
                              key={r.path_index ?? i}
                              className={`route-card ${route.join() === r.nodes.join() ? "chosen" : ""}`}
                              onClick={() => {
                                if (!busy && !session) {
                                  setRoute(r.nodes);
                                  setActiveEdges(routeEdges(r.nodes));
                                  setPhase("routing");
                                }
                              }}
                            >
                              <span className="route-rank">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <div>
                                <strong>{r.nodes.join(" → ")}</strong>
                                <small>
                                  {r.distance
                                    ? `${fmt(r.distance)} km · ${r.modes} modes`
                                    : r.predicted_delivery_s
                                      ? `${fmt(r.predicted_delivery_s * 1000)} ms / pair · QBER ${fmt(r.predicted_qber * 100, 2)}%`
                                      : "Policy-C ranked route"}
                                </small>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="empty-inspector">
                            <GitBranch size={28} />
                            <h3>No preview yet.</h3>
                            <p>
                              Preview routes to compare paths between your
                              selected users.
                            </p>
                          </div>
                        )}
                        <p className="micro-note">
                          Selecting a preview changes the highlight. Actual
                          execution chooses and falls back between routes
                          automatically.
                        </p>
                      </>
                    )}
                  </div>
                </section>
              </div>
              <section className="protocol-strip panel">
                <div className="protocol-label">
                  <ShieldCheck size={19} />
                  <div>
                    <strong>Protocol pipeline</strong>
                    <small>
                      {session
                        ? "Shared secret available"
                        : busy
                          ? "Execution in progress"
                          : "Ready when you are"}
                    </small>
                  </div>
                </div>
                <div className="pipeline">
                  {stages.map(([id, label], i) => (
                    <React.Fragment key={id}>
                      <div
                        className={`pipeline-step ${i < stageIndex || session ? "done" : ""} ${i === stageIndex && !session ? "running" : ""}`}
                      >
                        <span style={{ "--stage-color": stageColor[id] }}>
                          {i < stageIndex || session ? (
                            <Check size={12} />
                          ) : i === stageIndex && busy ? (
                            <Loader2 size={12} className="spin" />
                          ) : (
                            i + 1
                          )}
                        </span>
                        <p>{label}</p>
                      </div>
                      {i < stages.length - 1 && (
                        <span
                          className={`pipeline-line ${i < stageIndex ? "done" : ""}`}
                        />
                      )}
                    </React.Fragment>
                  ))}
                </div>
                {session ? (
                  <button className="text-button" onClick={reset}>
                    <RotateCcw size={13} />
                    New session
                  </button>
                ) : monitorLost ? (
                  <button
                    className="button secondary"
                    onClick={() => monitor(jobId)}
                  >
                    Resume monitor
                  </button>
                ) : (
                  <span className="pipeline-status">
                    {phase === "failed"
                      ? "FAILED"
                      : busy
                        ? "RUNNING"
                        : "STANDBY"}
                  </span>
                )}
              </section>
            </>
          )}
          {(busy || session || progress) && (
            <Telemetry
              progress={progress}
              history={collectionHistory}
              session={session}
              busy={busy}
              mode={mode}
              workers={workers}
              lanes={lanes}
            />
          )}
          <div
            className={`bottom-grid ${tab === "messages" ? "messages-page" : ""}`}
          >
            <section className="message-panel panel">
              <div className="panel-heading">
                <span>
                  <LockKeyhole size={16} />
                  Secure messaging
                  <span className={`tag ${session ? "green-tag" : ""}`}>
                    {session
                      ? `AES-${session.final_secret_bits} · READY`
                      : "NO SESSION"}
                  </span>
                </span>
                <button
                  className="text-button"
                  disabled={!session || busy}
                  onClick={reset}
                >
                  End session
                </button>
              </div>
              <PeerMessaging
                session={session}
                sender={sender}
                receiver={receiver}
                drafts={[message, reply]}
                setDraft={(side, text) =>
                  side === 0 ? setMessage(text) : setReply(text)
                }
                send={send}
                sending={sending}
                messages={messages}
                decrypt={decrypt}
                copy={copy}
              />
            </section>
            <section className="logs-panel panel">
              <div className="panel-heading">
                <span>
                  <Terminal size={16} />
                  Protocol log
                  <span className="log-live">
                    <span className="tiny-dot" />
                    {busy ? "LIVE" : "EVENTS"}
                  </span>
                </span>
                <IconButton
                  icon={Download}
                  label="Download protocol log"
                  onClick={downloadLogs}
                />
              </div>
              <div
                className="log-list"
                ref={logRef}
                role="log"
                aria-label="Protocol progress logs"
              >
                {logs.map((l) => (
                  <div className={`log-row ${l.level}`} key={l.seq}>
                    <time>
                      {new Date(l.time).toLocaleTimeString("en-GB", {
                        hour12: false,
                      })}
                    </time>
                    <span
                      className="log-dot"
                      style={{ background: stageColor[l.stage] || "#8898ad" }}
                    />
                    <p>{l.message}</p>
                  </div>
                ))}
              </div>
              <div className="logs-footer">
                <span>{logs.length} events</span>
                <span>
                  {mode === "demo"
                    ? "ILLUSTRATIVE PROTOCOL / LOCAL AES"
                    : "NOTEBOOK EVENTS"}
                </span>
              </div>
            </section>
          </div>
          {session && !session.demo && (
            <div className="session-summary">
              <ShieldCheck size={15} />
              <strong>
                {session.final_secret_bits}-bit secret established
              </strong>
              <span>{session.delivered_pairs} delivered pairs</span>
              <span>
                Observed X QBER {fmt(session.observed_x_qber * 100, 2)}%
              </span>
              <span>
                {fmt(session.modeled_physical_time_s, 3)} s modeled physical
                time
              </span>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <Network size={12} />
              NARAD-QC<span>Routing. Authentication. Delivery.</span>
            </span>
            <span>
              Quantum network research workspace{" "}
              <span className="tiny-dot green" />
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CircleHelp size={17} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {connectOpen && (
        <div className="modal-backdrop" onClick={() => setConnectOpen(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="node-avatar user">
                <Server size={23} />
              </div>
              <IconButton
                icon={X}
                label="Close connection settings"
                onClick={() => setConnectOpen(false)}
              />
            </div>
            <h2 id="connection-title">Connect your notebook.</h2>
            <p>
              Run the GUI bridge cell after Phase 6 in Colab. Enter its public
              URL and your runtime API key below.
            </p>
            <Field
              label="Bridge API URL"
              type="url"
              value={connection.url}
              disabled={busy || !!session}
              onChange={(v) => {
                setConnection((c) => ({ ...c, url: v }));
                setConnected(false);
              }}
            />
            <Field
              label="X-NARAD-API-Key"
              type="password"
              value={connection.key}
              disabled={busy || !!session}
              onChange={(v) => {
                setConnection((c) => ({ ...c, key: v }));
                setConnected(false);
              }}
            />
            <p className="micro-note">
              The key stays in this tab’s memory. Full installation instructions
              are in gui/README.md. Real QKD runs in your notebook.
            </p>
            <button
              className="button primary full"
              disabled={
                connecting ||
                busy ||
                !!session ||
                !connection.url ||
                !connection.key
              }
              onClick={connect}
            >
              {connecting ? (
                <Loader2 size={15} className="spin" />
              ) : (
                <Wifi size={15} />
              )}
              Test & connect
            </button>
            <button
              className="button secondary full"
              disabled={busy || !!session}
              onClick={() => {
                setMode("demo");
                setConnectOpen(false);
                setConnected(false);
                log("system", "Interactive demo mode enabled.");
              }}
            >
              Use interactive demo
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
