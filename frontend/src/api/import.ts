/**
 * Client for the core import orchestrator endpoints.
 *
 * POST /api/import/detect: multipart upload, returns preview payload.
 * POST /api/import/execute: JSON body, commits the import.
 */

import { ApiError } from "./client";

export interface DetectedAsset {
    filename: string;
    path: string;
    size_bytes: number;
    mime_type: string;
    purpose: string;
}

export interface DetectedChapter {
    title: string;
    position: number;
    word_count: number;
    content_preview: string;
}

export interface DetectedProject {
    format_name: string;
    source_identifier: string;

    // Basics
    title: string | null;
    subtitle: string | null;
    author: string | null;
    language: string | null;

    // Series / classification
    series: string | null;
    series_index: number | null;
    genre: string | null;

    // Edition / publishing
    description: string | null;
    edition: string | null;
    publisher: string | null;
    publisher_city: string | null;
    publish_date: string | null;

    // Identifiers
    isbn_ebook: string | null;
    isbn_paperback: string | null;
    isbn_hardcover: string | null;
    asin_ebook: string | null;
    asin_paperback: string | null;
    asin_hardcover: string | null;

    // Marketing / long-form
    keywords: string[] | null;
    html_description: string | null;
    backpage_description: string | null;
    backpage_author_bio: string | null;

    // Cover + styling
    cover_image: string | null;
    custom_css: string | null;

    // Structure
    chapters: DetectedChapter[];
    assets: DetectedAsset[];
    warnings: string[];
    plugin_specific_data: Record<string, unknown>;
}

/** Keys the import wizard is allowed to override on the Book. Keeps
 * the frontend in sync with BOOK_IMPORT_OVERRIDE_KEYS in
 * backend/app/import_plugins/overrides.py. */
export const BOOK_IMPORT_OVERRIDE_KEYS = [
    "title", "subtitle", "author", "language",
    "series", "series_index", "genre",
    "description", "edition", "publisher", "publisher_city", "publish_date",
    "isbn_ebook", "isbn_paperback", "isbn_hardcover",
    "asin_ebook", "asin_paperback", "asin_hardcover",
    "keywords",
    "html_description", "backpage_description", "backpage_author_bio",
    "cover_image", "custom_css",
] as const;

export type BookImportOverrideKey = (typeof BOOK_IMPORT_OVERRIDE_KEYS)[number];

/** Meta-override keys that do NOT map to Book columns. The backend
 * handler consumes them before delegating the rest to
 * ``apply_book_overrides``. Mirrors META_OVERRIDE_KEYS in
 * backend/app/import_plugins/overrides.py.
 *
 * ``primary_cover`` names a cover filename to promote onto
 * ``book.cover_image`` when the source project ships multiple
 * covers. */
export const IMPORT_META_OVERRIDE_KEYS = ["primary_cover"] as const;

export type ImportMetaOverrideKey =
    (typeof IMPORT_META_OVERRIDE_KEYS)[number];

export interface DuplicateInfo {
    found: boolean;
    existing_book_id?: string | null;
    existing_book_title?: string | null;
    imported_at?: string | null;
}

export interface DetectResponse {
    detected: DetectedProject;
    duplicate: DuplicateInfo;
    temp_ref: string;
}

export interface ExecuteResponse {
    book_id: string | null;
    status: "created" | "overwritten" | "cancelled";
}

export type DuplicateAction = "create" | "overwrite" | "cancel";

/** Per-field override payload. The key is a Book column name; the
 * value is:
 * - a concrete value (string / number / list) when the user includes
 *   the field with that value (possibly edited)
 * - ``null`` when the user deselected the field - the backend skips
 *   the setattr and leaves the column at its handler-provided or
 *   SQLAlchemy-default value.
 *
 * Mandatory fields (title, author) may not be null; the backend
 * returns 400 in that case.
 */
export type Overrides = Partial<
    Record<
        BookImportOverrideKey | ImportMetaOverrideKey,
        string | number | string[] | null
    >
>;

const BASE = "/api";

function encodeUnsupportedFormatDetail(detail: unknown): string {
    if (!detail || typeof detail !== "object") return String(detail);
    const obj = detail as Record<string, unknown>;
    const formats = Array.isArray(obj.registered_formats)
        ? (obj.registered_formats as string[]).join(", ")
        : "";
    const message = typeof obj.message === "string" ? obj.message : "Unsupported format";
    return formats ? `${message} (supported: ${formats})` : message;
}

export async function detectImport(
    input: File | File[],
    relativePaths?: string[],
): Promise<DetectResponse> {
    const form = new FormData();
    const files = Array.isArray(input) ? input : [input];
    for (const f of files) {
        form.append("files", f);
    }
    if (relativePaths && relativePaths.length === files.length) {
        for (const p of relativePaths) form.append("paths", p);
    }
    const response = await fetch(`${BASE}/import/detect`, {
        method: "POST",
        body: form,
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detail =
            response.status === 415
                ? encodeUnsupportedFormatDetail(body.detail)
                : (body.detail as string) || `Detect failed (HTTP ${response.status})`;
        throw new ApiError(
            response.status,
            detail,
            `${BASE}/import/detect`,
            "POST",
            (body.traceback as string) || "",
        );
    }
    return (await response.json()) as DetectResponse;
}

export async function detectGitImport(
    gitUrl: string,
): Promise<DetectResponse> {
    const response = await fetch(`${BASE}/import/detect/git`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ git_url: gitUrl }),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detail =
            response.status === 415
                ? encodeUnsupportedFormatDetail(body.detail)
                : (body.detail as string) ||
                  `Clone failed (HTTP ${response.status})`;
        throw new ApiError(
            response.status,
            detail,
            `${BASE}/import/detect/git`,
            "POST",
            (body.traceback as string) || "",
        );
    }
    return (await response.json()) as DetectResponse;
}

export async function executeImport(
    tempRef: string,
    overrides: Overrides,
    duplicateAction: DuplicateAction,
    existingBookId?: string | null,
): Promise<ExecuteResponse> {
    const response = await fetch(`${BASE}/import/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            temp_ref: tempRef,
            overrides,
            duplicate_action: duplicateAction,
            existing_book_id: existingBookId ?? null,
        }),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ApiError(
            response.status,
            (body.detail as string) || `Execute failed (HTTP ${response.status})`,
            `${BASE}/import/execute`,
            "POST",
            (body.traceback as string) || "",
        );
    }
    return (await response.json()) as ExecuteResponse;
}
