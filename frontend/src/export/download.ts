/**
 * Browser download helpers for the client-side export engine
 * (Maximal-Offline P2).
 *
 * Triggers a file download from an in-memory Blob via an object URL + a
 * programmatic anchor click — the standard backend-free download path.
 */

/** Build a filesystem-safe slug from a document title (fallback "export"). */
export function slugifyFilename(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "export";
}

/** Download an in-memory Blob as `filename` (no backend round-trip). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Download a string payload as a text-ish file with the given MIME type. */
export function downloadText(
  content: string,
  filename: string,
  mime: string,
): void {
  downloadBlob(new Blob([content], { type: `${mime};charset=utf-8` }), filename);
}
