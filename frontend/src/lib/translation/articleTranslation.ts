/**
 * What translating an article produces, as data (#751).
 *
 * The backend's `POST /translation/translate-article` decides which fields
 * are translated, which are copied, what the new title looks like and what
 * status the result starts in. That logic is what a port has to reproduce;
 * the provider call is not, since the browser uses the user's AI key
 * instead of DeepL.
 *
 * Read off `bibliogon_translation/routes.py:404-502` by hand rather than
 * recorded, because the route needs a database session and a provider. The
 * recorded half is the pure extract/rebuild pair in `tiptapTranslate.ts`;
 * this half is pinned by its own tests. Naming the split is the point -
 * a record taken below the route cannot see what the route supplies
 * (#1042).
 *
 * Library-grade: no storage, no provider, no React.
 *
 * @example
 * const fields = translatableFields(article);          // what to send
 * const result = buildTranslatedArticle(article, map, {targetLang: "en"});
 */

import {
    extractPlainTextFromTiptap,
    rebuildTiptapWithTranslation,
} from "./tiptapTranslate";

/** The fields the backend translates, in the order it translates them. */
export const TRANSLATED_FIELDS = [
    "title",
    "subtitle",
    "excerpt",
    "seo_title",
    "seo_description",
] as const;

export type TranslatedField = (typeof TRANSLATED_FIELDS)[number];

/** `body` is not a column - it is the prose extracted from
 *  `content_json`, translated as one unit and rebuilt. */
export type TranslationKey = TranslatedField | "body";

/** What the source article needs to carry. A subset of `Article` so the
 *  module takes no dependency on the full row. */
export interface TranslationSource {
    title: string;
    subtitle?: string | null;
    author?: string | null;
    content_type?: string;
    content_json?: string | null;
    canonical_url?: string | null;
    featured_image_url?: string | null;
    excerpt?: string | null;
    tags?: string[] | null;
    topic?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
}

export interface TranslateArticleOptions {
    /** `en`, or `en-GB`. The new article's language is the part before
     *  the hyphen, lowercased, matching the backend. */
    targetLang: string;
    /** Appended to the translated title. Empty derives `(EN)` from
     *  `targetLang`, as the backend does. */
    titleSuffix?: string;
}

/** One piece of text to translate, keyed by where it goes back. */
export interface TranslationRequestItem {
    key: TranslationKey;
    text: string;
}

/** The translated text per key. A key the caller could not translate may
 *  be absent; the source value is then kept. */
export type TranslationMap = Partial<Record<TranslationKey, string>>;

/**
 * The non-empty pieces of text worth sending to a provider.
 *
 * Empty and whitespace-only fields are skipped rather than sent, because
 * a translation call costs the user money or rate limit and returns the
 * same nothing. `body` is the prose extracted from `content_json`, which
 * is what the provider should see - never the raw JSON.
 */
export function translatableFields(source: TranslationSource): TranslationRequestItem[] {
    const items: TranslationRequestItem[] = [];
    for (const field of TRANSLATED_FIELDS) {
        const value = source[field];
        if (typeof value === "string" && value.trim()) {
            items.push({ key: field, text: value });
        }
    }
    const body = extractPlainTextFromTiptap(source.content_json ?? "");
    if (body.trim()) items.push({ key: "body", text: body });
    return items;
}

/** `(EN)` from `en`, or the caller's own suffix. */
export function titleSuffixFor(options: TranslateArticleOptions): string {
    return options.titleSuffix?.trim()
        ? options.titleSuffix.trim()
        : `(${options.targetLang.toUpperCase()})`;
}

/** `en` from `en-GB`. */
export function languageCodeFor(targetLang: string): string {
    return targetLang.split("-")[0].toLowerCase();
}

/**
 * The translated body, with the backend's fallback for a lost rebuild.
 *
 * `rebuildTiptapWithTranslation` maps segments onto text nodes
 * positionally, so a translation whose line count does not match can come
 * back having changed nothing. When that happens AND the translation
 * genuinely differs from the source prose, the rebuild dropped the work on
 * the floor - so the result becomes a single paragraph holding the whole
 * translation. Block structure is forfeit, which is worse than a clean
 * rebuild and far better than showing the user their untranslated text
 * and calling it a translation.
 */
export function translatedBody(
    originalContentJson: string | null | undefined,
    sourceProse: string,
    translatedProse: string,
): string {
    const original = originalContentJson ?? "";
    if (!sourceProse.trim()) return original;
    const rebuilt = rebuildTiptapWithTranslation(original, translatedProse);
    const lostTheTranslation =
        sameDocument(rebuilt, original) &&
        translatedProse.trim() !== "" &&
        translatedProse.trim() !== sourceProse.trim();
    if (!lostTheTranslation) return rebuilt;
    return JSON.stringify({
        type: "doc",
        content: [
            { type: "paragraph", content: [{ type: "text", text: translatedProse }] },
        ],
    });
}

/**
 * Whether two serialised documents are the same document.
 *
 * Compared parsed, not as strings: the backend's guard can use byte
 * equality because both sides came out of the same `json.dumps`, while
 * here the original may have been written by the editor and the rebuild by
 * `JSON.stringify`, which differ in key order and whitespace without
 * differing in content. A string compare would report "changed" for every
 * document and never trigger the fallback.
 */
function sameDocument(a: string, b: string): boolean {
    try {
        return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));
    } catch {
        return a === b;
    }
}

/** The new article's fields, ready for create + patch. */
export interface TranslatedArticleDraft {
    title: string;
    subtitle: string | null;
    author: string | null;
    language: string;
    content_type?: string;
    content_json: string;
    status: "draft";
    canonical_url: string | null;
    featured_image_url: string | null;
    excerpt: string | null;
    tags: string[];
    topic: string | null;
    seo_title: string | null;
    seo_description: string | null;
}

/**
 * The translated article, from the source plus whatever came back.
 *
 * A field with no translation keeps the source value rather than going
 * empty - a partial failure should cost the user the translation of that
 * field, not the field. The title additionally falls back to the source
 * title before the suffix is appended, which is the backend's
 * `translated_title or source.title`.
 *
 * `status` is always `draft`: a machine translation is a draft by
 * definition, and the user promotes it after review.
 */
export function buildTranslatedArticle(
    source: TranslationSource,
    translations: TranslationMap,
    options: TranslateArticleOptions,
): TranslatedArticleDraft {
    const keep = (field: TranslatedField): string | null =>
        translations[field] ?? source[field] ?? null;
    const sourceProse = extractPlainTextFromTiptap(source.content_json ?? "");
    const translatedTitle = translations.title ?? source.title;
    return {
        title: `${translatedTitle} ${titleSuffixFor(options)}`.trim(),
        subtitle: keep("subtitle"),
        author: source.author ?? null,
        language: languageCodeFor(options.targetLang),
        content_type: source.content_type,
        content_json: translatedBody(
            source.content_json,
            sourceProse,
            translations.body ?? sourceProse,
        ),
        status: "draft",
        canonical_url: source.canonical_url ?? null,
        featured_image_url: source.featured_image_url ?? null,
        excerpt: keep("excerpt"),
        tags: source.tags ?? [],
        topic: source.topic ?? null,
        seo_title: keep("seo_title"),
        seo_description: keep("seo_description"),
    };
}
