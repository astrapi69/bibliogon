/**
 * Trigger a browser download for an in-memory {@link Blob}.
 *
 * Wraps the standard `URL.createObjectURL → <a download> click →
 * revokeObjectURL` dance in one place so callers do not re-implement
 * (and forget to revoke) it. Fully generic: no application imports, no
 * network, no framework — usable in any browser app.
 *
 * @param blob - The binary payload to download.
 * @param filename - The name suggested to the browser's save dialog.
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
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
