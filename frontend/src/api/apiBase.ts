/**
 * Leaf module for the API base path + the backendless-build pin.
 *
 * Extracted from `http.ts` (#765) so `backendReachability` can read
 * both without importing the transport - `http.ts -> backendReachability
 * -> http.ts` is a cycle the madge gate rejects. `http.ts` re-exports
 * these, so every existing `import { BASE } from "./http"` call site
 * keeps working unchanged.
 *
 * Deliberately dependency-free: importing anything here would put that
 * module back inside the cycle.
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

/** Gateway statuses a reverse proxy emits when the backend behind it is
 *  dead. Measured 2026-09-11 (#765): the Vite dev proxy answers 502
 *  `text/plain` with an empty body, nginx (docker-compose.prod) answers 502
 *  `text/html`. Only the "everything down" case (`make dev-down`) rejects
 *  the fetch outright, so without this branch the outage banner would never
 *  appear in the deployed topologies. */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** True for a proxy-level gateway failure, false for a backend-authored one.
 *  Bibliogon's own `ExternalServiceError` (Pandoc / TTS / LanguageTool) maps
 *  to HTTP 502 too - but as `application/json` carrying a `detail` the user
 *  must see. The content-type is the discriminator; the body is never read
 *  here so the caller still owns the (unconsumed) response stream.
 *
 *  Lives in this leaf module (moved from `http.ts`, #770) because the
 *  reachability probe must classify its own /api/health response the same
 *  way: a proxy answering 502 resolves the fetch, so without this the probe
 *  would read a dead backend as healthy and never raise the banner.
 */
export function isProxyGatewayFailure(response: Response): boolean {
  if (!GATEWAY_STATUSES.has(response.status)) return false;
  return !(response.headers.get("Content-Type") || "").includes("application/json");
}
