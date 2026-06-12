/**
 * Client-side import-format detection (offline import, #76).
 *
 * Sniffs a user-selected file into one of the {@link ImportFormat} buckets so
 * the offline import router can dispatch without a backend round-trip. The
 * detector is extension-first, with a content probe where the extension is
 * ambiguous (`.zip` may be a Medium export or a write-book-template archive;
 * `.json` may be a full-data backup bundle or unrelated JSON).
 */

import { unzipSync } from "fflate";

/**
 * The set of formats the offline import path recognises. Everything that is
 * not a supported client-side format resolves to `unknown`; `bgb` is detected
 * but routed to the desktop-only path (the ZIP project archive needs the
 * backend orchestrator).
 */
export type ImportFormat =
    | "json-backup"
    | "medium-zip"
    | "markdown"
    | "text"
    | "html"
    | "bgb"
    | "unknown";

/** Medium puts each post at `posts/<name>.html` inside the export ZIP. */
const POSTS_HTML = /(^|\/)posts\/[^/]+\.html?$/i;

/** First two bytes of every ZIP/`.bgb` archive ("PK"). */
const ZIP_MAGIC = [0x50, 0x4b];

function extensionOf(filename: string): string {
    const idx = filename.lastIndexOf(".");
    return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

async function startsWithZipMagic(file: File): Promise<boolean> {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    return head[0] === ZIP_MAGIC[0] && head[1] === ZIP_MAGIC[1];
}

/**
 * Decide whether a `.zip` is a Medium export by looking for at least one
 * `posts/*.html` entry. A write-book-template archive (no `posts/`) returns
 * false so the caller resolves it to `unknown` (backend-only offline).
 */
async function zipIsMedium(file: File): Promise<boolean> {
    try {
        const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
        return Object.keys(entries).some((path) => POSTS_HTML.test(path));
    } catch {
        return false;
    }
}

/**
 * Decide whether `.json` content is a full-data backup bundle by probing for
 * the `{ version, data }` envelope `importFullBackup` expects, without
 * committing to a specific version (the importer validates the exact version).
 */
async function jsonIsBackupBundle(file: File): Promise<boolean> {
    try {
        const parsed = JSON.parse(await file.text()) as {
            version?: unknown;
            data?: unknown;
        } | null;
        return (
            typeof parsed === "object" &&
            parsed !== null &&
            parsed.version !== undefined &&
            typeof parsed.data === "object" &&
            parsed.data !== null
        );
    } catch {
        return false;
    }
}

/**
 * Detect the import format of a user-selected file for the offline router.
 *
 * @param file - the file the user dropped or picked.
 * @returns the detected {@link ImportFormat}; `unknown` for anything the
 *   offline path cannot handle.
 */
export async function detectImportFormat(file: File): Promise<ImportFormat> {
    const ext = extensionOf(file.name);

    if (ext === ".bgb") return "bgb";
    if (ext === ".md" || ext === ".markdown") return "markdown";
    if (ext === ".txt") return "text";
    if (ext === ".html" || ext === ".htm") return "html";

    if (ext === ".json") {
        return (await jsonIsBackupBundle(file)) ? "json-backup" : "unknown";
    }

    if (ext === ".zip") {
        if (!(await startsWithZipMagic(file))) return "unknown";
        return (await zipIsMedium(file)) ? "medium-zip" : "unknown";
    }

    return "unknown";
}

/** Formats that import fully in the browser (no backend, no desktop app). */
export const OFFLINE_SUPPORTED_FORMATS: readonly ImportFormat[] = [
    "json-backup",
    "medium-zip",
    "markdown",
    "text",
    "html",
];
