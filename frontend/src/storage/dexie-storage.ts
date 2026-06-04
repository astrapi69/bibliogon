/**
 * DexieStorage — IStorageService backed by IndexedDB via Dexie
 * (mobile-sync Phase 3, C1).
 *
 * The offline mirror of the user-selected sync scope. Implements the
 * SAME IStorageService as ApiStorage, so `getStorage()` can return this
 * when offline and components keep calling the same methods.
 *
 * Schema design (per the Phase 3 stop-condition): the model graph is
 * stored FLAT — one table per model keyed by `id`, with FK columns
 * (`book_id`, `chapter_id`, …) as indexes. No nested objects; joins are
 * done in code (e.g. `books.get(id, includeContent)` reads the book row
 * then its chapter rows). This mirrors how SQLite holds the same graph
 * on the desktop. All 11 selectable-scope tables are declared in v1 so
 * the offline-download (C3) can populate the full graph without a Dexie
 * version bump; only books / chapters / articles have IStorageService
 * methods today (the rest gain methods as their call-sites migrate).
 *
 * Create/update write `updated_at` (ISO) on every row so the sync engine
 * (C6/C7) can compare local vs server versions. Ids are minted with
 * `crypto.randomUUID()` so an offline create has a stable key before it
 * ever reaches the server.
 *
 * Pattern adapted from adaptive-learner `frontend/src/storage/
 * dexie-storage.ts` (id-keyed rows, manual cascade on delete); the
 * schema + domains are Bibliogon's.
 */

import Dexie, { type Table } from "dexie";

import type { Article, Book, BookDetail, Chapter } from "../api/client";
import type { IStorageService } from "./types";

/** A book row carries the offline-availability flag the Selection UI
 *  (C3) sets; it is structurally a `Book` plus that optional marker. */
export type OfflineBookRow = Book & { offline_available?: boolean };

/** Minimal shape for the not-yet-method-backed graph tables: a primary
 *  `id` plus arbitrary columns. C3 populates these during download. */
type GraphRow = { id: string } & Record<string, unknown>;

class BibliogonOfflineDB extends Dexie {
  books!: Table<OfflineBookRow, string>;
  chapters!: Table<Chapter, string>;
  articles!: Table<Article, string>;
  chapterVersions!: Table<GraphRow, string>;
  pages!: Table<GraphRow, string>;
  comicPanels!: Table<GraphRow, string>;
  comicBubbles!: Table<GraphRow, string>;
  storyEntities!: Table<GraphRow, string>;
  storyEntityPageLinks!: Table<GraphRow, string>;
  chapterLabels!: Table<GraphRow, string>;
  writingSessions!: Table<GraphRow, string>;

  constructor() {
    // Separate DB from the crash-recovery drafts store ("bibliogon").
    super("bibliogon-offline");
    this.version(1).stores({
      books: "id, updated_at, offline_available, status",
      chapters: "id, book_id, position, updated_at",
      articles: "id, status, updated_at",
      chapterVersions: "id, chapter_id, created_at",
      pages: "id, book_id, position",
      comicPanels: "id, page_id",
      comicBubbles: "id, panel_id",
      storyEntities: "id, book_id",
      storyEntityPageLinks: "id, page_id, chapter_id",
      chapterLabels: "id, book_id",
      writingSessions: "id, book_id, chapter_id",
    });
  }
}

export const offlineDb = new BibliogonOfflineDB();

const nowIso = (): string => new Date().toISOString();
const newId = (): string => crypto.randomUUID();
const EMPTY_DOC = '{"type":"doc","content":[]}';

function buildBook(
  data: import("../api/client").BookCreate,
  id: string,
): OfflineBookRow {
  const ts = nowIso();
  return {
    id,
    book_type: data.book_type ?? "prose",
    status: data.status ?? "draft",
    title: data.title,
    subtitle: data.subtitle ?? null,
    author: data.author ?? null,
    language: data.language ?? "de",
    genre: data.genre ?? null,
    series: data.series ?? null,
    series_index: data.series_index ?? null,
    description: data.description ?? null,
    book_idea: null,
    expose: null,
    edition: null,
    publisher: null,
    publisher_city: null,
    publish_date: null,
    isbn_ebook: null,
    isbn_paperback: null,
    isbn_hardcover: null,
    asin_ebook: null,
    asin_paperback: null,
    asin_hardcover: null,
    keywords: [],
    categories: [],
    bisac_codes: [],
    html_description: null,
    backpage_description: null,
    backpage_author_bio: null,
    cover_image: null,
    custom_css: null,
    repository_url: null,
    ai_assisted: false,
    ai_tokens_used: 0,
    tts_engine: null,
    tts_voice: null,
    tts_language: null,
    tts_speed: null,
    audiobook_merge: null,
    audiobook_filename: null,
    audiobook_overwrite_existing: false,
    audiobook_skip_chapter_types: [],
    created_at: ts,
    updated_at: ts,
  };
}

function buildArticle(
  data: import("../api/client").ArticleCreate,
  id: string,
): Article {
  const ts = nowIso();
  return {
    id,
    title: data.title,
    subtitle: data.subtitle ?? null,
    author: data.author ?? null,
    language: data.language ?? "de",
    content_type: data.content_type ?? "blogpost",
    article_metadata: data.article_metadata,
    content_json: EMPTY_DOC,
    status: "draft",
    canonical_url: null,
    featured_image_url: null,
    excerpt: null,
    tags: [],
    topic: null,
    seo_title: null,
    seo_description: null,
    series: null,
    created_at: ts,
    updated_at: ts,
  };
}

