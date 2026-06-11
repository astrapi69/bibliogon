import {type Author} from "../../api/client";

/** One author row in the export envelope. */
export interface AuthorsExportEntry {
    name: string;
    slug: string;
    is_profile_author: boolean;
}

/** Versioned envelope written by the Authors-Database export. */
export interface AuthorsExport {
    version: number;
    exported_at: string;
    authors: AuthorsExportEntry[];
}

/** Current export schema version. Bumped only on a breaking shape change. */
export const AUTHORS_EXPORT_VERSION = 1;

/**
 * Build the export envelope from the current authors list. The
 * ``is_profile_author`` flag is carried for fidelity but is never
 * honoured on import (the profile stays manually curated).
 *
 * @param authors - The authors currently in the database.
 * @param exportedAt - ISO-8601 timestamp stamped into the envelope.
 */
export function buildAuthorsExport(authors: Author[], exportedAt: string): AuthorsExport {
    return {
        version: AUTHORS_EXPORT_VERSION,
        exported_at: exportedAt,
        authors: authors.map((author) => ({
            name: author.name,
            slug: author.slug,
            is_profile_author: author.is_profile_author,
        })),
    };
}

/**
 * Download filename for an export taken on the given ISO timestamp,
 * of the form ``bibliogon-authors-YYYY-MM-DD.json``.
 *
 * @param isoTimestamp - An ISO-8601 string; only its date part is used.
 */
export function authorsExportFilename(isoTimestamp: string): string {
    return `bibliogon-authors-${isoTimestamp.slice(0, 10)}.json`;
}

/** Thrown by {@link parseAuthorsImport} when the input is not a
 *  recognised version-1 authors export. */
export class AuthorsImportError extends Error {}

/**
 * Parse and validate a raw authors-export JSON string.
 *
 * @param text - The file contents.
 * @returns The validated envelope.
 * @throws AuthorsImportError when the input is not valid JSON or not a
 *   version-1 export with an ``authors`` array.
 */
export function parseAuthorsImport(text: string): AuthorsExport {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new AuthorsImportError("not-json");
    }
    const candidate = parsed as {version?: unknown; authors?: unknown} | null;
    if (
        typeof candidate !== "object" ||
        candidate === null ||
        candidate.version !== AUTHORS_EXPORT_VERSION ||
        !Array.isArray(candidate.authors)
    ) {
        throw new AuthorsImportError("bad-shape");
    }
    return candidate as AuthorsExport;
}

/** The set of new author names to create plus the skipped-duplicate count. */
export interface AuthorsImportPlan {
    toCreate: string[];
    skipped: number;
}

/**
 * Decide which imported entries to create and which to skip as
 * duplicates. An entry is a duplicate when its (trimmed,
 * case-insensitive) name OR its exact slug already exists — either in
 * the current database or earlier in the same file. Nameless entries
 * are skipped.
 *
 * Pure function: no storage access, so it is unit-testable in isolation.
 *
 * @param entries - The parsed export entries.
 * @param existing - The authors already in the database.
 */
export function planAuthorsImport(
    entries: Pick<AuthorsExportEntry, "name" | "slug">[],
    existing: Pick<Author, "name" | "slug">[],
): AuthorsImportPlan {
    const names = new Set(existing.map((author) => author.name.trim().toLowerCase()));
    const slugs = new Set(existing.map((author) => author.slug));
    const toCreate: string[] = [];
    let skipped = 0;
    for (const entry of entries) {
        const name = (entry.name ?? "").trim();
        if (!name) {
            skipped++;
            continue;
        }
        const nameKey = name.toLowerCase();
        const slug = (entry.slug ?? "").trim();
        if (names.has(nameKey) || (slug !== "" && slugs.has(slug))) {
            skipped++;
            continue;
        }
        names.add(nameKey);
        if (slug !== "") slugs.add(slug);
        toCreate.push(name);
    }
    return {toCreate, skipped};
}
