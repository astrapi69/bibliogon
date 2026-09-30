import {
    type Article,
    type Author,
    type Book,
    type Chapter,
    type ChapterLabel,
    type ComicBubbleOut,
    type ComicPanelOut,
    type Page,
    type StoryEntityLinkOut,
    type StoryEntityOut,
    type WritingSession,
} from "../api/client";
import type {AplusDocumentRecord} from "../api/platform";
import {getStorage} from "../storage";

/** Current backup-bundle schema version. */
export const BACKUP_BUNDLE_VERSION = 2;

/** A comic panel with the speech bubbles that sit on it. */
export interface BackupPanel {
    panel: ComicPanelOut;
    bubbles: ComicBubbleOut[];
}

/** A picture-book / comic page with its comic panels (empty for a
 *  picture-book page, which has no panels). */
export interface BackupPage {
    page: Page;
    panels: BackupPanel[];
}

/** A book plus its full chapter list (chapter rows carry their TipTap
 *  ``content`` string, so no separate per-chapter fetch is needed) and,
 *  for a picture-book or comic, its pages with their panels and bubbles.
 *  ``pages`` is optional so a v1 bundle still parses. */
export interface BackupBook {
    book: Book;
    chapters: Chapter[];
    pages?: BackupPage[];
}

/** Story-bible payload. ``entities`` carry their own ``entity_metadata``
 *  and embedded relationship JSON, so they restore standalone.
 *  ``relationships`` stays empty because entities carry theirs inline.
 *  ``links`` holds the StoryEntityPageLink join, gathered per entity via
 *  ``appearances`` — v1 emitted it empty, which silently dropped every
 *  Arc-View / appearance-tracker / continuity link on restore (#931). */
export interface BackupStoryBible {
    entities: StoryEntityOut[];
    relationships: unknown[];
    links: StoryEntityLinkOut[];
}

/** The full user-data payload. */
export interface BackupData {
    settings: Record<string, unknown>;
    author_profile: unknown;
    authors: Author[];
    books: BackupBook[];
    articles: Article[];
    story_bible: BackupStoryBible;
    writing_sessions: WritingSession[];
    chapter_labels: ChapterLabel[];
    /** Editable A+ documents (#891), every language of every book. Optional
     *  so bundles written before it existed still parse. */
    aplus_documents?: AplusDocumentRecord[];
    storyboard: unknown[];
    publications: unknown[];
    article_platforms: unknown[];
}

/** Versioned backup envelope written by {@link exportFullBackup}. */
export interface BackupBundleV1 {
    version: number;
    app_version: string;
    exported_at: string;
    data: BackupData;
}

const MAX_WRITING_SESSION_DAYS = 366;
const AUTHOR_LIST_LIMIT = 1000;

/**
 * Collect a book's pages with their comic panels and speech bubbles.
 *
 * A prose book has no pages, so this is one cheap empty list for it. A
 * picture-book page has pages but no panels; only a comic reaches the
 * innermost level.
 */
async function gatherPages(
    storage: ReturnType<typeof getStorage>,
    bookId: string,
): Promise<BackupPage[]> {
    const pages = await storage.pages.list(bookId);
    return Promise.all(
        pages.map(async (page) => {
            const panels = await storage.comics.listPanels(bookId, page.id);
            return {
                page,
                panels: await Promise.all(
                    panels.map(async (panel) => ({
                        panel,
                        bubbles: await storage.comics.listBubbles(bookId, panel.id),
                    })),
                ),
            };
        }),
    );
}

/**
 * Gather every user-data entity through the storage seam and assemble a
 * single backup bundle. Identical in API and Dexie mode because every
 * read goes through ``getStorage()``.
 *
 * Core entities (settings, author profile, authors, books + chapters
 * with content, articles with content, story-bible entities, chapter
 * labels, A+ documents, pages with their comic panels and bubbles, and
 * the story-bible entity links) are fully populated. Writing sessions cover the last 366 days
 * (the backend list cap) and are informational only — they have no seam
 * ``create`` and are not restored on import. Per-article publications and
 * the platform registry are still reserved (emitted empty) — see the
 * field docs. Chapter snapshots are NOT carried: restoring one needs a
 * create-with-content path the seam does not have (#848).
 *
 * @param exportedAt - ISO-8601 timestamp stamped into the envelope.
 */
export async function buildBackupBundle(exportedAt: string): Promise<BackupBundleV1> {
    const storage = getStorage();

    const [settings, authors, books, articleSummaries, writingSessions] = await Promise.all([
        storage.settings.getApp(),
        storage.authors.list({limit: AUTHOR_LIST_LIMIT}),
        storage.books.list(),
        storage.articles.list(),
        storage.writingSessions.list(MAX_WRITING_SESSION_DAYS),
    ]);

    const backupBooks = await Promise.all(
        books.map(async (book) => ({
            book,
            chapters: await storage.chapters.list(book.id),
            pages: await gatherPages(storage, book.id),
        })),
    );

    const articles = await Promise.all(
        articleSummaries.map((summary) => storage.articles.get(summary.id)),
    );

    const entityLists = await Promise.all(
        books.map((book) => storage.storyBible.listEntities(book.id)),
    );
    const entities = entityLists.flat();

    // The StoryEntityPageLink join has no list-by-book method, but
    // ``appearances`` returns every link of one entity (page AND chapter),
    // and every entity is in the bundle already - so walking the entities
    // covers the whole join.
    const linkLists = await Promise.all(
        entities.map((entity) => storage.storyBible.appearances(entity.id)),
    );
    const links = linkLists.flat();

    const labelLists = await Promise.all(
        books.map((book) => storage.chapterLabels.list(book.id)),
    );
    const chapterLabels = labelLists.flat();

    const aplusLists = await Promise.all(
        books.map((book) => storage.aplusDocuments.listForBook(book.id)),
    );

    return {
        version: BACKUP_BUNDLE_VERSION,
        app_version: __APP_VERSION__,
        exported_at: exportedAt,
        data: {
            settings,
            author_profile: (settings as {author?: unknown}).author ?? null,
            authors,
            books: backupBooks,
            articles,
            story_bible: {entities, relationships: [], links},
            writing_sessions: writingSessions,
            chapter_labels: chapterLabels,
            aplus_documents: aplusLists.flat(),
            storyboard: [],
            publications: [],
            article_platforms: [],
        },
    };
}

/** Download filename for a backup taken on the given ISO timestamp:
 *  ``bibliogon-backup-YYYY-MM-DD.json``. */
export function backupFilename(isoTimestamp: string): string {
    return `bibliogon-backup-${isoTimestamp.slice(0, 10)}.json`;
}

/**
 * Build the full backup bundle and return it as a downloadable JSON
 * Blob. Works offline (Dexie) and online (API) — same code, same output.
 */
export async function exportFullBackup(exportedAt: string): Promise<Blob> {
    const bundle = await buildBackupBundle(exportedAt);
    return new Blob([JSON.stringify(bundle, null, 2)], {type: "application/json"});
}
