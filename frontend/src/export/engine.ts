/**
 * Export-engine preference (Maximal-Offline P4 — export-engine chooser).
 *
 * Bibliogon has two export engines: the Pandoc-backed BACKEND (LaTeX PDF, high
 * fidelity, requires the server) and the browser-side CLIENT
 * (Markdown/HTML/Text/PDF/EPUB/DOCX, no Pandoc, works offline). The
 * `behavior.export_engine` setting lets the user pick which one the export
 * page uses:
 *
 *   - "auto" (default): backend when online, client when offline.
 *   - "client": always the browser engine (even online — faster, no round-trip).
 *   - "backend": always Pandoc (online only; offline has no backend, so it
 *     falls back to the client engine).
 */

export type ExportEngine = "auto" | "client" | "backend";

export const DEFAULT_EXPORT_ENGINE: ExportEngine = "auto";

export function isExportEngine(value: unknown): value is ExportEngine {
  return value === "auto" || value === "client" || value === "backend";
}

/** Coerce an arbitrary stored value to a valid engine (default when absent
 *  or malformed). */
export function asExportEngine(value: unknown): ExportEngine {
  return isExportEngine(value) ? value : DEFAULT_EXPORT_ENGINE;
}

/**
 * Whether the browser (client) engine should be used for the given preference
 * + connectivity. Offline ALWAYS uses the client (there is no backend to call,
 * so a "backend" preference degrades to client); online uses the client only
 * when the user explicitly chose it.
 */
export function shouldUseClientEngine(
  engine: ExportEngine,
  offline: boolean,
): boolean {
  return offline || engine === "client";
}
