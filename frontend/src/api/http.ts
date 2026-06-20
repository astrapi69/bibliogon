import { ApiError } from "./errors";

/**
 * Shared HTTP transport core for the typed API client.
 *
 * Extracted from `client.ts` (Batch 2 god-file burn-down). Holds the single
 * network egress (`guardedFetch`), the JSON `request()` helper, the API base
 * path, and small response helpers. Entity API modules import the value
 * helpers from here; `client.ts` re-exports `guardedFetch` for the existing
 * `import { guardedFetch } from "../api/client"` call sites.
 */

/** Base path for every backend route. */
export const BASE = "/api";

/**
 * Backendless offline build / explicit Dexie pin. True on the GitHub-Pages
 * app (built with VITE_STORAGE_MODE=dexie) and whenever a session explicitly
 * pins Dexie via the `bibliogon.storage_mode` localStorage override (used by
 * the offline E2E). Read inline here - importing the storage module would
 * create a client<->storage cycle that degrades the `typeof api.*` types.
 *
 * NOT the LAN auto-offline case (connectivity-driven): there the seam still
 * serves data from Dexie, direct api.* calls degrade gracefully (caught), and
 * the sync engine replays on reconnect. Those surfaces are UI-gated
 * via the feature registry (useFeature). This guard's job is the no-backend build.
 */
export function isBackendlessOffline(): boolean {
  try {
    if (localStorage.getItem("bibliogon.storage_mode") === "dexie") return true;
  } catch {
    /* localStorage unavailable */
  }
  return import.meta.env.VITE_STORAGE_MODE === "dexie";
}

/**
 * The single network egress for the whole client. Every `api.*` method - the
 * JSON `request()` helper AND the raw upload/blob/export calls - goes through
 * here, so the offline catch-all is enforced in ONE place: on the backendless
 * build there is no server, so a doomed /api request never fires. Callers
 * already `.catch` + degrade, their UI triggers are gated, and the storage
 * seam (DexieStorage) never reaches this path. Auto-covers any future api.*
 * call that forgets the seam.
 *
 * `init` is forwarded only when present so the single-argument call shape that
 * some callers and tests rely on is preserved exactly.
 */
export function guardedFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  if (isBackendlessOffline()) {
    const offlineError = new ApiError(
      503,
      `Offline: ${input} requires the Bibliogon backend.`,
      String(input).split("?")[0],
      init?.method || "GET",
    );
    offlineError.offline = true;
    return Promise.reject(offlineError);
  }
  return init === undefined
    ? globalThis.fetch(input)
    : globalThis.fetch(input, init);
}

/** Typed JSON request helper. Records timing/errors via the event recorder. */
export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const method = options?.method || "GET";
  const startTime = performance.now();
  const endpoint = `${BASE}${path}`.split("?")[0]; // strip query for recorder
  let res: Response;
  try {
    res = await guardedFetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (networkError) {
    // Record network-level failures (ECONNREFUSED etc.)
    try {
      const { eventRecorder } = await import("../utils/eventRecorder/eventRecorder");
      eventRecorder.add({
        type: "api_error",
        timestamp: startTime,
        method,
        endpoint,
        message: String(networkError).substring(0, 200),
      });
    } catch {
      /* recorder not available */
    }
    throw networkError;
  }
  const durationMs = Math.round(performance.now() - startTime);
  // Record every API call (success and error)
  try {
    const { eventRecorder } = await import("../utils/eventRecorder/eventRecorder");
    eventRecorder.add({
      type: "api_call",
      timestamp: startTime,
      method,
      endpoint,
      status: res.status,
      durationMs,
    });
  } catch {
    /* recorder not available */
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    // Backend may return `detail` as a string (simple errors) or as a
    // structured dict (conflict payloads with context). Normalise:
    // the string form lands in `.detail`, the dict form lands in
    // `.detailBody` with a synthetic `.detail` string pulled from
    // `.message` (or a fallback).
    const isDictDetail = err.detail && typeof err.detail === "object";
    const detailString = isDictDetail
      ? err.detail.message || err.detail.error || "Request failed"
      : err.detail || "Request failed";
    throw new ApiError(
      res.status,
      detailString,
      `${BASE}${path}`,
      method,
      err.stacktrace || "",
      isDictDetail ? (err.detail as Record<string, unknown>) : undefined,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Parse a download filename out of a `Content-Disposition` header. */
export function _filenameFromContentDisposition(
  header: string | null,
): string | null {
  if (!header) return null;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const ascii = header.match(/filename="?([^";]+)"?/i);
  return ascii ? ascii[1] : null;
}
