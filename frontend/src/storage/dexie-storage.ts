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

import type {
  Article,
  Author,
  AuthorCreate,
  AuthorUpdate,
  Book,
  BookDetail,
  BookTypeDef,
  Chapter,
  ContentTypeDef,
  DiscoveredPlugin,
  WritingSession,
} from "../api/client";
import type { IStorageService } from "./types";
import {
  SEED_BOOK_TYPES,
  SEED_CONTENT_TYPES,
  SEED_I18N,
  SEED_PLUGIN_METADATA,
  SEED_SETTINGS,
} from "./seed";

/** Single-row reference blob (settings / type registries / plugin meta),
 *  keyed by a constant. Seeded on first init from the committed JSON;
 *  settings is the one the user can mutate offline. */
interface KeyedBlob<T> {
  key: string;
  data: T;
}
/** One language's i18n catalog row. */
interface I18nCatalogRow {
  lang: string;
  catalog: Record<string, unknown>;
}

/** A book row carries the offline-availability flag the Selection UI
 *  (C3) sets; it is structurally a `Book` plus that optional marker. */
export type OfflineBookRow = Book & { offline_available?: boolean };

/** Minimal shape for the not-yet-method-backed graph tables: a primary
 *  `id` plus arbitrary columns. C3 populates these during download. */
type GraphRow = { id: string } & Record<string, unknown>;

/** A queued offline mutation awaiting replay against the API on
 *  reconnect (mobile-sync P3-C5). Created by the queueing-storage
 *  wrapper on every offline write; drained by the sync engine (C6). */
export interface SyncQueueEntry {
  /** Auto-increment FIFO key (Dexie-assigned). The replay order (C6) is
   *  ascending `seq` -- a monotonic counter, unlike `created_at` whose
   *  millisecond ties would not preserve creation order. */
  seq?: number;
  id: string;
  model: "book" | "chapter" | "article";
  operation: "create" | "update" | "delete";
  entity_id: string;
  /** Parent book id for chapter ops (needed to build the API path). */
  book_id: string | null;
  /** Replay payload (the created row / the update patch); null for delete. */
  payload: Record<string, unknown> | null;
  created_at: string;
  status: "pending" | "synced" | "failed" | "conflict";
  error: string | null;
}

/** Server-version baseline captured at download (C3) so the sync engine
 *  (C7) can tell whether the desktop moved a record while the phone was
 *  offline. Keyed by ``${model}:${entityId}``. */
export interface SyncBaseline {
  id: string;
  updated_at: string;
}

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
  syncQueue!: Table<SyncQueueEntry, number>;
  syncBaselines!: Table<SyncBaseline, string>;
  appSettings!: Table<KeyedBlob<Record<string, unknown>>, string>;
  i18nCatalogs!: Table<I18nCatalogRow, string>;
  bookTypesRef!: Table<KeyedBlob<Record<string, BookTypeDef>>, string>;
  contentTypesRef!: Table<KeyedBlob<Record<string, ContentTypeDef>>, string>;
  pluginMetaRef!: Table<KeyedBlob<DiscoveredPlugin[]>, string>;
  authors!: Table<Author, string>;

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
    // v2 (C5): the offline write queue. created_at indexes the replay
    // order; status filters pending vs synced/failed.
    this.version(2).stores({
      syncQueue: "++seq, id, status, created_at, model",
    });
    // v3 (C7): server-version baselines for conflict detection.
    this.version(3).stores({
      syncBaselines: "id",
    });
    // v4 (Track B): offline reference data. Single-row blobs keyed by a
    // constant ("app" / "all"); i18n keyed by language. Seeded lazily by
    // ensureSeeded() (idempotent, never overwrites user-edited settings).
    this.version(4).stores({
      appSettings: "key",
      i18nCatalogs: "lang",
      bookTypesRef: "key",
      contentTypesRef: "key",
      pluginMetaRef: "key",
    });
    this.version(5).stores({
      authors: "id, name, slug",
    });
  }
}

/** Record the server's current `updated_at` as the conflict baseline. */
export async function setBaseline(
  model: string,
  entityId: string,
  updatedAt: string,
): Promise<void> {
  await offlineDb.syncBaselines.put({
    id: `${model}:${entityId}`,
    updated_at: updatedAt,
  });
}

/** The baseline `updated_at` for a record, or null if none recorded. */
export async function getBaseline(
  model: string,
  entityId: string,
): Promise<string | null> {
  const row = await offlineDb.syncBaselines.get(`${model}:${entityId}`);
  return row?.updated_at ?? null;
}

export const offlineDb = new BibliogonOfflineDB();

const nowIso = (): string => new Date().toISOString();
const newId = (): string => crypto.randomUUID();
const EMPTY_DOC = '{"type":"doc","content":[]}';

// --- offline reference data (Track B) ------------------------------------

/** Constant primary key for the single-row reference blobs. */
const REF_KEY = "all";
/** Primary key for the single settings row. */
const SETTINGS_KEY = "app";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

let seedPromise: Promise<void> | null = null;

