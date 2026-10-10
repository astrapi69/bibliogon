/**
 * The A+ generator's book context, assembled in the browser (#890).
 *
 * `POST /aplus/{book_id}/generate` does four deterministic things before
 * it reaches a provider: it looks for missing required fields, builds
 * the context, applies the request's language override, and fingerprints
 * the result as the cache key. This mirrors all four, so the web app can
 * do that half without a backend - a prerequisite for browser-direct
 * generation rather than generation itself.
 *
 * Behaviour is pinned against output recorded from the Python side over
 * real book rows (`context.parity.test.ts`), recorded at the route's
 * boundary rather than at the functions behind it.
 *
 * One shape difference is real: the ORM stores `bisac_codes`,
 * `categories` and `keywords` as JSON text and decodes them here, while
 * the frontend's `Book` already has them as arrays. `buildBookContext`
 * therefore accepts either, so a row that came through the API and a row
 * read straight out of IndexedDB both work.
 *
 * @example
 * const context = buildBookContext(book);
 * const hash = await computeSourceHash(context, ruleset.version);
 */

import { htmlToPlainText } from "../utils/content/htmlToPlainText";

/** Children's-book marker phrases, per language (mirrors
 *  `_JUVENILE_TEXT_MARKERS`). Scanned across ALL languages, not just
 *  the book's own: a German "Kinderbuch" mention in an otherwise
 *  undetected book is worth catching either way. */
export const JUVENILE_TEXT_MARKERS: Record<string, readonly string[]> = {
    de: [
        "kinderbuch",
        "bilderbuch",
        "für kinder",
        "fuer kinder",
        "zum vorlesen",
    ],
    en: [
        "children's book",
        "childrens book",
        "picture book",
        "for kids",
        "for children",
    ],
    fr: [
        "livre pour enfants",
        "livres pour enfants",
        "album jeunesse",
        "livre jeunesse",
        "pour enfants",
        "album illustré",
    ],
    es: [
        "libro infantil",
        "libros infantiles",
        "cuentos infantiles",
        "cuento infantil",
        "álbum ilustrado",
        "album ilustrado",
        "libro ilustrado",
        "para niños",
        "para ninos",
    ],
};

const JUVENILE_BISAC_PREFIX = "JUV";
const JUVENILE_GENRE_KEY = "kinderbuch";
const PICTURE_BOOK_TYPE = "picture_book";

/** Description columns, in the order `buildBookContext` prefers them. */
const DESCRIPTION_FIELDS = ["description", "html_description", "backpage_description"] as const;

/** A Book row, as either storage layer presents it. */
export interface BookContextSource {
    id: string;
    title: string;
    subtitle?: string | null;
    author?: string | null;
    language?: string | null;
    description?: string | null;
    html_description?: string | null;
    backpage_description?: string | null;
    genre?: string | null;
    book_type?: string | null;
    bisac_codes?: string[] | string | null;
    categories?: string[] | string | null;
    keywords?: string[] | string | null;
}

/** Everything the generator needs from a book, normalised. */
export interface BookContext {
    book_id: string;
    title: string;
    subtitle: string | null;
    author: string | null;
    language: string;
    description_text: string;
    genre_key: string | null;
    bisac_codes: string[];
    categories: string[];
    keywords: string[];
}

/** One required-for-generation field that is empty. */
export interface MissingFieldFinding {
    field: string;
    reason: string;
}

function looksLikeHtml(text: string): boolean {
    return text.includes("<") && text.includes(">");
}

/** Plain text from a possibly-HTML column, or `""`. */
function toPlainText(raw: string | null | undefined): string {
    if (!raw) return "";
    if (looksLikeHtml(raw)) return htmlToPlainText(raw);
    return raw.trim();
}

function firstNonEmpty(...values: (string | null | undefined)[]): string {
    for (const value of values) {
        const plain = toPlainText(value);
        if (plain) return plain;
    }
    return "";
}

/**
 * A list column as an array.
 *
 * Already-decoded arrays pass through; a JSON string is parsed; anything
 * else - malformed JSON, a JSON object, an empty string - yields `[]`,
 * the same way `_decode_json_list` swallows a decode error.
 */
function decodeList(raw: string[] | string | null | undefined): string[] {
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    try {
        const decoded: unknown = JSON.parse(raw);
        return Array.isArray(decoded) ? (decoded as string[]) : [];
    } catch {
        return [];
    }
}

