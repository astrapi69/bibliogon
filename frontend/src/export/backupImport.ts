import {
    type Article,
    type ArticleCreate,
    type ArticleUpdate,
    type Book,
    type BookCreate,
    type BookUpdate,
    type ChapterLabel,
    type PageCreate,
    type StoryEntityLinkOut,
    type StoryEntityOut,
} from "../api/client";
import type {AplusDocumentRecord} from "../api/platform";
import {getStorage} from "../storage";
import {
    baseUrlChangesBesideKeys,
    preserveLocalBaseUrls,
    preserveLocalSecrets,
    type BaseUrlChange,
} from "../utils/ai/scrubSecrets";
import {planAuthorsImport} from "../components/settings/authorsImportExport";
import {type BackupBundleV1} from "./backupExport";

/** Per-entity counts for an import outcome. */
export interface ImportCounts {
    settings: number;
    authors: number;
    books: number;
    chapters: number;
    articles: number;
    story_entities: number;
    story_entity_links: number;
    chapter_labels: number;
    aplus_documents: number;
    pages: number;
    comic_panels: number;
    comic_bubbles: number;
    publications: number;
    kdp_publishing_state: number;
    translation_groups: number;
}

/** Result of {@link importFullBackup}: what was created vs skipped. */
export interface ImportResult {
    imported: ImportCounts;
    skipped: ImportCounts;
}

/** Thrown by {@link parseBackupBundle} when the input is not a
 *  recognised, supported backup bundle. */
export class BackupImportError extends Error {}

/**
 * Bundle versions this importer reads.
 *
 * Every version bump so far has ADDED optional fields, so an older
 * bundle still parses and simply restores less. The check must stay a
 * set rather than an equality: `version !== BACKUP_BUNDLE_VERSION`
 * would reject every backup a user already holds the moment the current
 * version moves (#931).
 *
 * v1: books + chapters, articles, authors, settings, story-bible
 *     entities, chapter labels, A+ documents.
 * v2: adds pages with their comic panels and speech bubbles, and the
 *     story-bible entity links.
 */
const SUPPORTED_BUNDLE_VERSIONS: ReadonlySet<number> = new Set([1, 2]);

function isSupportedVersion(version: unknown): boolean {
    return typeof version === "number" && SUPPORTED_BUNDLE_VERSIONS.has(version);
}

function zeroCounts(): ImportCounts {
    return {
        settings: 0,
        authors: 0,
        books: 0,
        chapters: 0,
        articles: 0,
        story_entities: 0,
        story_entity_links: 0,
        chapter_labels: 0,
        aplus_documents: 0,
        pages: 0,
        comic_panels: 0,
        comic_bubbles: 0,
        publications: 0,
        kdp_publishing_state: 0,
        translation_groups: 0,
    };
}

/**
 * Parse and validate a raw backup-bundle JSON string.
 *
 * @throws BackupImportError on invalid JSON or an unsupported version.
 */
export function parseBackupBundle(text: string): BackupBundleV1 {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new BackupImportError("not-json");
    }
    const candidate = parsed as {version?: unknown; data?: unknown} | null;
    if (
        typeof candidate !== "object" ||
        candidate === null ||
        !isSupportedVersion(candidate.version) ||
        typeof candidate.data !== "object" ||
        candidate.data === null
    ) {
        throw new BackupImportError("bad-shape");
    }
    return candidate as BackupBundleV1;
}

export function bookCreateFrom(book: Book): BookCreate {
    return {
        title: book.title,
        subtitle: book.subtitle ?? undefined,
        author: book.author,
        language: book.language,
        genre: book.genre ?? undefined,
        series: book.series ?? undefined,
        series_index: book.series_index ?? undefined,
        description: book.description ?? undefined,
        book_type: book.book_type as BookCreate["book_type"],
        status: book.status as BookCreate["status"],
    };
}

