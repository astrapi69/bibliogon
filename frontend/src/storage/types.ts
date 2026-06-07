/**
 * Storage-layer types (mobile-sync Phase 2, P2-C1).
 *
 * `IStorageService` is the seam that lets a future DexieStorage
 * (offline mirror of the user-selected sync scope) slot in behind the
 * same calls the components already make, without touching every
 * component. Today only `ApiStorage` exists (delegates to the existing
 * `api` client); DexieStorage + the sync engine land in later P2 commits.
 *
 * Scope for P2-C1 is the sync-relevant CORE content CRUD of the
 * selectable domains (books + their chapters, articles). Trash / bulk /
 * AI-template methods stay on the `api` object directly and join the
 * interface only when offline genuinely needs them — no speculative
 * over-mirroring of the whole client.
 *
 * Each member is typed as `typeof api.<domain>.<method>` so the
 * interface can never drift from the real client signature: change the
 * client and the implementations fail to type-check until they match.
 *
 * Pattern adapted from adaptive-learner `frontend/src/storage/` (a
 * composed IStorageService picked by a `getStorage()` factory); the
 * DOMAINS here are Bibliogon's, not adaptive-learner's.
 */

import type { api, ArticleComment } from "../api/client";

/** Which backend `getStorage()` resolves to. */
export type StorageMode = "api" | "dexie";

export interface BookStorage {
  list: typeof api.books.list;
  get: typeof api.books.get;
  create: typeof api.books.create;
  update: typeof api.books.update;
  delete: typeof api.books.delete;
}

export interface ChapterStorage {
  list: typeof api.chapters.list;
  get: typeof api.chapters.get;
  create: typeof api.chapters.create;
  update: typeof api.chapters.update;
  delete: typeof api.chapters.delete;
  reorder: typeof api.chapters.reorder;
}

export interface ArticleStorage {
  list: typeof api.articles.list;
  get: typeof api.articles.get;
  create: typeof api.articles.create;
  update: typeof api.articles.update;
  delete: typeof api.articles.delete;
}

/**
 * App settings + reference data (i18n catalogs, type registries, plugin
 * metadata). Backend-served in `api` mode; served from seeded Dexie tables
 * in offline mode so the backendless PWA boots with real config. The
 * `typeof api.*` typing keeps these from drifting from the real client.
 */
export interface SettingsStorage {
  getApp: typeof api.settings.getApp;
  updateApp: typeof api.settings.updateApp;
  discoveredPlugins: typeof api.settings.discoveredPlugins;
}

export interface I18nStorage {
  get: typeof api.i18n.get;
}

export interface BookTypesStorage {
  list: typeof api.bookTypes.list;
}

export interface ContentTypesStorage {
  list: typeof api.contentTypes.list;
}

export interface WritingSessionsStorage {
  list: typeof api.writingSessions.list;
}

/** The global Authors-Database. Pure CRUD, so it works offline against a
 *  Dexie table (the user can add + pick authors on the backendless PWA). */
export interface AuthorStorage {
  list: typeof api.authors.list;
  get: typeof api.authors.get;
  create: typeof api.authors.create;
  update: typeof api.authors.update;
  delete: typeof api.authors.delete;
}

/**
 * Article publications (which platforms a piece was published to). The
 * READ is seam-routed so opening the article editor offline returns an
 * empty list from Dexie instead of firing a doomed `/api` request; the
 * publish MUTATIONS stay on `api.publications.*` (they push to external
 * platforms via the backend and are genuinely desktop-only for now).
 */
export interface PublicationStorage {
  list: typeof api.publications.list;
}

/** Publishing platform schemas (reference data for the publish UI).
 *  Seam-routed read so the editor's offline load returns an empty map
 *  instead of erroring; publishing itself remains backend-only. */
export interface ArticlePlatformStorage {
  list: typeof api.articlePlatforms.list;
}

/** Editor plugin-availability probe (AI / grammar / audiobook / ms-tools).
 *  These plugins are backend-only, so the offline probe returns an empty
 *  map (everything unavailable) from Dexie without firing `/api`. */
export interface EditorPluginStatusStorage {
  get: typeof api.editorPluginStatus;
}

/** Per-book chapter labels (colour-coded workflow tags). Pure CRUD against a
 *  Dexie table, so the prose chapter-label manager / outliner / storyboard
 *  work offline. */
export interface ChapterLabelStorage {
  list: typeof api.chapterLabels.list;
  create: typeof api.chapterLabels.create;
  update: typeof api.chapterLabels.update;
  remove: typeof api.chapterLabels.remove;
}

/** Story Bible: per-book fiction-entity database + entity-page/chapter links.
 *  Entity + link CRUD and relationship resolution work offline against the
 *  Dexie storyEntities / storyEntityPageLinks tables (+ the seeded entity-type
 *  registry). The text-analysis methods (autoDetect / continuityCheck) return
 *  empty offline, and exportBible is generated client-side. */
