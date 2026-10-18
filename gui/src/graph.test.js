import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultGraph,
  validateGraph,
  discoverRoutes,
  edgeId,
  defaultQkd,
  validateQkd,
} from "./graph.js";
test("default graph validates and role-safe paths reach selected users", () => {
  const g = defaultGraph();
  validateGraph(g);
  const r = discoverRoutes(g, "Alice", "Bob");
  assert(r.length > 0);
  for (const p of r) {
    assert.equal(p.nodes[0], "Alice");
    assert.equal(p.nodes.at(-1), "Bob");
    assert(!p.nodes.slice(1, -1).includes("Charlie"));
  }
});
test("disabled edges cannot carry a route", () => {
  const g = defaultGraph();
  g.links.forEach((l) => (l.active = false));
  assert.equal(discoverRoutes(g, "Alice", "Bob").length, 0);
});
test("duplicates, missing endpoints and invalid resource profiles reject imports", () => {
  for (const edit of [
    (g) => g.nodes.push({ ...g.nodes[0] }),
    (g) => (g.links[0].target = "Missing"),
    (g) => (g.nodes[3].memory_slots = 1),
    (g) =>
      g.links.push({
        ...g.links[0],
        source: g.links[0].target,
        target: g.links[0].source,
      }),
  ]) {
    const g = defaultGraph();
    edit(g);
    assert.throws(() => validateGraph(g));
  }
});
test("edge identity is independent of fibre direction", () =>
  assert.equal(edgeId("A", "B"), edgeId("B", "A")));

test("QKD inputs reject invalid entropy, probability and collection budgets", () => {
  validateQkd(defaultQkd);
  for (const change of [
    { target_secret_bits: 64 },
    { z_probability: 1 },
    { qber_abort_threshold: 0 },
    { parameter_estimation_margin: 0.5 },
    { collection_check_interval_pairs: 0 },
    { max_delivered_pairs: 1.5 },
    { security_margin_bits: -1 },
  ])
    assert.throws(() => validateQkd({ ...defaultQkd, ...change }));
});
