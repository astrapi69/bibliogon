/**
 * Client-side URL import (#353).
 *
 * Fetches a single Markdown / HTML / Text document from an arbitrary URL and
 * routes it through the existing client-side {@link detectImportFormat} +
 * {@link importFile} path, so it works identically online and in the
 * backendless PWA (zero `/api`). The fetch hits the remote host directly, so
 * the target must serve permissive CORS headers — a CORS failure surfaces as a
 * {@link UrlImportError} with an actionable message.
 */

import { detectImportFormat } from "./detectFormat";
import { importFile, type ImportFileResult } from "./importRouter";
import type { ImportFileOptions } from "./importRouter";

/** Thrown for any URL-import failure (bad URL, network/CORS error, bad format). */
export class UrlImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UrlImportError";
    }
}

const HAS_EXTENSION = /\.[a-z0-9]+$/i;

/** Derive a filename (with extension) from a URL's last path segment. */
export function filenameFromUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const last = parsed.pathname.split("/").filter(Boolean).pop();
        if (last) return decodeURIComponent(last);
    } catch {
        // fall through to the default below
    }
    return "imported";
}

/**
 * Fetch a URL and wrap the body in a `File`, inferring the extension from the
 * URL or the `Content-Type` so the format detector can classify it.
 */
export async function fetchUrlAsFile(url: string): Promise<File> {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
        throw new UrlImportError("URL must start with http:// or https://");
    }

    let response: Response;
    try {
        response = await fetch(trimmed);
    } catch (err) {
        throw new UrlImportError(
            `Could not fetch the URL (network or CORS error): ${(err as Error).message}`,
        );
    }
    if (!response.ok) {
        throw new UrlImportError(`Fetch failed (HTTP ${response.status})`);
    }

    const blob = await response.blob();
    let name = filenameFromUrl(trimmed);
    if (!HAS_EXTENSION.test(name)) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("html")) name += ".html";
        else if (contentType.includes("plain")) name += ".txt";
        else name += ".md";
    }
    return new File([blob], name, { type: blob.type || "text/plain" });
}

/**
 * Fetch a URL and import it through the client-side pipeline.
 *
 * @throws {@link UrlImportError} when the URL is invalid, unreachable, or
 *   resolves to a format the offline path cannot import.
 */
export async function runUrlImport(
    url: string,
    options: ImportFileOptions = {},
): Promise<{ format: ImportFileResult["format"]; result: ImportFileResult }> {
    const file = await fetchUrlAsFile(url);
    const format = await detectImportFormat(file);
    if (format === "unknown") {
        throw new UrlImportError(
            "The content at this URL is not a supported import format (Markdown, HTML, Text, JSON backup).",
        );
    }
    const result = await importFile(file, format, options);
    return { format: result.format, result };
}
