/**
 * Asset-URL helpers shared by the storage seam, the `useAssetUrl` resolver,
 * and the service-worker intercept (P3c).
 *
 * Bibliogon references images by FILENAME, not id: every `<img>` src and
 * every TipTap `imageFigure` node carries
 * `/api/books/{bookId}/assets/file/{filename}`. These helpers build that
 * canonical URL and extract the trailing filename from a stored
 * `Book.cover_image` path (`assets/covers/cover-x.png` -> `cover-x.png`),
 * so the api URL stays byte-identical across api / dexie modes (the dexie
 * mode swaps the bytes underneath via the resolver or the SW, never the URL).
 */

/** The canonical served URL for a book asset, by filename. */
export function bookAssetFileUrl(bookId: string, filename: string): string {
  return `/api/books/${bookId}/assets/file/${encodeURIComponent(filename)}`;
}

/** The trailing filename of a stored cover path, or null when unset. */
export function coverFilenameFromPath(
  coverImage: string | null | undefined,
): string | null {
  if (!coverImage) return null;
  return coverImage.split("/").pop() || null;
}
