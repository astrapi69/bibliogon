/**
 * Selective offline download (mobile-sync Phase 3, C3).
 *
 * "Take a book offline": fetch the complete book graph in one request
 * (GET /api/books/{id}/full) and write it into IndexedDB, then flip the
 * client into offline-capable mode. This module is the offline-enabling
 * path — it (transitively) loads DexieStorage, so the UI imports it
 * dynamically (on the button click), keeping Dexie out of the normal
 * desktop bundle.
 */

import { api } from "../api/client";
import { setOfflineEnabled } from "./connectivity";
import {
  ingestBookGraph,
  isBookOffline,
  listOfflineBookIds,
  removeBookGraph,
} from "./dexie-storage";

export { isBookOffline, listOfflineBookIds } from "./dexie-storage";

export interface DownloadProgress {
  phase: "fetching" | "storing" | "done";
}

/** Download a book + its full graph into IndexedDB and enable offline
 *  mode. `onProgress` drives a UI indicator. */
export async function downloadBookOffline(
  bookId: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  onProgress?.({ phase: "fetching" });
  const graph = await api.books.full(bookId);
  onProgress?.({ phase: "storing" });
  await ingestBookGraph(graph);
  setOfflineEnabled(true);
  onProgress?.({ phase: "done" });
}

/** Remove a book from the offline store. Leaves offline mode enabled
 *  (other books may still be offline); the connectivity monitor keeps
 *  running until the user clears the last one — harmless when online. */
export async function removeBookOffline(bookId: string): Promise<void> {
  await removeBookGraph(bookId);
}
