/**
 * The `metadata.json` document that ships inside a KDP package (#741).
 *
 * A mirror of three Python functions that compose into one document:
 * `generate_kdp_metadata` + `_map_language_to_kdp` (cover_validator.py),
 * and `_package_provenance` + `_isbn_for_format` + `_format_label`
 * (package.py). The merge order matters and matches: the listing fields
 * first, then the per-build provenance, which is allowed to overwrite.
 *
 * Library-grade: takes a plain book-shaped object and returns a plain
 * document. The caller supplies `appVersion` and `generatedAt` rather than
 * reading them here, so the result is deterministic and testable.
 *
 * @example
 * kdpPackageMetadata(book, {
 *     formatKind: "paperback",
 *     trimSize: "6x9",
 *     appVersion: "0.60.0",
 *     generatedAt: new Date("2026-10-10T00:00:00Z"),
 * });
 */

export interface KdpMetadataBook {
    id?: string;
    title?: string | null;
    subtitle?: string | null;
    author?: string | null;
    description?: string | null;
    language?: string | null;
    series?: string | null;
    series_index?: number | null;
    categories?: string[] | null;
    keywords?: string[] | null;
    isbn_ebook?: string | null;
    isbn_paperback?: string | null;
    isbn_hardcover?: string | null;
}

export interface KdpMetadataOptions {
    /** The wizard's FormatStep selection. */
    formatKind: string;
    /** The KDP trim id; only written for the print formats. */
    trimSize?: string | null;
    /** Manuscript page count when known. The Python side passes None. */
    pageCount?: number | null;
    appVersion: string;
    generatedAt: Date;
}

/** KDP allows seven keywords. The eighth onwards is dropped, not an error. */
export const KDP_MAX_KEYWORDS = 7;

/** The product labels KDP uses, as the Python `_FORMAT_LABELS` spells them. */
const FORMAT_LABELS: Record<string, string> = {
    ebook: "eBook",
    paperback: "Taschenbuch",
    hardcover: "Hardcover",
};

/** Language codes to the names KDP's listing form expects. */
const KDP_LANGUAGE_NAMES: Record<string, string> = {
    de: "German",
    en: "English",
    es: "Spanish",
    fr: "French",
    it: "Italian",
    pt: "Portuguese",
    nl: "Dutch",
    ja: "Japanese",
    zh: "Chinese",
    ko: "Korean",
    el: "Greek",
};

/** An unknown kind passes through unchanged, so a format the wizard adds
 *  before this table cannot crash a package build. */
export function kdpFormatLabel(formatKind: string): string {
    return FORMAT_LABELS[formatKind] ?? formatKind;
}

/** An unmapped code passes through, which is what the Python does: a
 *  code KDP happens to accept is better than an empty field. */
export function kdpLanguageName(language: string | null | undefined): string {
    const code = language || "de";
    return KDP_LANGUAGE_NAMES[code] ?? code;
}

/** True for the two formats that produce a print interior. */
export function isPrintFormat(formatKind: string): boolean {
    return formatKind === "paperback" || formatKind === "hardcover";
}

/**
 * The ISBN that matches the format being packaged. Hardcover falls back to
 * the paperback ISBN, which is the Python behaviour and the common case -
 * one ISBN bought for print, used for both bindings.
 */
export function isbnForFormat(
    book: KdpMetadataBook,
    formatKind: string,
): string | null {
    if (formatKind === "ebook") return book.isbn_ebook || null;
    if (formatKind === "hardcover") {
        return book.isbn_hardcover || book.isbn_paperback || null;
    }
    return book.isbn_paperback || null;
}

export interface KdpPackageMetadata {
    title: string;
    subtitle: string;
    author: string;
    description: string;
    language: string;
    categories: string[];
    keywords: string[];
    series: string | null;
    series_number: number | null;
    isbn: string | null;
    format: string;
    trim_size: string | null;
    page_count: number | null;
    generated_by: string;
    generated_at: string;
}

export function kdpPackageMetadata(
    book: KdpMetadataBook,
    options: KdpMetadataOptions,
): KdpPackageMetadata {
    const {formatKind, trimSize, pageCount, appVersion, generatedAt} = options;
    return {
        title: book.title || "",
        subtitle: book.subtitle || "",
        author: book.author || "",
        description: book.description || "",
        language: kdpLanguageName(book.language),
        categories: book.categories ?? [],
        keywords: (book.keywords ?? []).slice(0, KDP_MAX_KEYWORDS),
        series: book.series ?? null,
        series_number: book.series_index ?? null,
        isbn: isbnForFormat(book, formatKind),
        format: kdpFormatLabel(formatKind),
        // Only the print formats carry a trim. An eBook reflows, so a trim
        // in its metadata would be a claim about a page size it does not
        // have.
        trim_size: isPrintFormat(formatKind) ? (trimSize ?? null) : null,
        page_count: pageCount ?? null,
        generated_by: `Bibliogon v${appVersion}`,
        generated_at: generatedAt.toISOString(),
    };
}