function notFound(kind: string, id: string): never {
  throw new Error(`${kind} not available offline: ${id}`);
}

export const dexieStorage: IStorageService = {
  mode: "dexie",

  books: {
    list: async () => offlineDb.books.toArray(),

    get: async (id, includeContent = false) => {
      const book = await offlineDb.books.get(id);
      if (!book) notFound("Book", id);
      const chapters = includeContent
        ? (await offlineDb.chapters.where("book_id").equals(id).toArray()).sort(
            (a, b) => a.position - b.position,
          )
        : [];
      const detail: BookDetail = { ...book, chapters };
      return detail;
    },

    create: async (data) => {
      const row = buildBook(data, newId());
      await offlineDb.books.add(row);
      return row;
    },

    update: async (id, data) => {
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
    },

    delete: async (id) => {
      // Manual cascade — IndexedDB has no foreign keys.
      await offlineDb.transaction(
        "rw",
        [
          offlineDb.books,
          offlineDb.chapters,
          offlineDb.pages,
          offlineDb.chapterLabels,
          offlineDb.writingSessions,
          offlineDb.storyEntities,
        ],
        async () => {
          await offlineDb.books.delete(id);
          await offlineDb.chapters.where("book_id").equals(id).delete();
          await offlineDb.pages.where("book_id").equals(id).delete();
          await offlineDb.chapterLabels.where("book_id").equals(id).delete();
          await offlineDb.writingSessions.where("book_id").equals(id).delete();
          await offlineDb.storyEntities.where("book_id").equals(id).delete();
        },
      );
    },
  },

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

    update: async (bookId, chapterId, data) => {
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
      return merged;
    },

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

    update: async (id, data) => {
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
    },

    delete: async (id) => {
      await offlineDb.articles.delete(id);
    },
  },
};

// --- offline-download support (C3) ---------------------------------------

/** The full book graph as returned by GET /api/books/{id}/full. */
type BookGraph = {
  book: Book;
  chapters: Chapter[];
  pages: Array<Record<string, unknown>>;
  comic_panels: Array<Record<string, unknown>>;
  comic_bubbles: Array<Record<string, unknown>>;
  story_entities: Array<Record<string, unknown>>;
  story_entity_page_links: Array<Record<string, unknown>>;
  chapter_labels: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
};

// The graph child rows carry a string `id` at runtime; the wire type is
// the looser Record<string, unknown>, so cast once at the boundary.
const asGraphRows = (rows: Array<Record<string, unknown>>): GraphRow[] =>
  rows as unknown as GraphRow[];

/** Write a complete book graph into IndexedDB and flag the book
 *  offline-available. Idempotent (bulkPut overwrites). */
export async function ingestBookGraph(graph: BookGraph): Promise<void> {
  await offlineDb.transaction("rw", offlineDb.tables, async () => {
    await offlineDb.books.put({ ...graph.book, offline_available: true });
    await offlineDb.chapters.bulkPut(graph.chapters);
    await offlineDb.pages.bulkPut(asGraphRows(graph.pages));
    await offlineDb.comicPanels.bulkPut(asGraphRows(graph.comic_panels));
    await offlineDb.comicBubbles.bulkPut(asGraphRows(graph.comic_bubbles));
    await offlineDb.storyEntities.bulkPut(asGraphRows(graph.story_entities));
    await offlineDb.storyEntityPageLinks.bulkPut(
      asGraphRows(graph.story_entity_page_links),
    );
    await offlineDb.chapterLabels.bulkPut(asGraphRows(graph.chapter_labels));
  });
}

/** Drop a book + its whole offline graph from IndexedDB. */
export async function removeBookGraph(bookId: string): Promise<void> {
  await offlineDb.transaction("rw", offlineDb.tables, async () => {
    const pageIds = (await offlineDb.pages
      .where("book_id")
      .equals(bookId)
      .primaryKeys()) as string[];
    const panelIds =
      pageIds.length > 0
        ? ((await offlineDb.comicPanels
            .where("page_id")
            .anyOf(pageIds)
            .primaryKeys()) as string[])
        : [];
    await offlineDb.books.delete(bookId);
    await offlineDb.chapters.where("book_id").equals(bookId).delete();
    await offlineDb.pages.where("book_id").equals(bookId).delete();
    await offlineDb.storyEntities.where("book_id").equals(bookId).delete();
    await offlineDb.chapterLabels.where("book_id").equals(bookId).delete();
    if (pageIds.length > 0) {
      await offlineDb.storyEntityPageLinks
        .where("page_id")
        .anyOf(pageIds)
        .delete();
    }
    if (panelIds.length > 0) {
      await offlineDb.comicPanels.where("page_id").anyOf(pageIds).delete();
      await offlineDb.comicBubbles.where("panel_id").anyOf(panelIds).delete();
    }
  });
}

/** Ids of books currently available offline. */
export async function listOfflineBookIds(): Promise<string[]> {
  const rows = await offlineDb.books.toArray();
  return rows.filter((b) => b.offline_available).map((b) => b.id);
}

/** Whether a specific book is available offline. */
export async function isBookOffline(bookId: string): Promise<boolean> {
  const row = await offlineDb.books.get(bookId);
  return !!row?.offline_available;
}
