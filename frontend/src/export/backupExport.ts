import {
    type Article,
    type Author,
    type Book,
    type BookPublishingStateApi,
    type Chapter,
    type ChapterLabel,
    type ComicBubbleOut,
    type ComicPanelOut,
    type Page,
    type Publication,
    type StoryEntityLinkOut,
    type StoryEntityOut,
    type WritingSession,
} from "../api/client";
import type {AplusDocumentRecord} from "../api/platform";
import {getStorage} from "../storage";
import {scrubSecrets} from "../utils/ai/scrubSecrets";

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

/** One book's KDP publishing state, reviewers inline (#1008).
 *
 * The seam returns the reviewers inside the state row, so one read per
 * book carries both. ``book_id`` is the id at EXPORT time; restore maps it
 * to the newly created book.
 */
export interface BackupPublishingState {
    book_id: string;
    state: BookPublishingStateApi;
}

/** The member ids of one translation group (#1008).
 *
 * Stored as a flat id list rather than per-book siblings because the seam
 * restores a group with a single ``link(ids)`` call. Ids are export-time
 * and get mapped on restore; a group whose members did not all survive the
 * restore is skipped rather than half-linked.
 */
export type BackupTranslationGroup = string[];

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
    /** Per-article publications (#1008). Typed and populated since the
     *  seam gained its write methods (#747); older bundles carry `[]`,
     *  which still parses. */
    publications: Publication[];
    article_platforms: unknown[];
    /** KDP publishing state + ARC reviewers, one entry per book that has
     *  any (#1008). Optional so bundles written before it still parse. */
    kdp_publishing_state?: BackupPublishingState[];
    /** Translation groups as member-id lists (#1008). Optional, same
     *  reason. */
    translation_groups?: BackupTranslationGroup[];
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
 * Run a sub-resource list, treating a book-type gate as "none of these".
 *
 * Online, both routers enforce the book's type: the pages router answers
 * 400 for anything that is not a picture book or comic, and the panels
 * router 400 for anything that is not a comic. Those are not failures -
 * a prose book genuinely has no pages, a picture book genuinely has no
 * panels - but letting the rejection propagate aborts the whole export
 * on the first prose book in the library.
 *
 * Only 400 and 404 are swallowed. A network error or a 500 is a real
 * failure and must still reach the caller, or a backup could silently
 * come back short.
 */
async function listOrNone<T>(run: () => Promise<T[]>): Promise<T[]> {
    try {
        return await run();
    } catch (error) {
        const status = (error as {status?: number} | null)?.status;
        if (status === 400 || status === 404) return [];
        throw error;
    }
}

/**
 * Translation groups, reconstructed from the per-book sibling lists.
 *
 * The seam has no list-groups method - ``translations.list(bookId)``
 * returns the OTHER members of that book's group - so a group is
 * `{book} union siblings`, and walking every book sees each group once per
 * member. Deduped on the sorted member key so a three-book group is
 * carried once, not three times.
 */
async function gatherTranslationGroups(
    storage: ReturnType<typeof getStorage>,
    bookIds: string[],
): Promise<BackupTranslationGroup[]> {
    const groups = new Map<string, BackupTranslationGroup>();
    for (const bookId of bookIds) {
        let siblings;
        try {
            siblings = (await storage.translations.list(bookId)).siblings;
        } catch {
            continue;
        }
        if (siblings.length === 0) continue;
        const members = [bookId, ...siblings.map((sibling) => sibling.book_id)].sort();
        groups.set(members.join("|"), members);
    }
    return [...groups.values()];
}

/**
 * KDP publishing state per book, skipping the books that have none.
 *
 * ``getPublishingState`` returns a wrapper carrying a nullable row; a book
 * the user never took into the wizard has `state: null` and contributes
 * nothing to the bundle. A book whose state cannot be read is skipped for
 * the same reason the translation walk skips one: the rest of the bundle
 * is worth more than failing the whole export over one optional row.
 */
async function gatherPublishingStates(
    storage: ReturnType<typeof getStorage>,
    bookIds: string[],
): Promise<BackupPublishingState[]> {
    const out: BackupPublishingState[] = [];
    for (const bookId of bookIds) {
        let state: BookPublishingStateApi | null;
        try {
            state = (await storage.kdp.getPublishingState(bookId)).state;
        } catch {
            continue;
        }
        if (state) out.push({book_id: bookId, state});
    }
    return out;
}

/**
 * Collect a book's pages with their comic panels and speech bubbles.
 *
 * A prose book has no pages, so this is one empty list for it. A
 * picture-book page has pages but no panels; only a comic reaches the
 * innermost level.
 */
async function gatherPages(
    storage: ReturnType<typeof getStorage>,
    bookId: string,
): Promise<BackupPage[]> {
    const pages = await listOrNone(() => storage.pages.list(bookId));
    return Promise.all(
        pages.map(async (page) => {
            const panels = await listOrNone(() => storage.comics.listPanels(bookId, page.id));
            return {
                page,
                panels: await Promise.all(
                    panels.map(async (panel) => ({
                        panel,
                        bubbles: await listOrNone(() =>
                            storage.comics.listBubbles(bookId, panel.id),
                        ),
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
 * the story-bible entity links) are fully populated. Writing sessions
 * cover the last 366 days (the backend list cap) and are informational
 * only — they have no seam ``create`` and are not restored on import. Per-article publications, the
 * KDP publishing state with its ARC reviewers, and translation-group
 * membership are carried and restored since #1008 — each became
 * seam-writable offline (#747 / #737 / #746), which is what made them
 * losable in the first place. The platform registry stays reserved
 * (emitted empty): it is reference data the seed supplies, not user data.
 *
 * Article COMMENTS are deliberately absent. The seam can read them but has
 * no ``create``, and neither does the backend router — a comment enters the
 * system only through the Medium importer. Carrying them would put rows in
 * the archive that no restore could put back, which reads to the user as
 * data loss at exactly the moment they are trusting the backup.
 *
 * Chapter snapshots are NOT carried: restoring one needs a
 * create-with-content path the seam does not have, and a snapshot's
 * identity today is the chapter's server-assigned `version`, which means
 * nothing in the database a backup is restored into. #996 is the shape
 * that makes carrying them safe (identity by content hash).
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

    const bookIds = books.map((book) => book.id);
    const [translationGroups, publishingStates] = await Promise.all([
        gatherTranslationGroups(storage, bookIds),
        gatherPublishingStates(storage, bookIds),
    ]);

    const publicationLists = await Promise.all(
        articles.map((article) => listOrNone(() => storage.publications.list(article.id))),
    );

    // #985: the bundle leaves the device - mailed to a maintainer, dropped
    // in a cloud folder, handed to a second machine - and a provider key is
    // the one thing in it worth money to a stranger. Everything else about
    // the AI config stays, so a restore puts the user back minus the keys.
    const {settings: scrubbedSettings} = scrubSecrets(settings);

    return {
        version: BACKUP_BUNDLE_VERSION,
        app_version: __APP_VERSION__,
        exported_at: exportedAt,
        data: {
            settings: scrubbedSettings as typeof settings,
            author_profile: (settings as {author?: unknown}).author ?? null,
            authors,
            books: backupBooks,
            articles,
            story_bible: {entities, relationships: [], links},
            writing_sessions: writingSessions,
            chapter_labels: chapterLabels,
            aplus_documents: aplusLists.flat(),
            storyboard: [],
            publications: publicationLists.flat(),
            article_platforms: [],
            kdp_publishing_state: publishingStates,
            translation_groups: translationGroups,
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