/**
 * Keys a book restore must NOT carry, by the reason it must not.
 *
 * The complement of this set is what travels, so a column added to
 * `Book` tomorrow is restored the day it lands - which is the whole
 * point. A hand-written list of what to KEEP had drifted to ten of
 * fifty-three fields, dropping every ISBN, every ASIN, the KDP
 * marketing block and the audiobook configuration (#1078).
 *
 * - `id` - the restore assigns a new one; carrying the bundle's would
 *   re-point the row at a book that no longer exists.
 * - `created_at` / `updated_at` - the restoring device's, and no
 *   update body accepts them.
 * - `book_type` - immutable after creation; `PATCH /api/books/{id}`
 *   answers 400 for it, so `bookCreateFrom` is the only place it may
 *   be set.
 * - `cover_image` - the asset importer owns it, and sets it only once
 *   the cover bytes are actually in place. A reference restored here
 *   would point at a file that may never arrive.
 * - `deleted_at` - the export lists live books only, so this is always
 *   null in a bundle; dropping it says so rather than relying on it.
 * - `offline_available` - a Dexie-only, per-device flag (see
 *   `OfflineBookRow`). Whether THIS device holds the book offline is
 *   not a property of the book, so it does not travel in a backup.
 */
const BOOK_RESTORE_DROP_KEYS = new Set<string>([
    "id",
    "created_at",
    "updated_at",
    "book_type",
    "cover_image",
    "deleted_at",
    "offline_available",
]);

/**
 * Keys an article restore must NOT carry.
 *
 * Same shape as the book set. `original_published_at` and
 * `comments_count` are computed from other rows rather than stored,
 * and `ArticleUpdate` does not accept them; `featured_image_asset_id`
 * is the asset importer's, like the book cover.
 */
const ARTICLE_RESTORE_DROP_KEYS = new Set<string>([
    "id",
    "created_at",
    "updated_at",
    "deleted_at",
    "comments_count",
    "original_published_at",
    "featured_image_asset_id",
]);

function withoutKeys<T extends object>(row: T, drop: Set<string>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(row).filter(([key]) => !drop.has(key)),
    );
}

/**
 * Everything of a backed-up book that the create call did not carry.
 *
 * Written through `storage.books.update` right after the create, so a
 * restored book is the book that was exported rather than its ten
 * best-known fields.
 *
 * @example
 * const created = await storage.books.create(bookCreateFrom(book));
 * await storage.books.update(created.id, bookRestoreFields(book));
 */
export function bookRestoreFields(book: Book): BookUpdate {
    return withoutKeys(book, BOOK_RESTORE_DROP_KEYS) as BookUpdate;
}

/**
 * Everything of a backed-up article that the create call did not carry.
 *
 * @example
 * const created = await storage.articles.create(articleCreateFrom(article));
 * await storage.articles.update(created.id, articleRestoreFields(article));
 */
export function articleRestoreFields(article: Article): ArticleUpdate {
    return withoutKeys(article, ARTICLE_RESTORE_DROP_KEYS) as ArticleUpdate;
}

export function articleCreateFrom(article: Article): ArticleCreate {
    return {
        title: article.title,
        subtitle: article.subtitle,
        author: article.author,
        language: article.language,
        content_type: article.content_type as ArticleCreate["content_type"],
        article_metadata: article.article_metadata ?? undefined,
    };
}

/**
 * Asked before a restore moves the endpoint a configured key talks to.
 *
 * Returning false keeps this device's endpoints; everything else in the
 * bundle still restores. An importer called WITHOUT this callback
 * declines on the user's behalf, because the alternative is pointing a
 * key at a host nobody chose with nothing on screen about it.
 */
export type BaseUrlConfirm = (changes: BaseUrlChange[]) => Promise<boolean>;

