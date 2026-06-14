import { SEED_BOOK_TYPES } from "../seed";
import type { IStorageService } from "../types";
import {
  aggregateGlobalByDay,
  commentTextToDoc,
  countWords,
  recordWritingProgress,
  stripDeletedAt,
} from "./record-helpers";
import {
  buildArticle,
  buildPage,
  notFound,
} from "./row-builders";
import {
  CommentRow,
  EMPTY_DOC,
  GraphRow,
  REF_KEY,
  newId,
  nowIso,
  offlineDb,
} from "./schema";
import {
  ensureSeeded,
} from "./seed";
import {
  serializedUpdate,
} from "./serialized-update";
import type {
  Article,
  BulkDeleteResponse,
  Chapter,
  ChapterLabel,
  ComicBubbleOut,
  ComicPanelOut,
  Page,
  WritingSession,
} from "../../api/client";

export const store_contentNamespaces: Pick<IStorageService,
  "chapters" |
  "articles" |
  "i18n" |
  "bookTypes" |
  "writingSessions" |
  "publications" |
  "articlePlatforms" |
  "editorPluginStatus" |
  "chapterLabels" |
  "pages" |
  "comics" |
  "comments"
> = {
  chapters: {
    list: async (bookId) =>
      (await offlineDb.chapters.where("book_id").equals(bookId).toArray()).sort(
        (a, b) => a.position - b.position,
      ),

    get: async (bookId, chapterId) => {
      const chapter = await offlineDb.chapters.get(chapterId);
      if (!chapter || chapter.book_id !== bookId)
        notFound("Chapter", chapterId);
      return chapter;
    },

    create: async (bookId, data) => {
      const ts = nowIso();
      const count = await offlineDb.chapters
        .where("book_id")
        .equals(bookId)
        .count();
      const chapter: Chapter = {
        id: newId(),
        book_id: bookId,
        title: data.title,
        content: data.content ?? EMPTY_DOC,
        position: data.position ?? count,
        chapter_type: data.chapter_type ?? "chapter",
        created_at: ts,
        updated_at: ts,
        version: 0,
      };
      await offlineDb.chapters.add(chapter);
      return chapter;
    },

    update: async (bookId, chapterId, data) =>
      serializedUpdate("chapters", chapterId, async () => {
        const existing = await offlineDb.chapters.get(chapterId);
        if (!existing || existing.book_id !== bookId)
          notFound("Chapter", chapterId);
        const merged: Chapter = {
          ...existing,
          ...data,
          id: chapterId,
          book_id: bookId,
          version: existing.version + 1,
          updated_at: nowIso(),
        };
        await offlineDb.chapters.put(merged);
        // Record the day's net words-written delta (Finding 6) so the
        // offline Writing-History view has data, mirroring the backend
        // chapter-PATCH handler. Only a content change moves the counter.
        if (data.content !== undefined) {
          await recordWritingProgress(
            bookId,
            chapterId,
            countWords(merged.content) - countWords(existing.content),
          );
        }
        return merged;
      }),

    delete: async (bookId, chapterId) => {
      await offlineDb.chapters.delete(chapterId);
    },

    reorder: async (bookId, chapterIds) => {
      await offlineDb.transaction("rw", offlineDb.chapters, async () => {
        for (let i = 0; i < chapterIds.length; i++) {
          await offlineDb.chapters.update(chapterIds[i], { position: i });
        }
      });
      return (
        await offlineDb.chapters.where("book_id").equals(bookId).toArray()
      ).sort((a, b) => a.position - b.position);
    },
  },

  articles: {
    list: async (status) => {
      const all = await offlineDb.articles.toArray();
      const filtered = status ? all.filter((a) => a.status === status) : all;
      return filtered.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },

    get: async (id) => {
      const article = await offlineDb.articles.get(id);
      if (!article) notFound("Article", id);
      return article;
    },

    create: async (data) => {
      const row = buildArticle(data, newId());
      await offlineDb.articles.add(row);
      return row;
    },

    update: async (id, data) =>
      serializedUpdate("articles", id, async () => {
        const existing = await offlineDb.articles.get(id);
        if (!existing) notFound("Article", id);
        const merged: Article = {
          ...existing,
          ...data,
          id,
          updated_at: nowIso(),
        };
        await offlineDb.articles.put(merged);
        return merged;
      }),

    delete: async (id) => {
      await offlineDb.articles.delete(id);
    },
  },

  i18n: {
    get: async (lang: string) => {
      await ensureSeeded();
      const row = await offlineDb.i18nCatalogs.get(lang);
      if (row) return row.catalog;
      const fallback = await offlineDb.i18nCatalogs.get("en");
      return fallback?.catalog ?? {};
    },
  },

  bookTypes: {
    list: async () => {
      await ensureSeeded();
      const row = await offlineDb.bookTypesRef.get(REF_KEY);
      return row?.data ?? SEED_BOOK_TYPES;
    },
  },

  writingSessions: {
    /**
     * Global day-aggregated word totals for the most recent ``days``
     * calendar days, newest first (mirrors the backend ``recent_sessions``).
     * Drives the dashboard daily-goal + streak widget offline.
     */
    list: async (days = 30) => {
      const byDay = await aggregateGlobalByDay();
      return [...byDay.entries()]
        .map(([day, words_written]) => ({ day, words_written }))
        .sort((a, b) => b.day.localeCompare(a.day))
        .slice(0, Math.max(1, days)) as WritingSession[];
    },
  },

  // Writing-history stats (Finding 6): aggregated from the writingSessions
  // Dexie table so the view works offline. exportCsvUrl stays backend-only
  // (the offline view hides the CSV button).
  publications: {
    list: async () => [],
  },

  articlePlatforms: {
    list: async () => ({}),
  },

  // AI / grammar / audiobook / ms-tools are backend plugins. Offline the
  // probe returns an empty map, so every editor plugin reads as
  // unavailable (the toolbar already degrades gracefully on that shape).
  editorPluginStatus: {
    get: async () => ({}),
  },

  chapterLabels: {
    list: async (bookId) => {
      const rows = await offlineDb.chapterLabels
        .where("book_id")
        .equals(bookId)
        .toArray();
      return (rows as unknown as ChapterLabel[]).sort(
        (a, b) => a.position - b.position,
      );
    },
    create: async (bookId, data) => {
      const position = await offlineDb.chapterLabels
        .where("book_id")
        .equals(bookId)
        .count();
      const row: ChapterLabel = {
        id: newId(),
        book_id: bookId,
        name: data.name,
        color: data.color,
        position,
      };
      await offlineDb.chapterLabels.add(row as unknown as GraphRow);
      return row;
    },
    update: async (_bookId, labelId, data) =>
      serializedUpdate("chapter_labels", labelId, async () => {
        const existing = await offlineDb.chapterLabels.get(labelId);
        if (!existing) notFound("ChapterLabel", labelId);
        const merged = { ...existing, ...data } as unknown as ChapterLabel;
        await offlineDb.chapterLabels.put(merged as unknown as GraphRow);
        return merged;
      }),
    remove: async (_bookId, labelId) => {
      await offlineDb.chapterLabels.delete(labelId);
    },
  },

  // Story Bible. Entity + link CRUD over the existing offline tables; the
  // entity-type registry is seeded; the text-analysis methods return empty
  // offline and exportBible is generated client-side.
  pages: {
    list: async (bookId) => {
      const rows = (await offlineDb.pages
        .where("book_id")
        .equals(bookId)
        .toArray()) as unknown as Page[];
      return rows.sort((a, b) => a.position - b.position);
    },
    create: async (bookId, data) => {
      const position = await offlineDb.pages
        .where("book_id")
        .equals(bookId)
        .count();
      const row = buildPage(bookId, data, newId(), position);
      await offlineDb.pages.add(row as unknown as GraphRow);
      return row;
    },
    update: async (_bookId, pageId, data) =>
      serializedUpdate("pages", pageId, async () => {
        const existing = await offlineDb.pages.get(pageId);
        if (!existing) notFound("Page", pageId);
        const merged = {
          ...existing,
          ...data,
          updated_at: nowIso(),
        } as unknown as Page;
        await offlineDb.pages.put(merged as unknown as GraphRow);
        return merged;
      }),
    delete: async (_bookId, pageId) => {
      // Cascade the page's comic panels + their bubbles.
      const panelIds = (await offlineDb.comicPanels
        .where("page_id")
        .equals(pageId)
        .primaryKeys()) as string[];
      if (panelIds.length) {
        const bubbleIds = (await offlineDb.comicBubbles
          .filter((b) => panelIds.includes((b as { panel_id?: string }).panel_id ?? ""))
          .primaryKeys()) as string[];
        if (bubbleIds.length) await offlineDb.comicBubbles.bulkDelete(bubbleIds);
        await offlineDb.comicPanels.bulkDelete(panelIds);
      }
      await offlineDb.pages.delete(pageId);
    },
    reorder: async (bookId, pageIds) => {
      await Promise.all(
        pageIds.map((id, index) =>
          offlineDb.pages.update(id, { position: index } as Partial<GraphRow>),
        ),
      );
      const rows = (await offlineDb.pages
        .where("book_id")
        .equals(bookId)
        .toArray()) as unknown as Page[];
      return rows.sort((a, b) => a.position - b.position);
    },
  },

  // Comic panels + speech bubbles over the existing comicPanels /
  // comicBubbles tables.
  comics: {
    getInfo: async () => ({
      name: "comics",
      version: "offline",
      session: 0,
      status: "offline",
      description: "offline",
    }),
    listPanels: async (_bookId, pageId) => {
      const rows = (await offlineDb.comicPanels
        .where("page_id")
        .equals(pageId)
        .toArray()) as unknown as ComicPanelOut[];
      return rows.sort((a, b) => a.position - b.position);
    },
    createPanel: async (_bookId, pageId, data) => {
      const position = await offlineDb.comicPanels
        .where("page_id")
        .equals(pageId)
        .count();
      const ts = nowIso();
      const row: ComicPanelOut = {
        id: newId(),
        page_id: pageId,
        position,
        image_asset_id: data.image_asset_id ?? null,
        bounds: data.bounds,
        panel_config: data.panel_config ?? null,
        created_at: ts,
        updated_at: ts,
      };
      await offlineDb.comicPanels.add(row as unknown as GraphRow);
      return row;
    },
    updatePanel: async (_bookId, panelId, data) =>
      serializedUpdate("comic_panels", panelId, async () => {
        const existing = await offlineDb.comicPanels.get(panelId);
        if (!existing) notFound("ComicPanel", panelId);
        const merged = {
          ...existing,
          ...data,
          updated_at: nowIso(),
        } as unknown as ComicPanelOut;
        await offlineDb.comicPanels.put(merged as unknown as GraphRow);
        return merged;
      }),
    deletePanel: async (_bookId, panelId) => {
      const bubbleIds = (await offlineDb.comicBubbles
        .where("panel_id")
        .equals(panelId)
        .primaryKeys()) as string[];
      if (bubbleIds.length) await offlineDb.comicBubbles.bulkDelete(bubbleIds);
      await offlineDb.comicPanels.delete(panelId);
    },
    reorderPanels: async (_bookId, pageId, panelIds) => {
      await Promise.all(
        panelIds.map((id, index) =>
          offlineDb.comicPanels.update(id, {
            position: index,
          } as Partial<GraphRow>),
        ),
      );
      const rows = (await offlineDb.comicPanels
        .where("page_id")
        .equals(pageId)
        .toArray()) as unknown as ComicPanelOut[];
      return rows.sort((a, b) => a.position - b.position);
    },
    listBubbles: async (_bookId, panelId) => {
      const rows = (await offlineDb.comicBubbles
        .where("panel_id")
        .equals(panelId)
        .toArray()) as unknown as ComicBubbleOut[];
      return rows.sort((a, b) => a.position - b.position);
    },
    createBubble: async (_bookId, panelId, data) => {
      const position = await offlineDb.comicBubbles
        .where("panel_id")
        .equals(panelId)
        .count();
      const ts = nowIso();
      const row: ComicBubbleOut = {
        id: newId(),
        panel_id: panelId,
        position,
        bubble_type: data.bubble_type,
        anchor: data.anchor,
        width_pct: data.width_pct ?? 30,
        height_pct: data.height_pct ?? 20,
        tail_direction: data.tail_direction ?? "none",
        tail_position_pct: data.tail_position_pct ?? 50,
        tail_length_px: data.tail_length_px ?? 16,
        bubble_config: data.bubble_config ?? null,
        text_content: data.text_content ?? null,
        created_at: ts,
        updated_at: ts,
      };
      await offlineDb.comicBubbles.add(row as unknown as GraphRow);
      return row;
    },
    updateBubble: async (_bookId, bubbleId, data) =>
      serializedUpdate("comic_bubbles", bubbleId, async () => {
        const existing = await offlineDb.comicBubbles.get(bubbleId);
        if (!existing) notFound("ComicBubble", bubbleId);
        const merged = {
          ...existing,
          ...data,
          updated_at: nowIso(),
        } as unknown as ComicBubbleOut;
        await offlineDb.comicBubbles.put(merged as unknown as GraphRow);
        return merged;
      }),
    deleteBubble: async (_bookId, bubbleId) => {
      await offlineDb.comicBubbles.delete(bubbleId);
    },
  },

  comments: {
    list: async (params = {}) => {
      let rows = (await offlineDb.articleComments.toArray()).filter(
        (c) => !c.deleted_at,
      );
      if (params.importedFrom) {
        rows = rows.filter((c) => c.imported_from === params.importedFrom);
      }
      if (params.orphansOnly) {
        rows = rows.filter((c) => !c.responds_to_article_id);
      }
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return rows.slice(0, params.limit ?? 100).map(stripDeletedAt);
    },
    delete: async (id) => {
      // Soft-delete: move to trash (deleted_at set). Idempotent.
      await offlineDb.articleComments.update(id, { deleted_at: nowIso() });
    },
    reclassifyAsArticle: async (id) => {
      const comment = await offlineDb.articleComments.get(id);
      if (!comment) notFound("Comment", id);
      const title =
        comment.body_text.length > 200
          ? comment.body_text.slice(0, 200) + "..."
          : comment.body_text || "(untitled)";
      const article = await store_contentNamespaces.articles.create({
        title,
        author: comment.author,
        language: comment.language,
        content_type: "blogpost",
      });
      await store_contentNamespaces.articles.update(article.id, {
        content_json: comment.body_json ?? commentTextToDoc(comment.body_text),
        canonical_url: comment.canonical_url,
        status: "draft",
      });
      await offlineDb.articleComments.delete(id);
      return {
        success: true,
        article_id: article.id,
        deleted_comment_id: id,
      };
    },
    bulkDelete: async (ids, permanent) => {
      if (permanent) {
        await offlineDb.articleComments.bulkDelete(ids);
      } else {
        await Promise.all(
          ids.map((id) =>
            offlineDb.articleComments.update(id, { deleted_at: nowIso() }),
          ),
        );
      }
      const response: BulkDeleteResponse = {
        deleted_count: ids.length,
        skipped_already_trashed: [],
        failed: [],
      };
      return response;
    },
    listTrashed: async () => {
      const rows = (await offlineDb.articleComments.toArray()).filter(
        (c) => !!c.deleted_at,
      );
      rows.sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));
      return rows.map(stripDeletedAt);
    },
    restore: async (id) => {
      await offlineDb.articleComments.update(id, { deleted_at: null });
      const row = await offlineDb.articleComments.get(id);
      if (!row) notFound("Comment", id);
      return stripDeletedAt(row);
    },
    permanentDelete: async (id) => {
      await offlineDb.articleComments.delete(id);
    },
    emptyTrash: async () => {
      const ids = (await offlineDb.articleComments
        .toArray()
        .then((rows) => rows.filter((c) => !!c.deleted_at).map((c) => c.id)));
      if (ids.length) await offlineDb.articleComments.bulkDelete(ids);
    },
    bulkRestore: async (ids) => {
      await Promise.all(
        ids.map((id) =>
          offlineDb.articleComments.update(id, { deleted_at: null }),
        ),
      );
      return { restored_count: ids.length, skipped_not_in_trash: [], failed: [] };
    },
    create: async (comment) => {
      const row: CommentRow = { ...comment, deleted_at: null };
      await offlineDb.articleComments.put(row);
      return stripDeletedAt(row);
    },
  },
};