function looksLikeJuvenileText(...texts: (string | null | undefined)[]): boolean {
    const combined = texts.filter(Boolean).join(" ").toLowerCase();
    if (!combined) return false;
    return Object.values(JUVENILE_TEXT_MARKERS).some((markers) =>
        markers.some((marker) => combined.includes(marker)),
    );
}

/**
 * The genre/style key, down the same fallback chain the backend uses:
 * explicit `genre`, then `book_type === "picture_book"`, then a
 * JUV-prefixed BISAC code, then a children's-book phrase in the text.
 *
 * Only the first tier is reliable; the rest exist because `genre` was
 * empty on the whole catalogue and BISAC on none of it. The text tier
 * reads ALL description columns, not just the one the prompt gets - a
 * book whose only marker sits in `backpage_description` while
 * `html_description` wins the resolution was how that was found.
 */
function resolveGenreKey(
    book: BookContextSource,
    bisacCodes: string[],
): string | null {
    const genre = book.genre;
    if (genre && genre.trim()) return genre.trim().toLowerCase();
    if (book.book_type === PICTURE_BOOK_TYPE) return JUVENILE_GENRE_KEY;
    if (
        bisacCodes.some((code) =>
            code.toUpperCase().startsWith(JUVENILE_BISAC_PREFIX),
        )
    ) {
        return JUVENILE_GENRE_KEY;
    }
    if (
        looksLikeJuvenileText(
            book.title,
            book.subtitle,
            ...DESCRIPTION_FIELDS.map((field) => toPlainText(book[field])),
        )
    ) {
        return JUVENILE_GENRE_KEY;
    }
    return null;
}

/**
 * Assemble the context from a book row.
 *
 * The description is the first non-empty of `description`,
 * `html_description`, `backpage_description`, HTML-stripped when the
 * value looks like markup. A missing or empty language becomes `"en"`.
 */
export function buildBookContext(book: BookContextSource): BookContext {
    const bisacCodes = decodeList(book.bisac_codes);
    return {
        book_id: book.id,
        title: book.title,
        subtitle: book.subtitle ?? null,
        author: book.author ?? null,
        language: book.language || "en",
        description_text: firstNonEmpty(
            ...DESCRIPTION_FIELDS.map((field) => book[field]),
        ),
        genre_key: resolveGenreKey(book, bisacCodes),
        bisac_codes: bisacCodes,
        categories: decodeList(book.categories),
        keywords: decodeList(book.keywords),
    };
}

/**
 * The required-for-generation fields that are empty.
 *
 * An empty list means generation can proceed. A non-empty one is the
 * caller's cue to prompt for exactly these fields instead of spending a
 * provider call on a book that cannot produce a package.
 */
export function findMissingFields(
    book: BookContextSource,
): MissingFieldFinding[] {
    const missing: MissingFieldFinding[] = [];

    const author = book.author;
    if (!author || !author.trim()) {
        missing.push({
            field: "author",
            reason: "An author name is required to generate A+ Content.",
        });
    }

    const hasDescription = DESCRIPTION_FIELDS.some((field) =>
        toPlainText(book[field]),
    );
    if (!hasDescription) {
        missing.push({
            field: "description",
            reason:
                "At least one description field (Description, Amazon Description, " +
                "or Backpage Description) is required as source material.",
        });
    }

    return missing;
}

/** The field separator the fingerprint joins on (Python `\x1f`). */
const HASH_SEPARATOR = "\u001f";

/**
 * Fingerprint of everything that feeds the prompt, plus the ruleset
 * version - the cache key. A change to either invalidates the cache.
 *
 * Byte-identical to the backend's: the same fields in the same order,
 * joined with the same separator, SHA-256 as lowercase hex. Async
 * because `crypto.subtle` is.
 */
export async function computeSourceHash(
    context: BookContext,
    rulesetVersion: string,
): Promise<string> {
    const parts = [
        context.title,
        context.subtitle || "",
        context.author || "",
        context.language,
        context.description_text,
        context.genre_key || "",
        context.bisac_codes.join(","),
        context.categories.join(","),
        context.keywords.join(","),
        rulesetVersion,
    ];
    const bytes = new TextEncoder().encode(parts.join(HASH_SEPARATOR));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