/**
 * The settings blob to write during a restore, with the live secrets kept.
 *
 * When the live settings cannot be read, the AI section is dropped from the
 * restore instead of being written blind: a scrubbed bundle's empty keys
 * would otherwise clear the ones this machine holds, which is the single
 * outcome #985 exists to prevent. Everything else in the bundle still
 * restores, so a failure here costs the AI config of the restore, not the
 * restore.
 */
async function mergeSettingsForRestore(
    storage: ReturnType<typeof getStorage>,
    restored: unknown,
    confirmBaseUrlChange?: BaseUrlConfirm,
): Promise<Record<string, unknown>> {
    try {
        const live = await storage.settings.getApp();
        const changes = baseUrlChangesBesideKeys(live, restored);
        if (changes.length > 0) {
            const accepted = confirmBaseUrlChange
                ? await confirmBaseUrlChange(changes)
                : false;
            if (!accepted) {
                return preserveLocalBaseUrls(live, restored) as Record<string, unknown>;
            }
        }
        return preserveLocalSecrets(live, restored) as Record<string, unknown>;
    } catch (err) {
        console.warn("Live settings unreadable; restoring without the AI section", err);
        const withoutAi = {...(restored as Record<string, unknown>)};
        delete withoutAi.ai;
        return withoutAi;
    }
}

/**
 * Import a full backup bundle through the storage seam (offline + online).
 *
 * Rules: settings are overwritten EXCEPT the author profile (never
 * overwritten — own identity); authors dedup by name/slug; every other
 * entity dedups by id and is skipped (never overwritten) when present.
 * Child entities (chapters, story entities, chapter labels) are
 * re-parented to the freshly-created book ids. Writing sessions are not
 * restorable (no seam create) and are intentionally not imported.
 *
 * @throws BackupImportError on an invalid / unsupported bundle.
 */
