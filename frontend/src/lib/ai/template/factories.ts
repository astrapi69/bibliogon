/**
 * Build a `.biblio.yaml` template from a record, or empty (#745).
 *
 * Mirrors `build_empty_*_template` and `build_*_template_from_record` in
 * `backend/app/ai/template_factories.py`. The split the backend draws is
 * kept: an EMPTY template carries `language` at the root and no
 * `reference` block (the file alone has to tell the assistant what
 * language to answer in); a PER-RECORD template carries the reference
 * block - id, language, body word count and a 500-word preview - and no
 * root `language`.
 *
 * These take plain record shapes rather than the storage seam, so the
 * module stays testable against the recorded endpoint response and has
 * no app imports. The caller reads the record through the seam and hands
 * it over.
 *
 * @example
 * const template = buildBookTemplateFromRecord(book, chapterContents);
 * downloadBlob(serializeTemplate(template), filenameFor(template));
 */

import { extractBodyPreview, extractBookBodyPreview } from "./bodyPreview";
import { ARTICLE_FIELD_SPECS, BOOK_FIELD_SPECS } from "./fieldSpecs";
import { SCHEMA_VERSION } from "./headers";
import { FIELD_ORDER, type BiblioTemplate, type TemplateKind } from "./models";

/** The article columns a template reads, named as the API returns them. */
export interface ArticleTemplateSource {
    id: string;
    language: string;
    title?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
    excerpt?: string | null;
    tags?: string[] | null;
    topic?: string | null;
    featured_image_prompt?: string | null;
    inline_image_prompts?: unknown[] | null;
    content_json?: string | null;
}

/** The book columns a template reads. */
export interface BookTemplateSource {
    id: string;
    language: string;
    title?: string | null;
    subtitle?: string | null;
    description?: string | null;
    genre?: string | null;
    keywords?: string[] | null;
    html_description?: string | null;
    backpage_description?: string | null;
    backpage_author_bio?: string | null;
    cover_image_prompt?: string | null;
    chapter_summaries?: unknown[] | null;
}

/** An empty string column reads as "unset", matching the backend's
 *  `value or None` - a template must not offer `""` as a current value,
 *  because the assistant is told to leave what it cannot fill as null. */
function orNull(value: string | null | undefined): string | null {
    return value ? value : null;
}

function orEmptyList(value: unknown[] | null | undefined): unknown[] {
    return Array.isArray(value) ? value : [];
}

function fieldsFrom(
    kind: TemplateKind,
    values: Record<string, unknown>,
): Record<string, unknown> {
    const specs = kind === "book" ? BOOK_FIELD_SPECS : ARTICLE_FIELD_SPECS;
    const fields: Record<string, unknown> = {};
    // Driven by FIELD_ORDER rather than by the spec object's own key
    // order, so the file's field order has exactly one source.
    for (const name of FIELD_ORDER[kind]) {
        const spec = specs[name];
        fields[name] = {
            description: spec.description,
            example: spec.example,
            current_value: values[name] ?? null,
        };
    }
    return fields;
}

/** An empty template for the new-idea workflow. */
export function buildEmptyTemplate(kind: TemplateKind, language = "en"): BiblioTemplate {
    const emptyListFields = kind === "book" ? ["keywords", "chapter_summaries"]
                                            : ["tags", "inline_image_prompts"];
    const values: Record<string, unknown> = {};
    for (const name of emptyListFields) values[name] = [];
    return {
        type: kind,
        schema_version: SCHEMA_VERSION,
        language,
        ...fieldsFrom(kind, values),
    } as BiblioTemplate;
}

/** A template carrying one article's live values. */
export function buildArticleTemplateFromRecord(
    article: ArticleTemplateSource,
    wordLimit?: number,
): BiblioTemplate {
    const [preview, wordCount] = extractBodyPreview(article.content_json, wordLimit);
    return {
        type: "article",
        schema_version: SCHEMA_VERSION,
        reference: {
            id: article.id,
            language: article.language,
            body_word_count: wordCount,
            body_preview: preview,
        },
        ...fieldsFrom("article", {
            title: orNull(article.title),
            seo_title: orNull(article.seo_title),
            seo_description: orNull(article.seo_description),
            excerpt: orNull(article.excerpt),
            tags: orEmptyList(article.tags),
            topic: orNull(article.topic),
            featured_image_prompt: orNull(article.featured_image_prompt),
            inline_image_prompts: orEmptyList(article.inline_image_prompts),
        }),
    } as BiblioTemplate;
}

/**
 * A template carrying one book's live values.
 *
 * `chapterContents` is each chapter's stored content in book order; the
 * preview is their joined text, so the word count is the book's.
 */
export function buildBookTemplateFromRecord(
    book: BookTemplateSource,
    chapterContents: (string | null | undefined)[] = [],
    wordLimit?: number,
): BiblioTemplate {
    const [preview, wordCount] = extractBookBodyPreview(chapterContents, wordLimit);
    return {
        type: "book",
        schema_version: SCHEMA_VERSION,
        reference: {
            id: book.id,
            language: book.language,
            body_word_count: wordCount,
            body_preview: preview,
        },
        ...fieldsFrom("book", {
            title: orNull(book.title),
            subtitle: orNull(book.subtitle),
            description: orNull(book.description),
            genre: orNull(book.genre),
            keywords: orEmptyList(book.keywords),
            html_description: orNull(book.html_description),
            backpage_description: orNull(book.backpage_description),
            backpage_author_bio: orNull(book.backpage_author_bio),
            cover_image_prompt: orNull(book.cover_image_prompt),
            chapter_summaries: orEmptyList(book.chapter_summaries),
        }),
    } as BiblioTemplate;
}
