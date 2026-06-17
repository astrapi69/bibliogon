/**
 * Trigger a browser download for an in-memory {@link Blob}.
 *
 * Wraps the standard `URL.createObjectURL → <a download> click →
 * revokeObjectURL` dance in one place so callers do not re-implement
 * (and forget to revoke) it. Fully generic: no application imports, no
 * network, no framework — usable in any browser app.
 *
 * Library-First note (#388): this is the native Stage-1 download path
 * (the same `createObjectURL` + `<a download>` `file-saver` itself does
 * in its modern build). `file-saver`'s extra value is legacy fallbacks
 * — IE `msSaveBlob`, old-Safari `FileReader` — for browsers this app
 * does not support (the stack requires Chrome 111+/Safari 16.2+ for
 * `color-mix`/`dvh`); files >2GB need StreamSaver, not `file-saver`. So
 * the dependency would add zero applicable edge-case coverage. KEEP.
 *
 * @param blob - The binary payload to download.
 * @param filename - The name suggested to the browser's save dialog.
 *   Falls back to `"download"` when empty/blank.
 *
 * @example
 * ```ts
 * const { blob, filename } = await api.articles.bulkExport(ids, "epub", "zip");
 * downloadBlob(blob, filename);
 * ```
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.trim() || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