export async function importFullBackup(
    file: File,
    confirmBaseUrlChange?: BaseUrlConfirm,
): Promise<ImportResult> {
    const bundle = await parseBackupBundle(await file.text());
    const storage = getStorage();
    const data = bundle.data;
    const imported = zeroCounts();
    const skipped = zeroCounts();

    if (data.settings && typeof data.settings === "object") {
        // A bundle taken since #985 carries no provider key, so writing its
        // AI section straight over the live one would CLEAR the keys this
        // machine has. A restore puts the user back where they were; it
        // does not log them out of their AI provider. An older bundle still
        // carries real keys and still restores them - the rule is "empty
        // does not overwrite", not "never overwrite".
        const settings = {
            ...(await mergeSettingsForRestore(
                storage,
                data.settings,
                confirmBaseUrlChange,
            )),
        };
        delete settings.author;
        if (Object.keys(settings).length > 0) {
            await storage.settings.updateApp(settings);
            imported.settings = 1;
        }
    }

    const existingAuthors = await storage.authors.list({limit: 1000});
    const authorPlan = planAuthorsImport(data.authors ?? [], existingAuthors);
    for (const name of authorPlan.toCreate) {
        try {
            await storage.authors.create({name});
            imported.authors++;
        } catch {
            skipped.authors++;
        }
    }
    skipped.authors += authorPlan.skipped;

    const bookIdMap = new Map<string, string>();
    // Every child table is restored under a NEW parent id, so each level
    // needs its own old -> new map: pages for the entity links, chapters
    // for the chapter-scoped ones.
    const pageIdMap = new Map<string, string>();
    const entityIdMap = new Map<string, string>();
    const chapterIdMap = new Map<string, string>();
    const existingBookIds = new Set((await storage.books.list()).map((book) => book.id));
    for (const entry of data.books ?? []) {
        const book = entry.book;
        if (!book || existingBookIds.has(book.id)) {
            skipped.books++;
            continue;
        }
        const created = await storage.books.create(bookCreateFrom(book));
        await storage.books.update(created.id, bookRestoreFields(book));
        bookIdMap.set(book.id, created.id);
        imported.books++;
        const chapters = [...(entry.chapters ?? [])].sort(
            (left, right) => (left.position ?? 0) - (right.position ?? 0),
        );
        for (const chapter of chapters) {
            const newChapter = await storage.chapters.create(created.id, {
                title: chapter.title,
                content: chapter.content,
                chapter_type: chapter.chapter_type,
                position: chapter.position,
            });
            chapterIdMap.set(chapter.id, newChapter.id);
            imported.chapters++;
        }
        const pages = [...(entry.pages ?? [])].sort(
            (left, right) => (left.page?.position ?? 0) - (right.page?.position ?? 0),
        );
        for (const pageEntry of pages) {
            const page = pageEntry.page;
            if (!page) continue;
            const newPage = await storage.pages.create(created.id, {
                layout: page.layout,
                text_content: page.text_content,
                layout_config: page.layout_config,
                notes: page.notes,
                story_beat: page.story_beat as PageCreate["story_beat"],
                mood_color: page.mood_color,
                act_group: page.act_group,
            });
            pageIdMap.set(page.id, newPage.id);
            imported.pages++;
            for (const panelEntry of pageEntry.panels ?? []) {
                const panel = panelEntry.panel;
                if (!panel) continue;
                const newPanel = await storage.comics.createPanel(created.id, newPage.id, {
                    bounds: panel.bounds,
                    panel_config: panel.panel_config,
                });
                imported.comic_panels++;
                for (const bubble of panelEntry.bubbles ?? []) {
                    await storage.comics.createBubble(created.id, newPanel.id, {
                        bubble_type: bubble.bubble_type,
                        anchor: bubble.anchor,
                        width_pct: bubble.width_pct,
                        height_pct: bubble.height_pct,
                        tail_direction: bubble.tail_direction,
                        tail_position_pct: bubble.tail_position_pct,
                        tail_length_px: bubble.tail_length_px,
                        bubble_config: bubble.bubble_config,
                        text_content: bubble.text_content,
                    });
                    imported.comic_bubbles++;
                }
            }
        }
    }

    const existingArticleIds = new Set(
        (await storage.articles.list()).map((article) => article.id),
    );
    // Publications hang off articles under their NEW ids, the same way the
    // story-bible links hang off pages and chapters.
    const articleIdMap = new Map<string, string>();
    for (const article of data.articles ?? []) {
        if (existingArticleIds.has(article.id)) {
            skipped.articles++;
            continue;
        }
        const created = await storage.articles.create(articleCreateFrom(article));
        articleIdMap.set(article.id, created.id);
        await storage.articles.update(created.id, articleRestoreFields(article));
        imported.articles++;
    }

    for (const entity of data.story_bible?.entities ?? ([] as StoryEntityOut[])) {
        const newBookId = bookIdMap.get(entity.book_id);
        if (!newBookId) {
            skipped.story_entities++;
            continue;
        }
        const createdEntity = await storage.storyBible.createEntity(newBookId, {
            entity_type: entity.entity_type,
            name: entity.name,
            description: entity.description,
            entity_metadata: entity.entity_metadata,
            relationships: entity.relationships,
        });
        entityIdMap.set(entity.id, createdEntity.id);
        imported.story_entities++;
    }

    // Links last: they reference an entity AND a page or chapter, so all
    // three parents must already carry their new ids.
    for (const link of data.story_bible?.links ?? ([] as StoryEntityLinkOut[])) {
        const newEntityId = entityIdMap.get(link.entity_id);
        const newPageId = link.page_id ? pageIdMap.get(link.page_id) : null;
        const newChapterId = link.chapter_id ? chapterIdMap.get(link.chapter_id) : null;
        if (!newEntityId || (!newPageId && !newChapterId)) {
            skipped.story_entity_links++;
            continue;
        }
        await storage.storyBible.createLink({
            entity_id: newEntityId,
            page_id: newPageId ?? null,
            chapter_id: newChapterId ?? null,
            role: link.role,
            notes: link.notes,
        });
        imported.story_entity_links++;
    }

    for (const label of data.chapter_labels ?? ([] as ChapterLabel[])) {
        const newBookId = bookIdMap.get(label.book_id);
        if (!newBookId) {
            skipped.chapter_labels++;
            continue;
        }
        await storage.chapterLabels.create(newBookId, {name: label.name, color: label.color});
        imported.chapter_labels++;
    }

    for (const doc of data.aplus_documents ?? ([] as AplusDocumentRecord[])) {
        const newBookId = bookIdMap.get(doc.book_id);
        if (!newBookId) {
            skipped.aplus_documents++;
            continue;
        }
        await storage.aplusDocuments.save(newBookId, doc.language, {
            content_name: doc.content_name,
            short_description: doc.short_description,
            bullets: doc.bullets,
            modules: doc.modules,
        });
        imported.aplus_documents++;
    }

    for (const publication of data.publications ?? []) {
        const newArticleId = articleIdMap.get(publication.article_id);
        if (!newArticleId) {
            skipped.publications++;
            continue;
        }
        const created = await storage.publications.create(newArticleId, {
            platform: publication.platform,
            is_promo: publication.is_promo,
            platform_metadata: publication.platform_metadata,
            scheduled_at: publication.scheduled_at,
            notes: publication.notes,
        });
        // A create always lands as "planned". Re-running mark-published is
        // what restores the snapshot, and the snapshot is the whole point:
        // without it every restored row reads `out_of_sync` the moment the
        // panel opens, because drift compares that field to the article's
        // current content.
        if (publication.status === "published" || publication.status === "out_of_sync") {
            await storage.publications.markPublished(newArticleId, created.id, {
                published_at: publication.published_at,
            });
        } else if (publication.status !== "planned") {
            await storage.publications.update(newArticleId, created.id, {
                status: publication.status,
            });
        }
        imported.publications++;
    }

    for (const entry of data.kdp_publishing_state ?? []) {
        const newBookId = bookIdMap.get(entry.book_id);
        if (!newBookId) {
            skipped.kdp_publishing_state++;
            continue;
        }
        const state = entry.state;
        await storage.kdp.upsertPublishingState(newBookId, {
            royalty_plan: state.royalty_plan,
            kdp_select_enrolled: state.kdp_select_enrolled,
            kdp_select_enrollment_date: state.kdp_select_enrollment_date,
            expanded_distribution: state.expanded_distribution,
            prices: state.prices,
            launch_checklist_state: state.launch_checklist_state,
            publication_target_date: state.publication_target_date,
            last_kdp_upload_at: state.last_kdp_upload_at,
        });
        // addReviewer takes only the name and email; everything the
        // reviewer accumulated afterwards needs the follow-up update.
        for (const reviewer of state.arc_reviewers) {
            const createdReviewer = await storage.kdp.addReviewer(newBookId, {
                reviewer_name: reviewer.reviewer_name,
                reviewer_email: reviewer.reviewer_email,
            });
            await storage.kdp.updateReviewer(newBookId, createdReviewer.id, {
                review_status: reviewer.review_status,
                copy_version: reviewer.copy_version,
                review_permalink: reviewer.review_permalink,
                review_text_excerpt: reviewer.review_text_excerpt,
                reviewed_at: reviewer.reviewed_at,
            });
        }
        imported.kdp_publishing_state++;
    }

    // Last: a group needs every one of its books to exist under its new id,
    // and a partially-restored group would silently claim two books are
    // translations of each other when a third is missing.
    for (const group of data.translation_groups ?? []) {
        const newIds = group.map((oldId) => bookIdMap.get(oldId));
        if (newIds.some((id) => !id) || newIds.length < 2) {
            skipped.translation_groups++;
            continue;
        }
        await storage.translations.link(newIds as string[]);
        imported.translation_groups++;
    }

    return {imported, skipped};
}
