import { test } from "node:test";
import assert from "node:assert/strict";
import {
  progressView,
  createNonceState,
  nextSessionNonce,
} from "./progress.js";
test("forecast and pair-budget bars use independent native telemetry values", () => {
  const v = progressView({
    forecast_extractable_bits: 71,
    target_secret_bits: 128,
    delivered_pairs: 320,
    max_delivered_pairs: 1200,
  });
  assert.equal(v.forecast, 71 / 128);
  assert.equal(v.budget, 320 / 1200);
  assert.equal(v.established, false);
});
test("forecast at 100 percent is not reported as an established key", () => {
  const v = progressView({
    forecast_secret_fraction: 1,
    stage: "QKD_COLLECTION",
  });
  assert.equal(v.forecast, 1);
  assert.equal(v.established, false);
  assert.match(v.label, /awaiting actual distillation/);
  assert.equal(progressView(null).forecast, null);
});
test("both directions reuse one AES key with different nonces and authenticate correctly", async () => {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt", "decrypt"],
  );
  const state = createNonceState(new Uint8Array([1, 2, 3, 4]));
  const nonces = [];
  for (const text of ["Alice to Bob", "Bob to Alice"]) {
    const nonce = nextSessionNonce(state);
    nonces.push(nonce);
    const blob = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(text),
    );
    assert.equal(
      new TextDecoder().decode(
        await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, blob),
      ),
      text,
    );
  }
  assert.notDeepEqual(nonces[0], nonces[1]);
  assert.equal(key.extractable, false);
});
test("nonce exhaustion forces a new session rather than nonce reuse", () => {
  const state = createNonceState();
  state.counter = 2n ** 64n;
  assert.throws(() => nextSessionNonce(state));
});
