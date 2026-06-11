import {
    type Article,
    type ArticleCreate,
    type Book,
    type BookCreate,
    type ChapterLabel,
    type StoryEntityOut,
} from "../api/client";
import {getStorage} from "../storage";
import {planAuthorsImport} from "../components/settings/authorsImportExport";
import {BACKUP_BUNDLE_VERSION, type BackupBundleV1} from "./backupExport";

/** Per-entity counts for an import outcome. */
export interface ImportCounts {
    settings: number;
    authors: number;
    books: number;
    chapters: number;
    articles: number;
    story_entities: number;
    chapter_labels: number;
}

/** Result of {@link importFullBackup}: what was created vs skipped. */
export interface ImportResult {
    imported: ImportCounts;
    skipped: ImportCounts;
}

/** Thrown by {@link parseBackupBundle} when the input is not a
 *  recognised, supported backup bundle. */
export class BackupImportError extends Error {}

function zeroCounts(): ImportCounts {
    return {
        settings: 0,
        authors: 0,
        books: 0,
        chapters: 0,
        articles: 0,
        story_entities: 0,
        chapter_labels: 0,
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
        candidate.version !== BACKUP_BUNDLE_VERSION ||
        typeof candidate.data !== "object" ||
        candidate.data === null
    ) {
        throw new BackupImportError("bad-shape");
    }
    return candidate as BackupBundleV1;
}

function bookCreateFrom(book: Book): BookCreate {
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

function articleCreateFrom(article: Article): ArticleCreate {
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
            await storage.chapters.create(created.id, {
                title: chapter.title,
                content: chapter.content,
                chapter_type: chapter.chapter_type,
                position: chapter.position,
            });
            imported.chapters++;
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
        await storage.storyBible.createEntity(newBookId, {
            entity_type: entity.entity_type,
            name: entity.name,
            description: entity.description,
            entity_metadata: entity.entity_metadata,
            relationships: entity.relationships,
        });
        imported.story_entities++;
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

    return {imported, skipped};
}
