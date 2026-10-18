export const defaultGraph = () => ({
  name: "NARAD research network",
  nodes: [
    ["Alice", "USER", 0, 0, 2, 0],
    ["Bob", "USER", 300, 0, 2, 0],
    ["Charlie", "USER", 150, 85, 2, 0],
    ["R1", "REPEATER", 55, 20, 8, 2],
    ["R2", "REPEATER", 120, 15, 8, 2],
    ["R3", "REPEATER", 205, 18, 8, 2],
    ["R4", "REPEATER", 75, -55, 12, 3],
    ["R5", "REPEATER", 165, -65, 12, 3],
    ["R6", "REPEATER", 245, -45, 12, 3],
  ].map(([name, role, x_km, y_km, memory_slots, bsm_units]) => ({
    name,
    role,
    x_km,
    y_km,
    memory_slots,
    bsm_units,
    bsm_success_probability: role === "USER" ? 0 : 0.4,
    active: true,
  })),
  links: [
    ["Alice", "R1", 8],
    ["R1", "R2", 8],
    ["R2", "R3", 8],
    ["R3", "Bob", 8],
    ["Alice", "R4", 16],
    ["R4", "R5", 16],
    ["R5", "R6", 16],
    ["R6", "Bob", 16],
    ["R1", "R5", 6],
    ["R2", "R5", 10],
    ["R3", "R6", 12],
    ["R2", "Charlie", 8],
    ["Charlie", "R3", 8],
    ["Charlie", "R1", 8],
  ].map(([source, target, modes]) => ({
    source,
    target,
    modes,
    attenuation: 0.2,
    active: true,
  })),
});
export const edgeId = (a, b) => [a, b].sort().join("--");
export function validateGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.links))
    throw new Error("Graph must contain nodes and links arrays.");
  if (graph.nodes.length < 2 || graph.nodes.length > 24)
    throw new Error("Use 2–24 nodes per network.");
  if (graph.links.length > 48)
    throw new Error("Use at most 48 fibres per network.");
  const names = new Set();
  for (const n of graph.nodes) {
    if (
      typeof n.name !== "string" ||
      !n.name.trim() ||
      n.name !== n.name.trim() ||
      n.name.length > 40 ||
      n.name.includes("--") ||
      names.has(n.name)
    )
      throw new Error(
        "Node names must be unique, trimmed, at most 40 characters, and cannot contain --.",
      );
    names.add(n.name);
    if (
      !["USER", "REPEATER"].includes(n.role) ||
      ![n.x_km, n.y_km].every(Number.isFinite)
    )
      throw new Error(`Invalid role or coordinates for ${n.name}.`);
    if (
      !Number.isInteger(n.memory_slots) ||
      n.memory_slots < (n.role === "USER" ? 1 : 2) ||
      n.memory_slots > 4096
    )
      throw new Error(`Invalid memory slots for ${n.name}.`);
    if (
      !Number.isInteger(n.bsm_units) ||
      n.bsm_units < (n.role === "USER" ? 0 : 1) ||
      n.bsm_units > 512 ||
      !Number.isFinite(n.bsm_success_probability) ||
      n.bsm_success_probability < 0 ||
      n.bsm_success_probability > 1
    )
      throw new Error(`Invalid BSM configuration for ${n.name}.`);
    if (
      n.role === "USER" &&
      (n.bsm_units !== 0 || n.bsm_success_probability !== 0)
    )
      throw new Error(`USER ${n.name} cannot have BSM resources.`);
    if (typeof n.active !== "boolean")
      throw new Error(`Invalid active flag for ${n.name}.`);
  }
  const edges = new Set();
  for (const l of graph.links) {
    const id = edgeId(l.source, l.target);
    if (
      !names.has(l.source) ||
      !names.has(l.target) ||
      l.source === l.target ||
      edges.has(id)
    )
      throw new Error(
        "Fibres must connect distinct existing nodes without duplicates.",
      );
    edges.add(id);
    if (
      !Number.isInteger(l.modes) ||
      l.modes < 1 ||
      l.modes > 512 ||
      !Number.isFinite(l.attenuation) ||
      l.attenuation < 0 ||
      l.attenuation > 10 ||
      typeof l.active !== "boolean"
    )
      throw new Error(`Invalid fibre properties for ${id}.`);
  }
  return graph;
}
export function discoverRoutes(graph, sender, receiver, maxHops = 8) {
  validateGraph(graph);
  const nodes = new Map(graph.nodes.map((n) => [n.name, n]));
  if (
    sender === receiver ||
    nodes.get(sender)?.role !== "USER" ||
    nodes.get(receiver)?.role !== "USER" ||
    !nodes.get(sender)?.active ||
    !nodes.get(receiver)?.active
  )
    throw new Error("Choose two different active users.");
  const routes = [];
  const visit = (path) => {
    if (routes.length >= 256) return;
    const a = path.at(-1);
    if (a === receiver) {
      const links = path
        .slice(1)
        .map((b, i) =>
          graph.links.find(
            (l) => edgeId(l.source, l.target) === edgeId(path[i], b),
          ),
        );
      routes.push({
        nodes: path,
        distance: links.reduce((s, l) => {
          const a = nodes.get(l.source),
            b = nodes.get(l.target);
          return s + Math.hypot(a.x_km - b.x_km, a.y_km - b.y_km);
        }, 0),
        modes: Math.min(...links.map((l) => l.modes)),
      });
      return;
    }
    if (path.length - 1 >= maxHops) return;
    for (const l of graph.links.filter(
      (l) => l.active && (l.source === a || l.target === a),
    )) {
      const b = l.source === a ? l.target : l.source;
      if (
        path.includes(b) ||
        !nodes.get(b).active ||
        (b !== receiver && nodes.get(b).role !== "REPEATER")
      )
        continue;
      visit([...path, b]);
    }
  };
  visit([sender]);
  return routes
    .sort(
      (a, b) =>
        a.distance / Math.sqrt(a.modes) - b.distance / Math.sqrt(b.modes),
    )
    .map((r, i) => ({ ...r, rank: i + 1, path: r.nodes.join(" → ") }));
}
export const defaultQkd = {
  target_secret_bits: 128,
  z_probability: 0.8,
  qber_abort_threshold: 0.11,
  minimum_parameter_estimation_bits: 24,
  parameter_estimation_margin: 0.01,
  security_margin_bits: 32,
  reconciliation_efficiency_forecast: 1.16,
  collection_headroom_bits: 32,
  collection_check_interval_pairs: 16,
  max_delivered_pairs: 5000,
  max_slots_per_pair: 20000,
  cascade_passes: 8,
};
export const stages = [
  ["validation", "Verify graph"],
  ["routing", "Find paths"],
  ["authentication", "Authenticate"],
  ["generation", "Establish pairs"],
  ["distillation", "Distill key"],
  ["complete", "Session ready"],
];
export const stageColor = {
  validation: "#8493a6",
  routing: "#377dff",
  authentication: "#a174e8",
  generation: "#e9a529",
  distillation: "#17aaa5",
  complete: "#29b78a",
  messaging: "#377dff",
  failed: "#e16a72",
};
export function validateQkd(q) {
  const bounds = {
    z_probability: [0, 1, true],
    qber_abort_threshold: [0, 0.5, true],
    parameter_estimation_margin: [0, 0.5, false],
    reconciliation_efficiency_forecast: [1, 10, false],
  };
  if (![128, 192, 256].includes(q.target_secret_bits))
    throw new Error("Choose AES-128, AES-192 or AES-256.");
  for (const [k, [min, max, strict]] of Object.entries(bounds)) {
    if (
      !Number.isFinite(q[k]) ||
      q[k] < min ||
      q[k] > max ||
      (strict && (q[k] === min || q[k] === max)) ||
      (k === "parameter_estimation_margin" && q[k] === max)
    )
      throw new Error(`Invalid ${k.replaceAll("_", " ")}.`);
  }
  for (const [k, min, max] of [
    ["minimum_parameter_estimation_bits", 1, 100000],
    ["security_margin_bits", 0, 100000],
    ["collection_headroom_bits", 0, 100000],
    ["collection_check_interval_pairs", 1, 50000],
    ["max_delivered_pairs", 1, 50000],
    ["max_slots_per_pair", 1, 100000],
    ["cascade_passes", 1, 64],
  ])
    if (!Number.isInteger(q[k]) || q[k] < min || q[k] > max)
      throw new Error(`Invalid ${k.replaceAll("_", " ")}.`);
  return q;
}
