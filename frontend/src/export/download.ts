/**
 * Browser download helpers for the client-side export engine
 * (Maximal-Offline P2).
 *
 * The Blob download itself is the single Library-Grade {@link downloadBlob}
 * helper under `shared/utils` (re-exported here so the export-engine call
 * sites keep importing from one place); this module adds the
 * export-specific `slugifyFilename` + `downloadText` conveniences on top.
 * The previous duplicate `downloadBlob` body was removed in favour of the
 * shared helper (#388).
 */

import { downloadBlob } from "../shared/utils/downloadBlob";

export { downloadBlob };

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

/** Download a string payload as a text-ish file with the given MIME type. */
export function downloadText(
  content: string,
  filename: string,
  mime: string,
): void {
  downloadBlob(new Blob([content], { type: `${mime};charset=utf-8` }), filename);
}
