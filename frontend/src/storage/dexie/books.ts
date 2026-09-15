/**
 * Books namespace for DexieStorage: CRUD, soft-delete trash lifecycle, the
 * offline article-to-book conversion (`fromArticles`), and the user-saved
 * book templates plus instantiating a book from one (#730).
 */

import type {
    Article,
    BookDetail,
    BookTemplate,
    BulkDeleteResponse,
    BulkRestoreResponse,
    Chapter,
} from "../../api/client";
import { ApiError } from "../../api/client";
import { isClientTemplateId } from "../../data/bookTemplates";
import type { IStorageService } from "../types";
import {
    buildBook,
    EMPTY_DOC,
    hardDeleteBooks,
    newId,
    nowIso,
    notFound,
    trashedBookIds,
} from "./helpers";
import { offlineDb, type OfflineArticleRow, type OfflineBookRow } from "./schema";
import { serializedUpdate } from "./serialized-update";

export const books: IStorageService["books"] = {
    list: async () => (await offlineDb.books.toArray()).filter((b) => !b.deleted_at),

    get: async (id, includeContent = false) => {
        const book = await offlineDb.books.get(id);
        if (!book) notFound("Book", id);
        // Match the API contract: the chapter LIST (titles/positions) is
        // always present; only the heavy `content` is stripped when
        // includeContent is false (BookEditor loads it per-chapter).
        const chapters = (await offlineDb.chapters.where("book_id").equals(id).toArray())
            .sort((a, b) => a.position - b.position)
            .map((c) => (includeContent ? c : { ...c, content: "" }));
        const detail: BookDetail = { ...book, chapters };
        return detail;
    },

    create: async (data) => {
        const row = buildBook(data, newId());
        await offlineDb.books.add(row);
        return row;
    },

    update: async (id, data) =>
        serializedUpdate("books", id, async () => {
            const existing = await offlineDb.books.get(id);
            if (!existing) notFound("Book", id);
            const merged: OfflineBookRow = {
                ...existing,
                ...data,
                id,
                updated_at: nowIso(),
            };
            await offlineDb.books.put(merged);
            return merged;
        }),

    delete: async (id) => {
        // Soft-delete: move to trash (deleted_at set). The child graph is
        // left intact so a restore brings the book back whole; the cascade
        // runs only on the permanent paths (hardDeleteBooks). Idempotent.
        await offlineDb.books.update(id, { deleted_at: nowIso() });
    },

    listTrash: async () => (await offlineDb.books.toArray()).filter((b) => !!b.deleted_at),

    restore: async (id) => {
        await offlineDb.books.update(id, { deleted_at: null });
        const row = await offlineDb.books.get(id);
        if (!row) notFound("Book", id);
        return row;
    },

    permanentDelete: async (id) => {
        await hardDeleteBooks([id]);
    },

    emptyTrash: async () => {
        await hardDeleteBooks(await trashedBookIds());
    },

    bulkRestore: async (ids) => {
        await Promise.all(ids.map((id) => offlineDb.books.update(id, { deleted_at: null })));
        const response: BulkRestoreResponse = {
            restored_count: ids.length,
            skipped_not_in_trash: [],
            failed: [],
        };
        return response;
    },

    bulkDelete: async (ids, permanent) => {
        if (permanent) {
            await hardDeleteBooks(ids);
        } else {
            const ts = nowIso();
            await Promise.all(ids.map((id) => offlineDb.books.update(id, { deleted_at: ts })));
        }
        const response: BulkDeleteResponse = {
            deleted_count: ids.length,
            skipped_already_trashed: [],
            failed: [],
        };
        return response;
    },

    /**
     * Offline article-to-book conversion (mirrors the backend
     * `/api/books/from-articles`). Copies each selected article's
     * `content_json` into a new book's chapters, framed by optional
     * front/back-matter chapters. Routed through the seam so the
     * ConvertToBookWizard works on the backendless build (the bug:
     * the wizard called `api.books.fromArticles` directly, which
     * `guardedFetch` rejects offline).
     */
    fromArticles: async (payload) => {
        const wrapTextDoc = (text: string | null | undefined): string =>
            text
                ? JSON.stringify({
                      type: "doc",
                      content: [
                          {
                              type: "paragraph",
                              content: [{ type: "text", text }],
                          },
                      ],
                  })
                : "";

        const all = await offlineDb.articles.toArray();
        const byId = new Map(all.map((a) => [a.id, a]));
        // Resolve selection (skip unknown / trashed), preserving the
        // caller's id order as the pre-sort baseline.
        const resolved = payload.article_ids
            .map((id) => byId.get(id))
            .filter((a): a is OfflineArticleRow => !!a && !a.deleted_at);

        // Sort (mirrors the backend `_sort_articles`).
        const strategy = payload.sort_strategy ?? "date_asc";
        const dateKey = (a: Article) => a.original_published_at || a.created_at;
        let sorted: OfflineArticleRow[];
        if (strategy === "manual") {
            const order = new Map((payload.manual_order ?? []).map((id, i) => [id, i]));
            sorted = [...resolved].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        } else if (strategy === "title_asc") {
            sorted = [...resolved].sort((a, b) =>
                a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
            );
        } else if (strategy === "title_desc") {
            sorted = [...resolved].sort((a, b) =>
                b.title.localeCompare(a.title, undefined, { sensitivity: "base" }),
            );
        } else if (strategy === "date_desc") {
            sorted = [...resolved].sort((a, b) => dateKey(b).localeCompare(dateKey(a)));
        } else {
            sorted = [...resolved].sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
        }

        const single = resolved.length === 1 ? resolved[0] : null;

        // Series auto-fill: shared series across every article, else null.
        const seriesValues = new Set(resolved.map((a) => a.series).filter((s): s is string => !!s));
        const sharedSeries =
            seriesValues.size === 1 && resolved.every((a) => !!a.series)
                ? [...seriesValues][0]
                : null;

        // Keywords: explicit first, then article tags, deduped (casefold).
        const seen = new Set<string>();
        const keywords: string[] = [];
        for (const kw of [...(payload.keywords ?? []), ...resolved.flatMap((a) => a.tags)]) {
            const text = kw.trim();
            if (!text) continue;
            const key = text.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            keywords.push(text);
        }

        const bookId = newId();
        const book = buildBook(
            {
                title: payload.title,
                author: payload.author ?? null,
                ...(payload.language ? { language: payload.language } : {}),
                ...(payload.series_index != null ? { series_index: payload.series_index } : {}),
            },
            bookId,
        );
        book.subtitle = payload.subtitle ?? (single ? single.subtitle : null);
        book.series = payload.series ?? sharedSeries;
        book.cover_image = payload.cover_image ?? (single ? single.featured_image_url : null);
        book.keywords = keywords;
        await offlineDb.books.add(book);

        const ts = nowIso();
        const chapters: Chapter[] = [];
        const pushChapter = (title: string, content: string, chapterType: string) => {
            chapters.push({
                id: newId(),
                book_id: bookId,
                title,
                content,
                position: chapters.length,
                chapter_type: chapterType,
                created_at: ts,
                updated_at: ts,
                version: 0,
            } as Chapter);
        };

        const fm = payload.front_matter;
        if (fm) {
            if (fm.include_title_page)
                pushChapter(fm.title_page_title || payload.title, "", "title_page");
            if (fm.include_dedication)
                pushChapter(
                    fm.dedication_title || "Dedication",
                    wrapTextDoc(fm.dedication_text),
                    "dedication",
                );
            if (fm.include_introduction)
                pushChapter(
                    fm.introduction_title || "Introduction",
                    wrapTextDoc(fm.introduction_text),
                    "introduction",
                );
        }

        const useArticleTitle =
            payload.chapter_settings?.use_article_title_as_chapter_title ?? true;
        sorted.forEach((article, i) => {
            pushChapter(
                useArticleTitle ? article.title : `Chapter ${i + 1}`,
                article.content_json || "",
                "chapter",
            );
        });

        const bm = payload.back_matter;
        if (bm) {
            if (bm.include_acknowledgments)
                pushChapter(
                    bm.acknowledgments_title || "Acknowledgments",
                    wrapTextDoc(bm.acknowledgments_text),
                    "acknowledgments",
                );
            if (bm.include_author_bio)
                pushChapter(
                    bm.author_bio_title || "About the Author",
                    wrapTextDoc(bm.author_bio_text),
                    "about_author",
                );
        }

        await offlineDb.chapters.bulkAdd(chapters);

        return { ...book, chapters } as BookDetail;
    },

    /**
     * Instantiate a book from a USER template (#730), mirroring
     * `POST /books/from-template`: create the book, then its chapters in
     * template `position` order.
     *
     * Client built-in templates are deliberately rejected: their titles are
     * i18n keys, and resolving them needs `t`, which the storage layer must
     * not carry. `CreateBookPage` branches on `isClientTemplateId` before it
     * reaches the seam and calls `instantiateClientBookTemplate` instead.
     */
    createFromTemplate: async (payload) => {
        if (isClientTemplateId(payload.template_id)) {
            throw new Error(
                `Built-in template ${payload.template_id} is instantiated by the ` +
                    "caller (it needs i18n), not through the storage seam",
            );
        }
        const template = await offlineDb.bookTemplates.get(payload.template_id);
        if (!template) notFound("Book template", payload.template_id);

        const book = buildBook(
            {
                title: payload.title,
                author: payload.author,
                language: payload.language,
                genre: payload.genre,
                subtitle: payload.subtitle,
                description: payload.description,
                series: payload.series,
                series_index: payload.series_index,
            },
            newId(),
        );
        await offlineDb.books.add(book);

        const ts = nowIso();
        const chapters: Chapter[] = [...template.chapters]
            .sort((a, b) => a.position - b.position)
            .map((entry, index) => ({
                id: newId(),
                book_id: book.id,
                title: entry.title,
                // A template chapter saved in "empty" mode carries no body;
                // seed the same empty doc `chapters.create` would.
                content: entry.content || EMPTY_DOC,
                position: index,
                chapter_type: entry.chapter_type,
                created_at: ts,
                updated_at: ts,
                version: 0,
            }));
        await offlineDb.chapters.bulkAdd(chapters);

        return { ...book, chapters } as BookDetail;
    },
};

