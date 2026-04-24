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
    title: string | null;
    author: string | null;
    language: string | null;
    chapters: DetectedChapter[];
    assets: DetectedAsset[];
    warnings: string[];
    plugin_specific_data: Record<string, unknown>;
}

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

export type Overrides = Record<string, unknown>;

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
