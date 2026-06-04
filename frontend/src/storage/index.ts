/**
 * Storage factory + public exports (mobile-sync Phase 2/3).
 *
 * Components import `getStorage()` and use the returned
 * `IStorageService`. The factory resolves the EFFECTIVE backend on every
 * call (cheap — it just picks between two module singletons):
 *
 *   1. An explicit mode wins: persisted
 *      `localStorage["bibliogon.storage_mode"]` then build-time
 *      `VITE_STORAGE_MODE` (used by tests / forced builds).
 *   2. Otherwise AUTO: when offline capability is enabled (a book was
 *      taken offline, C3) AND the backend is currently unreachable, use
 *      DexieStorage; in every other case use ApiStorage.
 *
 * Desktop safety: with offline capability OFF (the default, and the
 * normal `make dev` flow) auto always resolves to `"api"`, the
 * connectivity monitor never starts, and DexieStorage is NEVER imported
 * — it is pulled in via a dynamic `import()` only when offline
 * capability is enabled, so it stays out of the desktop bundle/path.
 */

import { apiStorage } from "./api-storage";
import { connectivity, isOfflineEnabled } from "./connectivity";
import type { IStorageService, StorageMode } from "./types";

export type { IStorageService, StorageMode } from "./types";
export {
  connectivity,
  isOfflineEnabled,
  setOfflineEnabled,
} from "./connectivity";

const STORAGE_MODE_KEY = "bibliogon.storage_mode";

function isStorageMode(value: unknown): value is StorageMode {
  return value === "api" || value === "dexie";
}

/** An explicitly-chosen mode (persisted or build-time), or null. */
export function readPersistedStorageMode(): StorageMode | null {
  try {
    const raw = localStorage.getItem(STORAGE_MODE_KEY);
    return isStorageMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function setPersistedStorageMode(mode: StorageMode): void {
  try {
    localStorage.setItem(STORAGE_MODE_KEY, mode);
  } catch {
    /* localStorage unavailable — no-op */
  }
}

function readBuildTimeMode(): StorageMode | null {
  const raw = import.meta.env.VITE_STORAGE_MODE as string | undefined;
  return isStorageMode(raw) ? raw : null;
}

/** An explicit override if one is set, else null (→ auto). */
export function explicitStorageMode(): StorageMode | null {
  return readPersistedStorageMode() ?? readBuildTimeMode();
}

/** The mode that should be active right now (explicit override, else
 *  auto from offline-capability + connectivity). */
export function resolveStorageMode(): StorageMode {
  const explicit = explicitStorageMode();
  if (explicit) return explicit;
  if (isOfflineEnabled() && !connectivity.isOnline()) return "dexie";
  return "api";
}

// --- lazy DexieStorage (kept out of the desktop bundle) ------------------

let dexieRef: IStorageService | null = null;
let dexieLoad: Promise<IStorageService> | null = null;

/** Load DexieStorage on demand. Called by the offline-enabling path so
 *  the instance is ready before the client actually goes offline. */
export async function ensureDexieStorageLoaded(): Promise<IStorageService> {
  if (dexieRef) return dexieRef;
  if (!dexieLoad) {
    // Wrap DexieStorage in the queueing layer so offline writes are
    // recorded for replay (C5). Both modules are dynamically imported,
    // keeping Dexie + the queue out of the desktop bundle.
    dexieLoad = Promise.all([
      import("./dexie-storage"),
      import("./sync-queue"),
    ]).then(([dx, sq]) => {
      dexieRef = sq.makeQueueingStorage(dx.dexieStorage);
      return dexieRef;
    });
  }
  return dexieLoad;
}

/** The active storage service for the current effective mode. */
export function getStorage(): IStorageService {
  if (resolveStorageMode() === "dexie") {
    if (dexieRef) return dexieRef;
    // Offline but DexieStorage not loaded yet — kick off the load and
    // serve ApiStorage this once (callers retry; the enabling path
    // normally preloads it well before we ever go offline).
    void ensureDexieStorageLoaded();
    console.warn(
      "[storage] offline but DexieStorage not loaded yet; using ApiStorage for this call.",
    );
  }
  return apiStorage;
}

/** Test-only: drop the lazily-loaded DexieStorage reference. */
export function __resetStorageForTests(): void {
  dexieRef = null;
  dexieLoad = null;
}