export interface StoryBibleStorage {
  getInfo: typeof api.storyBible.getInfo;
  listEntityTypes: typeof api.storyBible.listEntityTypes;
  listEntities: typeof api.storyBible.listEntities;
  createEntity: typeof api.storyBible.createEntity;
  getEntity: typeof api.storyBible.getEntity;
  updateEntity: typeof api.storyBible.updateEntity;
  deleteEntity: typeof api.storyBible.deleteEntity;
  getRelationships: typeof api.storyBible.getRelationships;
  autoDetect: typeof api.storyBible.autoDetect;
  appearances: typeof api.storyBible.appearances;
  pageEntities: typeof api.storyBible.pageEntities;
  createLink: typeof api.storyBible.createLink;
  deleteLink: typeof api.storyBible.deleteLink;
  continuityCheck: typeof api.storyBible.continuityCheck;
  exportBible: typeof api.storyBible.exportBible;
}

/** Picture-book pages. CRUD over the existing Dexie pages table, so the
 *  picture-book / comic page editor works offline. */
export interface PageStorage {
  list: typeof api.pages.list;
  create: typeof api.pages.create;
  update: typeof api.pages.update;
  delete: typeof api.pages.delete;
  reorder: typeof api.pages.reorder;
}

/** Comic panels + speech bubbles. CRUD over the existing Dexie comicPanels /
 *  comicBubbles tables, so the comic editor works offline. getInfo reports
 *  available so the comic surfaces un-gate in Dexie mode. */
export interface ComicsStorage {
  getInfo: typeof api.comics.getInfo;
  listPanels: typeof api.comics.listPanels;
  createPanel: typeof api.comics.createPanel;
  updatePanel: typeof api.comics.updatePanel;
  deletePanel: typeof api.comics.deletePanel;
  reorderPanels: typeof api.comics.reorderPanels;
  listBubbles: typeof api.comics.listBubbles;
  createBubble: typeof api.comics.createBubble;
  updateBubble: typeof api.comics.updateBubble;
  deleteBubble: typeof api.comics.deleteBubble;
}

/**
 * Binary image assets (figures + editor images). `list` / `upload` / `delete`
 * mirror `api.assets`; the two extra members carry the offline blob plumbing
 * that has no api counterpart:
 *  - `getBlob` resolves a stored `(bookId, filename)` to its bytes — the
 *    `useAssetUrl` resolver turns this into a `blob:` URL in dexie mode (api
 *    mode fetches the served file).
 *  - `cacheBlob` stores bytes for later offline display — used by the
 *    take-offline byte-fetch and the lazy online-view cache. Api mode is a
 *    no-op (the server is the source of truth).
 * The embedded-in-TipTap image URLs are served by the service worker, which
 * reads the same IndexedDB store directly; this seam covers the React-
 * controlled display + upload sites.
 */
export interface AssetStorage {
  list: typeof api.assets.list;
  upload: typeof api.assets.upload;
  delete: typeof api.assets.delete;
  getBlob(bookId: string, filename: string): Promise<Blob | null>;
  cacheBlob(
    bookId: string,
    filename: string,
    blob: Blob,
    assetType?: string,
  ): Promise<void>;
}

/** Per-book cover image. Mirrors `api.covers` (upload + delete); the cover
 *  is stored in the same offline assets store under a `cover-{id}.{ext}`
 *  filename so the existing `/assets/file/{filename}` display path resolves. */
export interface CoverStorage {
  upload: typeof api.covers.upload;
  delete: typeof api.covers.delete;
}

/**
 * Imported article comments + the soft-delete / trash lifecycle. The nine
 * api-mirroring members make the comments-admin work offline against a Dexie
 * table; `create` is offline-only (the Medium importer creates comments in the
 * browser — online they are created server-side, so api mode has no create).
 */
export interface CommentStorage {
  list: typeof api.comments.list;
  delete: typeof api.comments.delete;
  reclassifyAsArticle: typeof api.comments.reclassifyAsArticle;
  bulkDelete: typeof api.comments.bulkDelete;
  listTrashed: typeof api.comments.listTrashed;
  restore: typeof api.comments.restore;
  permanentDelete: typeof api.comments.permanentDelete;
  emptyTrash: typeof api.comments.emptyTrash;
  bulkRestore: typeof api.comments.bulkRestore;
  create(comment: ArticleComment): Promise<ArticleComment>;
}

export interface IStorageService {
  /** The backend this instance is. Lets the UI show "Current mode: …". */
  readonly mode: StorageMode;
  books: BookStorage;
  chapters: ChapterStorage;
  articles: ArticleStorage;
  settings: SettingsStorage;
  i18n: I18nStorage;
  bookTypes: BookTypesStorage;
  contentTypes: ContentTypesStorage;
  writingSessions: WritingSessionsStorage;
  authors: AuthorStorage;
  publications: PublicationStorage;
  articlePlatforms: ArticlePlatformStorage;
  editorPluginStatus: EditorPluginStatusStorage;
  chapterLabels: ChapterLabelStorage;
  storyBible: StoryBibleStorage;
  pages: PageStorage;
  comics: ComicsStorage;
  assets: AssetStorage;
  covers: CoverStorage;
  comments: CommentStorage;
}
