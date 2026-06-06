/**
 * Storage-quota awareness for the offline (Dexie) build (P3c).
 *
 * Image blobs live in IndexedDB, which has an origin storage budget. This is
 * a soft, informational guard: warn the user when usage approaches the quota
 * so they can clear offline books — it never blocks an upload.
 */

import { getStorage } from "../storage";
import { notify } from "./notify";

/** Whether origin storage usage is at/over `threshold` of the quota. False
 *  when the StorageManager API is unavailable or returns no figures (so it
 *  never fires spuriously). */
export async function isStorageNearlyFull(threshold = 0.8): Promise<boolean> {
  try {
    if (!navigator.storage?.estimate) return false;
    const { usage, quota } = await navigator.storage.estimate();
    if (!usage || !quota) return false;
    return usage / quota >= threshold;
  } catch {
    return false;
  }
}

/** Offline-only: show an informational toast when IndexedDB storage is nearly
 *  full. No-op online (api mode, where uploads go to the server). Call after a
 *  successful offline asset upload. */
export async function warnIfOfflineStorageNearlyFull(
  message: string,
): Promise<void> {
  if (getStorage().mode !== "dexie") return;
  if (await isStorageNearlyFull()) notify.warning(message);
}
