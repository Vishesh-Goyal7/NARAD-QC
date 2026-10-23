import test from "node:test";
import assert from "node:assert/strict";
import { appendCollectionSample, countAxis } from "./collectionHistory.js";
const sample = (pairs, zz, xx, timestamp_unix = 1) => ({
  delivered_pairs: pairs,
  zz_bits: zz,
  xx_bits: xx,
  timestamp_unix,
});
test("history uses observed counts, skips absent/invalid data and duplicate polling", () => {
  let h = appendCollectionSample([], sample(100, 64, 4));
  assert.deepEqual(h[0], { pairs: 100, zz: 64, xx: 4, timestamp: 1000 });
  for (const p of [
    {},
    sample(101, null, 4),
    sample(1, 2, 0),
    sample(-1, 0, 0),
    sample(1.5, 1, 0),
    sample(100, 64, 4, 2),
  ])
    assert.equal(appendCollectionSample(h, p), h);
  assert.equal(appendCollectionSample(h, sample(120, 77, 5, 2)).length, 2);
});
test("route resets do not connect unrelated cumulative series", () => {
  const h = appendCollectionSample([], sample(100, 64, 4, 2));
  const reset = appendCollectionSample(h, sample(16, 10, 1, 3));
  assert.equal(reset.length, 1);
  assert.equal(reset[0].pairs, 16);
});
test("bounded history retains first/latest samples and chronological timestamps", () => {
  let h = [];
  for (let i = 0; i < 2200; i++)
    h = appendCollectionSample(h, sample(i * 10, i * 6, i, i + 1));
  assert.ok(h.length <= 600);
  assert.equal(h[0].pairs, 0);
  assert.equal(h.at(-1).pairs, 21990);
  assert.ok(h.every((p, i) => !i || p.timestamp >= h[i - 1].timestamp));
});
test("shared count axis includes largest series without fractional count ticks", () => {
  for (const count of [0, 1, 4, 17, 128, 699, 700, 701, 5000, 50000]) {
    const axis = countAxis(count);
    assert.ok(axis.max >= count);
    if (count <= 700) assert.equal(axis.max, 700);
    else assert.ok(axis.max > 700);
    assert.ok(axis.ticks.every(Number.isInteger));
    assert.equal(axis.ticks[0], 0);
  }
});