/** Populate the reference tables from the committed seed. Idempotent +
 *  non-destructive: writes only an ABSENT row, so a user-edited settings
 *  row (or a newly-added i18n language on seed regen) is never clobbered.
 *  Memoized so concurrent reads seed exactly once. */
export function ensureSeeded(): Promise<void> {
  if (!seedPromise) seedPromise = doSeed();
  return seedPromise;
}

async function doSeed(): Promise<void> {
  if (!(await offlineDb.appSettings.get(SETTINGS_KEY))) {
    await offlineDb.appSettings.put({ key: SETTINGS_KEY, data: SEED_SETTINGS });
  }
  if (!(await offlineDb.bookTypesRef.get(REF_KEY))) {
    await offlineDb.bookTypesRef.put({ key: REF_KEY, data: SEED_BOOK_TYPES });
  }
  if (!(await offlineDb.contentTypesRef.get(REF_KEY))) {
    await offlineDb.contentTypesRef.put({
      key: REF_KEY,
      data: SEED_CONTENT_TYPES,
    });
  }
  if (!(await offlineDb.pluginMetaRef.get(REF_KEY))) {
    await offlineDb.pluginMetaRef.put({
      key: REF_KEY,
      data: SEED_PLUGIN_METADATA,
    });
  }
  for (const [lang, catalog] of Object.entries(SEED_I18N)) {
    if (!(await offlineDb.i18nCatalogs.get(lang))) {
      await offlineDb.i18nCatalogs.put({ lang, catalog });
    }
  }
}

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

/** Client-side slug from a name (lowercase, hyphenated, diacritics folded),
 *  mirroring the server's slug shape closely enough for offline use. Empty
 *  input falls back to "author". */
function slugify(name: string): string {
  const folded = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return folded || "author";
}

function buildAuthor(data: AuthorCreate, id: string): Author {
  const ts = nowIso();
  return {
    id,
    name: data.name,
    slug: slugify(data.name),
    bio: data.bio ?? null,
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
      // Match the API contract: the chapter LIST (titles/positions) is
      // always present; only the heavy `content` is stripped when
      // includeContent is false (BookEditor loads it per-chapter).
      const chapters = (
        await offlineDb.chapters.where("book_id").equals(id).toArray()
      )
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

  settings: {
    getApp: async () => {
      await ensureSeeded();
      const row = await offlineDb.appSettings.get(SETTINGS_KEY);
      return (row?.data ?? SEED_SETTINGS) as Record<string, unknown>;
    },

    /**
     * Apply a settings patch with a shallow per-section merge, mirroring the
     * backend PATCH semantics (`current.setdefault(section, {}).update(...)`):
     * object sections merge key-by-key, scalars replace.
     */
    updateApp: async (patch) => {
      await ensureSeeded();
      const row = await offlineDb.appSettings.get(SETTINGS_KEY);
      const current = (row?.data ?? SEED_SETTINGS) as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        const prev = merged[key];
        merged[key] =
          isPlainObject(prev) && isPlainObject(value)
            ? { ...prev, ...value }
            : value;
      }
      await offlineDb.appSettings.put({ key: SETTINGS_KEY, data: merged });
      return merged;
    },

    discoveredPlugins: async () => {
      await ensureSeeded();
      const row = await offlineDb.pluginMetaRef.get(REF_KEY);
      return row?.data ?? SEED_PLUGIN_METADATA;
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

  contentTypes: {
    list: async () => {
      await ensureSeeded();
      const row = await offlineDb.contentTypesRef.get(REF_KEY);
      return row?.data ?? SEED_CONTENT_TYPES;
    },
  },

  writingSessions: {
    /**
     * Writing history is server-computed; offline it returns empty so the
     * writing-history page renders its empty state.
     */
    list: async (_days = 30) => {
      void _days;
      return [] as WritingSession[];
    },
  },

  authors: {
    list: async ({ search, limit = 200 } = {}) => {
      let rows = await offlineDb.authors.toArray();
      if (search?.trim()) {
        const query = search.trim().toLowerCase();
        rows = rows.filter((author) => author.name.toLowerCase().includes(query));
      }
      rows.sort((left, right) => left.name.localeCompare(right.name));
      return rows.slice(0, limit);
    },
    get: async (id) => {
      const row = await offlineDb.authors.get(id);
      if (!row) notFound("Author", id);
      return row;
    },
    create: async (data: AuthorCreate) => {
      const row = buildAuthor(data, newId());
      await offlineDb.authors.add(row);
      return row;
    },
    update: async (id, data: AuthorUpdate) => {
      const existing = await offlineDb.authors.get(id);
      if (!existing) notFound("Author", id);
      const merged: Author = { ...existing, ...data, id, updated_at: nowIso() };
      await offlineDb.authors.put(merged);
      return merged;
    },
    delete: async (id) => {
      await offlineDb.authors.delete(id);
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
    // Conflict baselines: the server version each record was downloaded
    // at, so the sync engine (C7) can detect a desktop-side edit.
    await offlineDb.syncBaselines.bulkPut([
      { id: `book:${graph.book.id}`, updated_at: graph.book.updated_at },
      ...graph.chapters.map((c) => ({
        id: `chapter:${c.id}`,
        updated_at: c.updated_at,
      })),
    ]);
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
