/**
 * Apply a filled `.biblio.yaml` back onto a record (#745).
 *
 * Mirrors `_apply_template_to_article` / `_apply_template_to_book` in
 * `backend/app/routers/{article,book}_ai_template.py`, including the
 * chapter-summaries reconcile that runs before the write. The
 * per-field primitives it builds on live in `applyField.ts`: they
 * already existed for the offline AI-fill path and moved here rather
 * than being copied, because a module under `lib/` may not import app
 * code and two copies of the same write rules is the worse of the two
 * problems.
 *
 * What comes out is a patch plus the two lists the endpoint returns, so
 * the caller writes through the storage seam and reports the same thing
 * a server-side import would:
 *
 * ```
 * {updated: ["title"], skipped: {excerpt: "value-is-empty"}, patch: {...}}
 * ```
 *
 * Force semantics are the backend's: an empty incoming value always
 * skips; a populated column skips unless `force`; otherwise it is
 * written.
 *
 * @example
 * const result = applyTemplate(template, article);
 * if (result.updated.length) await storage.articles.update(id, result.patch);
 */

import {
    APPLY_SKIP_EMPTY,
    APPLY_SKIP_POPULATED,
    APPLY_UPDATED,
    applyField,
    type EntityRecord,
} from "./applyField";
import { FIELD_ORDER, type BiblioTemplate, type TemplateKind } from "./models";

/**
 * Which template field writes which column, and whether it is a list.
 *
 * Mirrors `ARTICLE_TEMPLATE_FIELD_MAP` / `BOOK_TEMPLATE_FIELD_MAP`. Every
 * name happens to be identical on both sides, but the map stays explicit
 * because the backend's is - a renamed column should break here loudly
 * rather than write nothing quietly.
 */
export const TEMPLATE_FIELD_MAP: Record<
    TemplateKind,
    { field: string; column: string; isList: boolean }[]
> = {
    article: [
        { field: "title", column: "title", isList: false },
        { field: "seo_title", column: "seo_title", isList: false },
        { field: "seo_description", column: "seo_description", isList: false },
        { field: "excerpt", column: "excerpt", isList: false },
        { field: "tags", column: "tags", isList: true },
        { field: "topic", column: "topic", isList: false },
        { field: "featured_image_prompt", column: "featured_image_prompt", isList: false },
        { field: "inline_image_prompts", column: "inline_image_prompts", isList: true },
    ],
    book: [
        { field: "title", column: "title", isList: false },
        { field: "subtitle", column: "subtitle", isList: false },
        { field: "description", column: "description", isList: false },
        { field: "genre", column: "genre", isList: false },
        { field: "keywords", column: "keywords", isList: true },
        { field: "html_description", column: "html_description", isList: false },
        { field: "backpage_description", column: "backpage_description", isList: false },
        { field: "backpage_author_bio", column: "backpage_author_bio", isList: false },
        { field: "cover_image_prompt", column: "cover_image_prompt", isList: false },
        // `chapter_summaries` is deliberately absent: it needs the
        // reconcile below and is applied separately, exactly as the
        // backend's map omits it.
    ],
};

/** One chapter the reconcile can match against. */
export interface ChapterRef {
    id: string;
    title: string;
}

/** A reconciled summary, carrying the matched chapter's canonical id. */
export interface ReconciledSummary {
    chapter_id: string;
    title: string;
    summary: string;
}

/** A summary that matched nothing, with the reason it was dropped. */
export interface DroppedSummary {
    reason: "not-a-mapping" | "summary-empty" | "no-matching-chapter";
    chapter_id?: string | null;
    title?: string | null;
    entry?: unknown;
}

/** The extra skip reason the book side can report, mirroring the
 *  endpoint: every entry was dropped, so nothing was left to write. */
export const APPLY_SKIP_ALL_DROPPED = "all-entries-dropped";

/** Whitespace-collapsed, lowercased title for the lenient fallback
 *  match - the leniency is intentional, so "The  first survey " finds
 *  "The First Survey". */
