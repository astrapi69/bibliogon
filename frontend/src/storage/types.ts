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

/**
 * Books, plus the soft-delete / trash lifecycle (Finding 7). `delete` is a
 * soft-delete (moves the book to trash); the trash members mirror the
 * existing `/api/books/trash/*` endpoints so the dashboard trash view works
 * offline against Dexie. Method names match the `api.books.*` client
 * (`listTrash`, not `listTrashed`) so the `typeof` typing keeps the seam from
 * drifting from the real client.
 */
export interface BookStorage {
    list: typeof api.books.list;
    get: typeof api.books.get;
    create: typeof api.books.create;
    update: typeof api.books.update;
    delete: typeof api.books.delete;
    listTrash: typeof api.books.listTrash;
    restore: typeof api.books.restore;
    permanentDelete: typeof api.books.permanentDelete;
    emptyTrash: typeof api.books.emptyTrash;
    bulkRestore: typeof api.books.bulkRestore;
    bulkDelete: typeof api.books.bulkDelete;
    fromArticles: typeof api.books.fromArticles;
    /**
     * Instantiate a book from a saved template (#730). Routed through the
     * seam so a template saved offline can actually be used offline — a
     * write with no consumer would be purgatory, not a feature. The Dexie
     * implementation resolves USER templates only; the client built-ins
     * carry i18n keys, so the caller (which has `t`) instantiates those via
     * `instantiateClientBookTemplate`.
     */
    createFromTemplate: typeof api.books.createFromTemplate;
}

/**
 * User-saved book templates (#730). Built-in templates are not part of this
 * namespace offline: they come from the client catalog in
 * `data/bookTemplates.ts` (i18n keys, resolved by the caller), which is why
 * `list` returns only what the user saved in Dexie mode while the API
 * returns builtin + user rows.
 */
export interface TemplateStorage {
    list: typeof api.templates.list;
    get: typeof api.templates.get;
    create: typeof api.templates.create;
    delete: typeof api.templates.delete;
}

/**
 * Reusable single-chapter templates (#731): the 4 built-ins plus the user's
 * own, the editor's "Aus Vorlage" picker and its save/JSON round-trip.
 *
 * Unlike {@link TemplateStorage}, the built-ins ARE rows here — they carry no
 * i18n keys (the backend stores them English-only and the UI renders them
 * verbatim), so offline they seed straight into the Dexie table from
 * `seed-chapter-templates.json` with stable `builtin-*` ids.
 *
 * `exportJson` keeps the api's side-effect contract: it triggers a browser
 * download rather than returning the text.
 */
export interface ChapterTemplateStorage {
    list: typeof api.chapterTemplates.list;
    get: typeof api.chapterTemplates.get;
    create: typeof api.chapterTemplates.create;
    update: typeof api.chapterTemplates.update;
    delete: typeof api.chapterTemplates.delete;
    exportJson: typeof api.chapterTemplates.exportJson;
    importJson: typeof api.chapterTemplates.importJson;
}

export interface ChapterStorage {
    list: typeof api.chapters.list;
    get: typeof api.chapters.get;
    create: typeof api.chapters.create;
    update: typeof api.chapters.update;
    delete: typeof api.chapters.delete;
    reorder: typeof api.chapters.reorder;
    /**
     * Version history + Scrivener-style manual snapshots (#728). Routed
     * through the seam so the offline build keeps a real save history
     * instead of a disabled page: `update` writes the pre-update state as
     * an automatic version (trimmed to the last 20), `createSnapshot`
     * writes a named one that is exempt from the trim, and `diffVersion`
     * computes the line diff client-side rather than round-tripping.
     */
    listVersions: typeof api.chapters.listVersions;
    getVersion: typeof api.chapters.getVersion;
    restoreVersion: typeof api.chapters.restoreVersion;
    createSnapshot: typeof api.chapters.createSnapshot;
    diffVersion: typeof api.chapters.diffVersion;
    deleteVersion: typeof api.chapters.deleteVersion;
}

