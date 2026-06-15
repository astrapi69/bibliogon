import { getStorage } from "../storage";
import { BACKUP_BUNDLE_VERSION, type BackupBundleV1, type BackupData } from "./backupExport";

/**
 * Which data sections a selective export should include. Each flag maps
 * one-to-one onto a populated {@link BackupData} section. Sections the
 * backup bundle does not carry (picture-book pages, comic panels, comments,
 * publications) are intentionally absent — offering a checkbox for them
 * would be a half-wired control that writes nothing.
 *
 * Chapters are not a separate flag: they travel embedded inside each
 * exported book, so selecting ``books`` always carries the chapters.
 */
export interface ExportSelection {
    books: boolean;
    articles: boolean;
    authors: boolean;
    chapterLabels: boolean;
    storyBible: boolean;
    writingSessions: boolean;
    settings: boolean;
}

/** A selection with no section enabled. */
export const EMPTY_SELECTION: ExportSelection = {
    books: false,
    articles: false,
    authors: false,
    chapterLabels: false,
    storyBible: false,
    writingSessions: false,
    settings: false,
};

/** A selection with every section enabled. */
export const FULL_SELECTION: ExportSelection = {
    books: true,
    articles: true,
    authors: true,
    chapterLabels: true,
    storyBible: true,
    writingSessions: true,
    settings: true,
};

const MAX_WRITING_SESSION_DAYS = 366;
const AUTHOR_LIST_LIMIT = 1000;

/** True when at least one section is enabled. */
export function hasAnySelection(selection: ExportSelection): boolean {
    return Object.values(selection).some(Boolean);
}

function emptyData(): BackupData {
    return {
        settings: {},
        author_profile: null,
        authors: [],
        books: [],
        articles: [],
        story_bible: { entities: [], relationships: [], links: [] },
        writing_sessions: [],
        chapter_labels: [],
        storyboard: [],
        publications: [],
        article_platforms: [],
    };
}

/**
 * Gather only the selected data sections through the storage seam and
 * assemble a backup bundle. The envelope shape is identical to
 * {@link buildBackupBundle}, so {@link importFullBackup} reads a selective
 * export through the same path as a full backup; unselected sections are
 * emitted empty and the importer skips them.
 *
 * Identical online (API) and offline (Dexie) because every read goes
 * through ``getStorage()``.
 *
 * @param selection - Which sections to include.
 * @param exportedAt - ISO-8601 timestamp stamped into the envelope.
 */
export async function buildSelectiveBundle(
    selection: ExportSelection,
    exportedAt: string,
): Promise<BackupBundleV1> {
    const storage = getStorage();
    const data = emptyData();

    if (selection.settings) {
        const settings = await storage.settings.getApp();
        data.settings = settings;
        data.author_profile = (settings as { author?: unknown }).author ?? null;
    }

    if (selection.authors) {
        data.authors = await storage.authors.list({ limit: AUTHOR_LIST_LIMIT });
    }

    const books =
        selection.books || selection.chapterLabels || selection.storyBible
            ? await storage.books.list()
            : [];

    if (selection.books) {
        data.books = await Promise.all(
            books.map(async (book) => ({
                book,
                chapters: await storage.chapters.list(book.id),
            })),
        );
    }

    if (selection.articles) {
        const summaries = await storage.articles.list();
        data.articles = await Promise.all(
            summaries.map((summary) => storage.articles.get(summary.id)),
        );
    }

    if (selection.storyBible) {
        const entityLists = await Promise.all(
            books.map((book) => storage.storyBible.listEntities(book.id)),
        );
        data.story_bible = { entities: entityLists.flat(), relationships: [], links: [] };
    }

    if (selection.chapterLabels) {
        const labelLists = await Promise.all(
            books.map((book) => storage.chapterLabels.list(book.id)),
        );
        data.chapter_labels = labelLists.flat();
    }

    if (selection.writingSessions) {
        data.writing_sessions = await storage.writingSessions.list(MAX_WRITING_SESSION_DAYS);
    }

    return {
        version: BACKUP_BUNDLE_VERSION,
        app_version: __APP_VERSION__,
        exported_at: exportedAt,
        data,
    };
}

/** Download filename for a selective export taken on the given ISO
 *  timestamp: ``bibliogon-export-YYYY-MM-DD.json``. */
export function selectiveExportFilename(isoTimestamp: string): string {
    return `bibliogon-export-${isoTimestamp.slice(0, 10)}.json`;
}

/**
 * Build the selective bundle and return it as a downloadable JSON Blob.
 * Works offline (Dexie) and online (API) — same code, same output, and
 * the same importable envelope as a full backup.
 *
 * @param selection - Which sections to include.
 * @param exportedAt - ISO-8601 timestamp stamped into the envelope.
 */
export async function exportSelectiveBackup(
    selection: ExportSelection,
    exportedAt: string,
): Promise<Blob> {
    const bundle = await buildSelectiveBundle(selection, exportedAt);
    return new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
}
