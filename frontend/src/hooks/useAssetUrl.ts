/**
 * useAssetUrl — resolve a book asset (by filename) to a displayable `<img>`
 * src across storage modes (P3c).
 *
 * - **api mode:** returns the canonical `/api/books/{id}/assets/file/{name}`
 *   URL synchronously (zero behaviour change from the previous inline
 *   construction the call sites did).
 * - **dexie mode (offline):** reads the blob from IndexedDB and returns a
 *   `blob:` object URL, revoked on unmount / input change so there is no
 *   leak. This is what makes the React-controlled display sites (book cover,
 *   cards, comic-panel images) show offline without the service worker —
 *   the SW intercept covers only the URLs embedded inside TipTap bodies,
 *   which the hook cannot reach.
 *
 * Returns null while a dexie blob is loading or when the asset is absent, so
 * callers render their existing placeholder.
 */

import { useEffect, useState } from "react";

import { getStorage, isOfflineEnabled } from "../storage";
import { bookAssetFileUrl, coverFilenameFromPath } from "../storage/asset-url";

export function useAssetUrl(
  bookId: string | null | undefined,
  filename: string | null | undefined,
): string | null {
  const storage = getStorage();
  const mode = storage.mode;
  // api mode resolves synchronously, so there is no null-then-url flash on
  // the desktop path.
  const apiUrl =
    mode === "api" && bookId && filename
      ? bookAssetFileUrl(bookId, filename)
      : null;

  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "dexie" || !bookId || !filename) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void getStorage()
      .assets.getBlob(bookId, filename)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
        } else {
          setBlobUrl(null);
        }
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mode, bookId, filename]);

  // Lazy online-view cache: while online (api mode) with offline capability
  // on, opportunistically cache this asset's bytes so a later offline session
  // shows it (covers assets uploaded after the book was taken offline). The
  // offline-download module is imported dynamically behind the
  // isOfflineEnabled() gate, so Dexie stays out of the desktop bundle.
  useEffect(() => {
    if (mode !== "api" || !bookId || !filename || !isOfflineEnabled()) return;
    void import("../storage/offline-download")
      .then((m) => m.lazyCacheAsset(bookId, filename))
      .catch(() => {});
  }, [mode, bookId, filename]);

  return mode === "api" ? apiUrl : blobUrl;
}

/** Convenience wrapper resolving a book's stored `cover_image` path to a
 *  displayable URL (extracts the trailing filename first). */
export function useCoverUrl(
  bookId: string | null | undefined,
  coverImage: string | null | undefined,
): string | null {
  return useAssetUrl(bookId, coverFilenameFromPath(coverImage));
}
