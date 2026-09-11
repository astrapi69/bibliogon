/**
 * Trigger a browser download for a SERVER-rendered URL.
 *
 * Sibling of {@link downloadBlob}: that one hands the browser bytes
 * the app already holds, this one hands it a URL and lets the browser
 * stream straight to disk - so a ~1 GB `.bgb` full backup never has to
 * fit in a Blob, and the native download manager shows the progress.
 *
 * Uses a hidden same-tab `<a download>` rather than
 * `window.open(url, "_blank")`. A new tab for an attachment response
 * sits on `about:blank` until the server sends its first byte, which
 * for a large archive is tens of seconds of apparent nothing (#771).
 *
 * Fully generic: no application imports, no network, no framework.
 *
 * @param url - The download URL. The server's `Content-Disposition`
 *   still decides the final filename.
 * @param filename - Optional filename hint for the save dialog; omit
 *   to let the server's header decide.
 *
 * @example
 * ```ts
 * downloadFromUrl(api.backup.exportUrl(), "bibliogon-backup.bgb");
 * ```
 */
export function downloadFromUrl(url: string, filename?: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename ?? "");
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
