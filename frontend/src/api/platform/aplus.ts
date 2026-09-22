import type { AplusDocumentDraft } from "../../lib/utils/aplus/aplusDocument";
import { ApiError } from "../errors";
import { request } from "../http";

/**
 * A+ Content plugin client (#887, backend #825).
 *
 * Mirrors `bibliogon_aplus.routes`: `POST /aplus/{book_id}/generate` returns
 * either a generated (or cached) package or, when the book lacks a required
 * field, a missing-fields answer without any AI call; `GET /aplus/{book_id}`
 * returns the last generated package and 404s when there is none.
 * Desktop-only: generation and validation run in the backend, so the caller
 * gates the surface through `FEATURES.APLUS_CONTENT`.
 *
 * @example
 * const result = await aplus.generate(bookId, { language: "de" });
 * if (isAplusMissingFields(result)) showMissing(result.missing_fields);
 */

/** One deterministic-validator finding, attached to the field it concerns. */
export interface AplusFinding {
    field: string;
    severity: "error" | "warning";
    message: string;
}

/** One image slot; `rendered` is the copy-and-paste prompt derived per response. */
export interface AplusImage {
    prompt: string;
    aspect_ratio: string;
    size: string;
    style_flags: string[];
    rendered?: string;
}

export interface AplusBullet {
    heading: string;
    body: string;
}

export interface AplusModule {
    title: string;
    text: string;
    image: AplusImage;
    alt_text: string;
}

export interface AplusMeta {
    book_id: string;
    language: string;
    model: string;
    ruleset_version: string;
    generated_at: string;
}

/** The full generated A+ Content package. */
export interface AplusPackage {
    short_description: string;
    bullets: AplusBullet[];
    module_header: AplusModule;
    module_three_images: AplusModule[];
    validation: AplusFinding[];
    meta: AplusMeta;
}

export interface AplusMissingField {
    field: string;
    reason: string;
}

/** Returned by generate instead of a package when a required field is empty. */
export interface AplusMissingFields {
    book_id: string;
    missing_fields: AplusMissingField[];
}

/** The author's editable A+ document as stored for one book and language (#891). */
export interface AplusDocumentRecord extends AplusDocumentDraft {
    book_id: string;
    language: string;
    updated_at: string;
}

export interface AplusGenerateOptions {
    language?: string;
    force?: boolean;
}

/** Languages the backend ruleset supports (`bibliogon_aplus.rules.SUPPORTED_LANGUAGES`). */
export const APLUS_LANGUAGES = ["de", "en", "fr", "es"] as const;

/** True when a generate answer lists missing fields instead of a package. */
export function isAplusMissingFields(
    value: AplusPackage | AplusMissingFields,
): value is AplusMissingFields {
    return Array.isArray((value as AplusMissingFields).missing_fields);
}

function documentPath(bookId: string, language: string): string {
    return `/aplus/${bookId}/document?language=${encodeURIComponent(language)}`;
}

function generateQuery(options: AplusGenerateOptions): string {
    const params = new URLSearchParams();
    if (options.language) params.set("language", options.language);
    if (options.force) params.set("force", "true");
    const query = params.toString();
    return query ? `?${query}` : "";
}

export const aplus = {
    /** Generate the package, or return the cached one unless `force` is set. */
    generate: (
        bookId: string,
        options: AplusGenerateOptions = {},
    ): Promise<AplusPackage | AplusMissingFields> =>
        request<AplusPackage | AplusMissingFields>(
            `/aplus/${bookId}/generate${generateQuery(options)}`,
            { method: "POST" },
        ),

    /** The last generated package for the language, or null when there is none. */
    get: async (bookId: string, language: string): Promise<AplusPackage | null> => {
        try {
            return await request<AplusPackage>(
                `/aplus/${bookId}?language=${encodeURIComponent(language)}`,
            );
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
        }
    },

    /** The editable document for the language, or null when none exists yet. */
    getDocument: async (bookId: string, language: string): Promise<AplusDocumentRecord | null> => {
        try {
            return await request<AplusDocumentRecord>(documentPath(bookId, language));
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
        }
    },

    /** Create or replace the editable document for the language. */
    saveDocument: (
        bookId: string,
        language: string,
        document: AplusDocumentDraft,
    ): Promise<AplusDocumentRecord> =>
        request<AplusDocumentRecord>(documentPath(bookId, language), {
            method: "PUT",
            body: JSON.stringify(document),
        }),

    deleteDocument: (bookId: string, language: string): Promise<void> =>
        request<void>(documentPath(bookId, language), { method: "DELETE" }),

    /** Every language's document of the book (full-data backup). */
    listDocuments: (bookId: string): Promise<AplusDocumentRecord[]> =>
        request<AplusDocumentRecord[]>(`/aplus/${bookId}/documents`),
};
