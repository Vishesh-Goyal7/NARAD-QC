export function fraction(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : null;
}
export function progressView(progress, established = false) {
  const p = progress || {};
  const forecast = fraction(
    p.forecast_secret_fraction ??
      (typeof p.forecast_extractable_bits === "number" &&
      p.target_secret_bits > 0
        ? p.forecast_extractable_bits / p.target_secret_bits
        : null),
  );
  const budget = fraction(
    p.pair_budget_fraction ??
      (typeof p.delivered_pairs === "number" && p.max_delivered_pairs > 0
        ? p.delivered_pairs / p.max_delivered_pairs
        : null),
  );
  return {
    forecast,
    budget,
    established,
    label: established
      ? "Shared key established"
      : ["COMPLETE", "SESSION_ESTABLISHED"].includes(p.stage)
        ? "Key distilled · finalizing session"
        : p.stage === "QKD_POSTPROCESS"
          ? "Reconciling and amplifying"
          : forecast === 1
            ? "Forecast target reached · awaiting actual distillation"
            : "Collecting QKD measurements",
  };
}
export function createNonceState(
  prefix = crypto.getRandomValues(new Uint8Array(4)),
) {
  return { prefix: new Uint8Array(prefix), counter: 0n };
}
export function nextSessionNonce(state) {
  if (!state || state.prefix.length !== 4 || state.counter >= 2n ** 64n)
    throw new Error("Establish a new session before sending more messages.");
  const nonce = new Uint8Array(12);
  nonce.set(state.prefix);
  new DataView(nonce.buffer).setBigUint64(4, state.counter++, false);
  return nonce;
}
