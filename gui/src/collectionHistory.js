const isCount = (value) => Number.isSafeInteger(value) && value >= 0;

// Keep observed samples only. Reset when a route fallback restarts collection;
// never join counters from separate routes or invent missing XX/ZZ measurements.
export function appendCollectionSample(history, progress, now = Date.now()) {
  const { delivered_pairs: pairs, zz_bits: zz, xx_bits: xx } = progress || {};
  if (![pairs, zz, xx].every(isCount) || zz + xx > pairs) return history;
  const last = history.at(-1);
  if (last && last.pairs === pairs && last.zz === zz && last.xx === xx)
    return history;
  const nativeTime = progress.timestamp_unix;
  const timestamp =
    typeof nativeTime === "number" && Number.isFinite(nativeTime)
      ? nativeTime * 1000
      : now;
  const reset = last && (pairs < last.pairs || zz < last.zz || xx < last.xx);
  const point = {
    pairs,
    zz,
    xx,
    timestamp: !reset && last ? Math.max(last.timestamp, timestamp) : timestamp,
  };
  const next = [...(reset ? [] : history), point];
  // Retain the beginning and end of the run without unbounded browser memory.
  return next.length > 600
    ? next.filter((_, index) => index % 2 === 0 || index === next.length - 1)
    : next;
}

export function countAxis(maximum) {
  if (maximum <= 700) return { max: 700, ticks: [0, 175, 350, 525, 700] };
  const raw = maximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(
    1,
    [1, 2, 5, 10].find((value) => value * magnitude >= raw) * magnitude,
  );
  return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((value) => value * step) };
}
