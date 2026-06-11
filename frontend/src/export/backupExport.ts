import {
    type Article,
    type Author,
    type Book,
    type Chapter,
    type ChapterLabel,
    type StoryEntityOut,
    type WritingSession,
} from "../api/client";
import {getStorage} from "../storage";

/** Current backup-bundle schema version. */
export const BACKUP_BUNDLE_VERSION = 1;

/** A book plus its full chapter list (chapter rows carry their TipTap
 *  ``content`` string, so no separate per-chapter fetch is needed). */
export interface BackupBook {
    book: Book;
    chapters: Chapter[];
}

/** Story-bible payload. ``entities`` carry their own ``entity_metadata``
 *  and embedded relationship JSON, so they restore standalone.
 *  ``relationships`` and ``links`` are reserved for a future expansion
 *  (no seam list method exposes the StoryEntityPageLink join today) and
 *  are emitted empty in v1. */
export interface BackupStoryBible {
    entities: StoryEntityOut[];
    relationships: unknown[];
    links: unknown[];
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
 * Gather every user-data entity through the storage seam and assemble a
 * single backup bundle. Identical in API and Dexie mode because every
 * read goes through ``getStorage()``.
 *
 * Core entities (settings, author profile, authors, books + chapters
 * with content, articles with content, story-bible entities, chapter
 * labels) are fully populated. Writing sessions cover the last 366 days
 * (the backend list cap) and are informational only — they have no seam
 * ``create`` and are not restored on import. Page-level storyboard,
 * per-article publications, and the platform registry are reserved
 * (emitted empty) in v1 — see the field docs.
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
        })),
    );

    const articles = await Promise.all(
        articleSummaries.map((summary) => storage.articles.get(summary.id)),
    );

    const entityLists = await Promise.all(
        books.map((book) => storage.storyBible.listEntities(book.id)),
    );
    const entities = entityLists.flat();

    const labelLists = await Promise.all(
        books.map((book) => storage.chapterLabels.list(book.id)),
    );
    const chapterLabels = labelLists.flat();

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
            story_bible: {entities, relationships: [], links: []},
            writing_sessions: writingSessions,
            chapter_labels: chapterLabels,
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