/**
 * User-saved book templates for DexieStorage (#730).
 *
 * Mirrors `backend/app/routers/templates.py`: `create` forces
 * `is_builtin: false` and rejects a duplicate name with a 409, `list` orders
 * by name, and `delete` 404s on an unknown id. Built-in templates are not
 * rows here — offline they come from the client catalog in
 * `data/bookTemplates.ts`, whose entries carry i18n keys.
 */
export const templates: IStorageService["templates"] = {
    list: async () =>
        (await offlineDb.bookTemplates.toArray()).sort((a, b) => a.name.localeCompare(b.name)),

    get: async (id) => {
        const template = await offlineDb.bookTemplates.get(id);
        if (!template) notFound("Book template", id);
        return template;
    },

    create: async (data) => {
        const clash = await offlineDb.bookTemplates.where("name").equals(data.name).first();
        if (clash) {
            // The save modal branches on ApiError.status === 409 to show the
            // inline "name taken" error, so the offline path raises the same
            // shape rather than a plain Error the modal would only toast.
            throw new ApiError(409, "Template name already exists", "/templates", "POST");
        }
        const ts = nowIso();
        const template: BookTemplate = {
            id: newId(),
            name: data.name,
            description: data.description,
            genre: data.genre,
            language: data.language,
            // The endpoint forces this false on POST regardless of the body.
            is_builtin: false,
            created_at: ts,
            updated_at: ts,
            chapters: data.chapters.map((c) => ({ ...c })),
        };
        await offlineDb.bookTemplates.add(template);
        return template;
    },

    delete: async (id) => {
        const template = await offlineDb.bookTemplates.get(id);
        if (!template) notFound("Book template", id);
        await offlineDb.bookTemplates.delete(id);
    },
};
