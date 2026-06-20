/**
 * Selective offline download (mobile-sync Phase 3, C3 + P3c assets).
 *
 * "Take a book offline": fetch the complete book graph in one request
 * (GET /api/books/{id}/full) and write it into IndexedDB, then fetch each
 * asset's bytes (the graph carries asset METADATA only) and flip the client
 * into offline-capable mode. This module is the offline-enabling path — it
 * (transitively) loads DexieStorage, so the UI imports it dynamically (on the
 * button click), keeping Dexie out of the normal desktop bundle.
 */

import { api } from "../api/client";
import { imageUrlFor } from "../utils/platform/imageUrl";
import { bookAssetFileUrl } from "./asset-url";
import { setOfflineEnabled } from "./connectivity";
import {
  hasAssetBlob,
  ingestBookGraph,
  isBookOffline,
  listOfflineBookIds,
  removeBookGraph,
  storeAssetBlob,
} from "./dexie-storage";

export { isBookOffline, listOfflineBookIds } from "./dexie-storage";

export interface DownloadProgress {
  phase: "fetching" | "storing" | "assets" | "done";
}

/** Download a book + its full graph into IndexedDB, fetch its asset bytes,
 *  and enable offline mode. `onProgress` drives a UI indicator. */
export async function downloadBookOffline(
  bookId: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  onProgress?.({ phase: "fetching" });
  const graph = await api.books.full(bookId);
  onProgress?.({ phase: "storing" });
  await ingestBookGraph(graph);
  // The /full graph carries asset metadata only (filename, id, type), not the
  // binary — fetch each file's bytes now (still online) so the service worker
  // can serve them offline. Stored under the SERVER asset id so the id-served
  // picture-book / collage URLs resolve too.
  onProgress?.({ phase: "assets" });
  await cacheGraphAssets(bookId, graph.assets ?? []);
  setOfflineEnabled(true);
  onProgress?.({ phase: "done" });
}

/** Fetch + store every asset of a freshly-downloaded book. Best-effort per
 *  asset: a single failed fetch is skipped, never aborts the download. */
async function cacheGraphAssets(
  bookId: string,
  assets: Array<Record<string, unknown>>,
): Promise<void> {
  for (const raw of assets) {
    const assetId = typeof raw.id === "string" ? raw.id : null;
    const filename = typeof raw.filename === "string" ? raw.filename : null;
    const assetType =
      typeof raw.asset_type === "string" ? raw.asset_type : "figure";
    if (!assetId || !filename) continue;
    try {
      const res = await fetch(imageUrlFor(bookId, assetId));
      if (!res.ok) continue;
      const blob = await res.blob();
      await storeAssetBlob(
        bookId,
        filename,
        blob,
        blob.type || "application/octet-stream",
        assetType,
        assetId,
      );
    } catch {
      /* best-effort: a failed asset must not abort the whole download */
    }
  }
}

/** Lazy online-view cache: when an asset of an offline-available book is
 *  displayed while still online (e.g. one uploaded after the book was taken
 *  offline), fetch + cache it so the next offline session shows it. Skips
 *  already-cached assets and never throws (best-effort). Driven by the
 *  `useAssetUrl` resolver in api mode behind an `isOfflineEnabled()` gate, so
 *  this module (and Dexie) only loads when offline capability is on. */
export async function lazyCacheAsset(
  bookId: string,
  filename: string,
): Promise<void> {
  try {
    if (!(await isBookOffline(bookId))) return;
    if (await hasAssetBlob(bookId, filename)) return;
    const res = await fetch(bookAssetFileUrl(bookId, filename));
    if (!res.ok) return;
    const blob = await res.blob();
    await storeAssetBlob(
      bookId,
      filename,
      blob,
      blob.type || "application/octet-stream",
      "figure",
    );
  } catch {
    /* best-effort */
  }
}

/** Remove a book from the offline store. Leaves offline mode enabled
 *  (other books may still be offline); the connectivity monitor keeps
 *  running until the user clears the last one — harmless when online. */
export async function removeBookOffline(bookId: string): Promise<void> {
  await removeBookGraph(bookId);
}
