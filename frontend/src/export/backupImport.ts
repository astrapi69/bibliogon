import {
    type Article,
    type ArticleCreate,
    type Book,
    type BookCreate,
    type ChapterLabel,
    type PageCreate,
    type StoryEntityLinkOut,
    type StoryEntityOut,
} from "../api/client";
import type {AplusDocumentRecord} from "../api/platform";
import {getStorage} from "../storage";
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
export async function importFullBackup(file: File): Promise<ImportResult> {
    const bundle = await parseBackupBundle(await file.text());
    const storage = getStorage();
    const data = bundle.data;
    const imported = zeroCounts();
    const skipped = zeroCounts();

    if (data.settings && typeof data.settings === "object") {
        const settings = {...(data.settings as Record<string, unknown>)};
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
    for (const article of data.articles ?? []) {
        if (existingArticleIds.has(article.id)) {
            skipped.articles++;
            continue;
        }
        const created = await storage.articles.create(articleCreateFrom(article));
        await storage.articles.update(created.id, {
            content_json: article.content_json,
            status: article.status,
            tags: article.tags,
            topic: article.topic,
            seo_title: article.seo_title,
            seo_description: article.seo_description,
        });
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

    return {imported, skipped};
}
