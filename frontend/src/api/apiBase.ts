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
