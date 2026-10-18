export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export async function apiRequest(
  connection,
  path,
  { method = "GET", body, signal, timeout = 15000 } = {},
) {
  const base = connection.url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base))
    throw new Error("Enter an http:// or https:// API address.");
  const timer = AbortSignal.timeout(timeout);
  const combined = signal ? AbortSignal.any([signal, timer]) : timer;
  const response = await fetch(`${base}/gui${path}`, {
    method,
    signal: combined,
    headers: {
      "Content-Type": "application/json",
      "X-NARAD-API-Key": connection.key,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      "The server did not return JSON. Install the GUI bridge in the running notebook.",
      response.status,
    );
  }
  if (!response.ok)
    throw new ApiError(
      typeof result.detail === "string"
        ? result.detail
        : JSON.stringify(result.detail ?? result),
      response.status,
    );
  return result;
}
export const toBase64 = (bytes) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
export const fromBase64 = (value) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
