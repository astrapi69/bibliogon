/**
 * Storage factory + public exports (mobile-sync Phase 2, P2-C1).
 *
 * Components import `getStorage()` and use the returned
 * `IStorageService`. The factory resolves the backend ONCE and caches
 * it for the page lifetime:
 *
 *   1. persisted `localStorage["bibliogon.storage_mode"]` (a future
 *      Settings toggle writes it), then
 *   2. build-time `VITE_STORAGE_MODE`, then
 *   3. default `"api"`.
 *
 * Only ApiStorage exists in P2-C1. A resolved `"dexie"` is honoured at
 * the mode layer (so the toggle + mode plumbing can ship and be tested
 * now) but the factory still serves ApiStorage until DexieStorage lands
 * in a later P2 commit. Migrating call-sites from `api.*` to
 * `getStorage().*` happens per-domain in follow-up commits; this commit
 * only introduces the seam.
 *
 * Pattern adapted from adaptive-learner `frontend/src/storage/index.ts`.
 */

import { apiStorage } from "./api-storage";
import type { IStorageService, StorageMode } from "./types";

export type { IStorageService, StorageMode } from "./types";

const STORAGE_MODE_KEY = "bibliogon.storage_mode";

function isStorageMode(value: unknown): value is StorageMode {
  return value === "api" || value === "dexie";
}

/** The user's persisted mode preference, or null if none/unavailable. */
export function readPersistedStorageMode(): StorageMode | null {
  try {
    const raw = localStorage.getItem(STORAGE_MODE_KEY);
    return isStorageMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Persist a mode preference (a future Settings toggle calls this).
 *  A reload is required to pick up the new backend; live-swap is not in
 *  scope for P2-C1. */
export function setPersistedStorageMode(mode: StorageMode): void {
  try {
    localStorage.setItem(STORAGE_MODE_KEY, mode);
  } catch {
    /* localStorage unavailable (private mode, locked iframe) — no-op */
  }
}

function readBuildTimeMode(): StorageMode | null {
  const raw = import.meta.env.VITE_STORAGE_MODE as string | undefined;
  return isStorageMode(raw) ? raw : null;
}

/** Resolve the mode that should be used now (does not build anything). */
export function resolveStorageMode(): StorageMode {
  return readPersistedStorageMode() ?? readBuildTimeMode() ?? "api";
}

let cached: IStorageService | null = null;

/** The active storage service. Cached for the page lifetime. */
export function getStorage(): IStorageService {
  if (cached) return cached;
  if (resolveStorageMode() === "dexie") {
    console.warn(
      "[storage] 'dexie' mode requested but DexieStorage is not " +
        "implemented yet (mobile-sync P2); using ApiStorage.",
    );
  }
  cached = apiStorage;
  return cached;
}

/** Test-only: drop the cached instance so the next getStorage() re-resolves. */
export function __resetStorageForTests(): void {
  cached = null;
}