function normalizeTitle(title: string): string {
    return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Match incoming chapter-summary entries to the book's chapters.
 *
 * By `chapter_id` first, then by normalized title. Unmatched entries are
 * returned separately rather than written, so a summary can never name a
 * chapter that does not exist.
 */
export function reconcileChapterSummaries(
    chapters: ChapterRef[],
    incoming: unknown,
): { reconciled: ReconciledSummary[]; dropped: DroppedSummary[] } {
    const reconciled: ReconciledSummary[] = [];
    const dropped: DroppedSummary[] = [];
    if (!Array.isArray(incoming)) return { reconciled, dropped };

    const byId = new Map(chapters.map((c) => [c.id, c]));
    const byTitle = new Map(chapters.map((c) => [normalizeTitle(c.title), c]));

    for (const raw of incoming) {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
            dropped.push({ reason: "not-a-mapping", entry: raw });
            continue;
        }
        const entry = raw as Record<string, unknown>;
        const summary = entry.summary;
        if (summary === null || summary === undefined || !String(summary).trim()) {
            dropped.push({ reason: "summary-empty", entry: raw });
            continue;
        }
        const chapterId = entry.chapter_id;
        let matched = typeof chapterId === "string" ? byId.get(chapterId) : undefined;
        if (!matched && entry.title) {
            matched = byTitle.get(normalizeTitle(String(entry.title)));
        }
        if (!matched) {
            dropped.push({
                reason: "no-matching-chapter",
                chapter_id: typeof chapterId === "string" ? chapterId : null,
                title: entry.title === undefined ? null : String(entry.title),
            });
            continue;
        }
        reconciled.push({
            chapter_id: matched.id,
            title: matched.title,
            summary: String(summary).trim(),
        });
    }
    return { reconciled, dropped };
}

export interface ApplyTemplateResult {
    updated: string[];
    skipped: Record<string, string>;
    /** The fields to write; empty when nothing was updated. */
    patch: Record<string, unknown>;
    /** Book templates only: the summaries that matched no chapter. */
    droppedChapterSummaries: DroppedSummary[];
}

/** The incoming value of one template field, or null when absent. */
function currentValue(template: BiblioTemplate, field: string): unknown {
    const entry = template[field];
    if (typeof entry !== "object" || entry === null) return null;
    return (entry as Record<string, unknown>).current_value ?? null;
}

/**
 * Apply a template onto a record, returning the patch and the report.
 *
 * `record` is read, never written: `applyField` mutates a copy, so a
 * caller that decides not to persist leaves the record it was handed
 * untouched.
 *
 * @param chapters The book's chapters, for the summaries reconcile.
 * Ignored for an article template.
 */
export function applyTemplate(
    template: BiblioTemplate,
    record: EntityRecord,
    options: { force?: boolean; chapters?: ChapterRef[] } = {},
): ApplyTemplateResult {
    const force = options.force ?? false;
    const kind: TemplateKind = template.type;
    const draft: EntityRecord = { ...record };
    const updated: string[] = [];
    const skipped: Record<string, string> = {};

    for (const { field, column, isList } of TEMPLATE_FIELD_MAP[kind]) {
        const result = applyField(draft, column, currentValue(template, field), {
            force,
            isList,
        });
        if (result === APPLY_UPDATED) updated.push(field);
        else skipped[field] = result;
    }

    let droppedChapterSummaries: DroppedSummary[] = [];
    if (kind === "book") {
        const { reconciled, dropped } = reconcileChapterSummaries(
            options.chapters ?? [],
            currentValue(template, "chapter_summaries"),
        );
        droppedChapterSummaries = dropped;
        const result = applyField(draft, "chapter_summaries", reconciled, {
            force,
            isList: true,
        });
        if (result === APPLY_UPDATED) {
            updated.push("chapter_summaries");
        } else if (result === APPLY_SKIP_EMPTY && dropped.length > 0) {
            // "the caller sent nothing" and "everything the caller sent
            // matched no chapter" are different answers to the user, and
            // the endpoint distinguishes them.
            skipped.chapter_summaries = APPLY_SKIP_ALL_DROPPED;
        } else {
            skipped.chapter_summaries =
                result === APPLY_SKIP_POPULATED ? APPLY_SKIP_POPULATED : APPLY_SKIP_EMPTY;
        }
    }

    const patch: Record<string, unknown> = {};
    for (const field of updated) {
        const column =
            TEMPLATE_FIELD_MAP[kind].find((entry) => entry.field === field)?.column ?? field;
        patch[column] = draft[column];
    }

    return { updated, skipped, patch, droppedChapterSummaries };
}

/** Every field name a template of this kind carries, in file order. */
export function templateFieldNames(kind: TemplateKind): readonly string[] {
    return FIELD_ORDER[kind];
}