export interface ArticleStorage {
    list: typeof api.articles.list;
    get: typeof api.articles.get;
    create: typeof api.articles.create;
    update: typeof api.articles.update;
    delete: typeof api.articles.delete;
    // Trash lifecycle + bulk operations. Routed through the seam so the
    // offline (Dexie) build supports article trash + bulk delete/restore,
    // not just the api build (the AD bulk-delete bug was a direct api.*
    // call that guardedFetch rejects in dexie mode).
    listTrash: typeof api.articles.listTrash;
    restore: typeof api.articles.restore;
    permanentDelete: typeof api.articles.permanentDelete;
    emptyTrash: typeof api.articles.emptyTrash;
    bulkDelete: typeof api.articles.bulkDelete;
    bulkRestore: typeof api.articles.bulkRestore;
    /**
     * The article's imported comments. Article-scoped on purpose: the api
     * puts this read on `articles` rather than `comments` because it belongs
     * with the article, and `CommentStorage.list` is the cross-article admin
     * view with no article filter. Routed through the seam so the editor's
     * comments panel shows them offline instead of rendering empty (#729).
     */
    getComments: typeof api.articles.getComments;
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

/**
 * Writing-history stats (Finding 6). Computed server-side in `api` mode;
 * aggregated client-side from the `writingSessions` Dexie table offline
 * (summary + streaks, per-book and per-chapter breakdowns) so the
 * Writing-History view works without the desktop backend. The CSV export
 * needs no seam method at all: it is serialised in the browser from the
 * `summary` series the view already holds (#744), so the backend
 * `/writing-stats/export.csv` route is no longer a UI dependency. The
 * `typeof api.*` typing keeps these from drifting from the real client.
 */
export interface WritingStatsStorage {
    summary: typeof api.writingStats.summary;
    byBook: typeof api.writingStats.byBook;
    byChapter: typeof api.writingStats.byChapter;
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
 * Article publications: which platforms a piece was published to, and
 * whether the article has moved since. All of it is per-article record-
 * keeping with no external call - `verifyLive` is the user asserting the
 * live version matches, not a fetch of it - so the mutations are
 * seam-routed too since #747, and the drift comparison runs on read in
 * both modes.
 */
export interface PublicationStorage {
    list: typeof api.publications.list;
    get: typeof api.publications.get;
    create: typeof api.publications.create;
    update: typeof api.publications.update;
    delete: typeof api.publications.delete;
    markPublished: typeof api.publications.markPublished;
    verifyLive: typeof api.publications.verifyLive;
}

/** Publishing platform schemas: reference data for the publish UI, seeded
 *  offline like the type registries (#1015) so the per-platform form has
 *  fields to render on the backendless build. Publishing itself is still
 *  backend-only (#747). */
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

/** The author's editable A+ document per book and language (#891). One row
 *  per (book, language); upsert semantics, so an offline edit works without a
 *  create step. */
export interface AplusDocumentStorage {
    get: typeof api.aplus.getDocument;
    save: typeof api.aplus.saveDocument;
    remove: typeof api.aplus.deleteDocument;
    listForBook: typeof api.aplus.listDocuments;
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
    cacheBlob(bookId: string, filename: string, blob: Blob, assetType?: string): Promise<void>;
}

/**
 * Offline article featured-images (#157). Dexie-only blob plumbing with no
 * api counterpart — in api mode the server serves the file and the resolver
 * uses `featured_image_url` directly, so these members are stubbed there.
 *  - `store` saves image bytes for an article and returns the generated
 *    asset id to set on `Article.featured_image_asset_id`. Used by the
 *    offline upload path and the Medium-import CDN cache.
 *  - `getBlob` resolves a stored asset id to its bytes — `useArticleImageUrl`
 *    turns this into a `blob:` URL offline.
 *  - `deleteByArticle` drops all of an article's cached images (cascade on
 *    article delete).
 */
export interface ArticleAssetStorage {
    store(articleId: string, blob: Blob, filename: string, mimeType?: string): Promise<string>;
    getBlob(assetId: string): Promise<Blob | null>;
    deleteByArticle(articleId: string): Promise<void>;
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

/**
 * KDP Publishing-Wizard persistence (#737): the per-book commercial
 * state row plus its ARC reviewer list.
 *
 * Plain per-book data with no server computation, so the wizard reads
 * and writes it through the seam and keeps the user's pricing, launch
 * checklist and reviewers across reloads on the backendless build. The
 * wizard's auto-save is deliberately fail-open, which offline made the
 * worst of both worlds: every PATCH was rejected by the offline guard
 * and swallowed, so choices silently never persisted.
 *
 * The package build (`api.kdp.buildPackage`) stays on `api.kdp`: it
 * renders the print PDF server-side and has no browser path (#741).
 */
export interface KdpStorage {
    /** Deterministic field inspection, mirrored client-side (#738), so the
     *  wizard's first step - which gates every step after it - answers
     *  offline instead of failing and blocking the whole flow. */
    checkMetadata: typeof api.kdp.checkMetadata;
    /** Amazon's browse categories: reference data, served from a client
     *  catalog offline (#738). */
    listCategories: typeof api.kdp.listCategories;
    getPublishingState: typeof api.kdp.getPublishingState;
    upsertPublishingState: typeof api.kdp.upsertPublishingState;
    listReviewers: typeof api.kdp.listReviewers;
    addReviewer: typeof api.kdp.addReviewer;
    updateReviewer: typeof api.kdp.updateReviewer;
    deleteReviewer: typeof api.kdp.deleteReviewer;
}

/**
 * Translation groups (#746): the flat set of books that are translations
 * of one another.
 *
 * Plain cross-book grouping - one shared id, no server computation - so
 * it works offline like any other book metadata. `importMultiBranch`
 * stays on `api.translations`: it clones a git repository and imports a
 * book per branch, which no browser can do.
 */
export interface TranslationStorage {
    list: typeof api.translations.list;
    link: typeof api.translations.link;
    unlink: typeof api.translations.unlink;
}

/** One logged backup or restore. Shape-compatible with the backend's
 *  `/backup/history` rows so the Settings list renders either source
 *  without a branch. */
export interface BackupHistoryEntry {
    /** ISO-8601, and the primary key: one entry per instant. */
    timestamp: string;
    action: string;
    book_count: number;
    chapter_count: number;
    file_size_bytes: number;
    filename: string;
    details: string;
}

/** What a caller knows at the moment it records an event. Everything but
 *  the action is optional, because a restore knows its counts and an
 *  export knows its size, and neither knows the other's. */
export interface BackupHistoryEvent {
    action: "backup" | "restore" | "import" | "selective-export";
    timestamp?: string;
    book_count?: number;
    chapter_count?: number;
    file_size_bytes?: number;
    filename?: string;
    details?: string;
}

/**
 * The backup log (#748). Offline it is a Dexie store in its own IndexedDB
 * database, so it survives the Danger-Zone reset - the moment a user most
 * needs to know whether a backup exists is right after one.
 *
 * `record` is a documented NO-OP in `api` mode, because there is no
 * endpoint to post an event to: the backend logs only the events its own
 * `/backup/export` and `/backup/import` routes produce. A client-side
 * export therefore does not appear in the online history, which is a
 * pre-existing gap this seam makes visible rather than papers over.
 */
export interface BackupHistoryStorage {
    list: (limit?: number) => Promise<BackupHistoryEntry[]>;
    record: (event: BackupHistoryEvent) => Promise<void>;
    delete: (timestamp: string) => Promise<void>;
    clear: () => Promise<void>;
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
    writingStats: WritingStatsStorage;
    authors: AuthorStorage;
    publications: PublicationStorage;
    articlePlatforms: ArticlePlatformStorage;
    editorPluginStatus: EditorPluginStatusStorage;
    chapterLabels: ChapterLabelStorage;
    aplusDocuments: AplusDocumentStorage;
    kdp: KdpStorage;
    translations: TranslationStorage;
    storyBible: StoryBibleStorage;
    pages: PageStorage;
    comics: ComicsStorage;
    assets: AssetStorage;
    articleAssets: ArticleAssetStorage;
    covers: CoverStorage;
    comments: CommentStorage;
    templates: TemplateStorage;
    chapterTemplates: ChapterTemplateStorage;
    backupHistory: BackupHistoryStorage;
}
