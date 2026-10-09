/**
 * Client-side `.bgb` (full-data backup) importer for the offline path (#99).
 *
 * A `.bgb` archive is a plain ZIP (`shutil.make_archive` on the backend) of
 * JSON + binary asset files - no Pandoc, no Git, no conversion - so it parses
 * entirely in the browser with `fflate`. Every write goes through the
 * `getStorage()` seam, so the import fires zero `/api` requests in Dexie mode.
 *
 * Restored entity set (the same as the JSON backup importer, plus the binary
 * assets the `.bgb` uniquely carries): app settings, books, chapters, book
 * assets, book COVER (the `cover_image` reference is re-pointed at the
 * restored bytes), articles, article FEATURED IMAGES, authors, story
 * entities, chapter labels. Because the Dexie seam mints fresh ids on create,
 * book ids are regenerated and the chapter asset URLs (`/api/books/<id>/...`)
 * are rewritten to the new book id; the asset bytes are cached under the new
 * id so the editor resolves them. The cover filename is preserved on cache,
 * so the original `assets/covers/cover-x.png` path still resolves under the
 * new id (the resolver reads only the trailing filename).
 *
 * Deliberately NOT restored yet (counted as `skipped` is not applicable since
 * they have no `imported` counterpart - they are simply ignored): the
 * FK-asset-id-dependent per-book graph (pages, comic panels/bubbles,
 * story-entity page links, chapter versions, writing sessions, publishing
 * state, arc reviewers, publications, comments, article assets, templates).
 * Faithfully restoring these needs an id-remap pass that the regenerate-on-
 * create seam does not support today; tracked as a follow-up.
 */


import type {
    ComicBubbleOut,
    ComicPanelOut,
    Page,
    PageCreate,
    StoryEntityLinkOut,
    Article,
    Asset,
    Author,
    Book,
    Chapter,
    StoryEntityCreate,
} from "../api/client";
import { articleCreateFrom, bookCreateFrom } from "../export/backupImport";
import { planAuthorsImport } from "../components/settings/authorsImportExport";
import {
    baseUrlChangesBesideKeys,
    preserveLocalBaseUrls,
    preserveLocalSecrets,
} from "../utils/ai/scrubSecrets";
import type { BaseUrlConfirm } from "../export/backupImport";
import { fromStoredRow, type AplusStoredRow } from "../lib/utils/aplus/aplusDocument";
import {
    childDirIds,
    openBgbArchive,
    readJsonEntry as readJson,
    type ZipEntries,
} from "./bgb/archive";
import { getStorage } from "../storage";
import { coverFilenameFromPath } from "../storage/asset-url";

/** Per-entity counts for a `.bgb` import outcome. */
export interface BgbImportCounts {
    settings: number;
    books: number;
    chapters: number;
    assets: number;
    articles: number;
    authors: number;
    story_entities: number;
    story_entity_links: number;
    chapter_labels: number;
    aplus_documents: number;
    pages: number;
    comic_panels: number;
    comic_bubbles: number;
}

/** Result of {@link importBgbFile}: what was created vs skipped. */
export interface BgbImportResult {
    imported: BgbImportCounts;
    skipped: BgbImportCounts;
}

/** Thrown when the file is not a recognised, supported `.bgb` archive. */
export class BgbImportError extends Error {}

const MIME_BY_EXT: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    avif: "image/avif",
    bmp: "image/bmp",
};

function zeroCounts(): BgbImportCounts {
    return {
        settings: 0,
        books: 0,
        chapters: 0,
        assets: 0,
        articles: 0,
        authors: 0,
        story_entities: 0,
        story_entity_links: 0,
        chapter_labels: 0,
        aplus_documents: 0,
        pages: 0,
        comic_panels: 0,
        comic_bubbles: 0,
    };
}

function mimeFor(filename: string): string {
    const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
    return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Wrap raw ZIP-entry bytes in a Blob via a concrete `ArrayBuffer` (fflate
 *  yields `Uint8Array<ArrayBufferLike>`, which is not a `BlobPart` directly). */
function bytesToBlob(bytes: Uint8Array, type: string): Blob {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Blob([buffer], { type });
}

/** Rewrite a chapter/cover's `/api/books/<old>/...` asset URLs onto the new
 *  book id so the cached bytes resolve after the book id was regenerated. */
function rewriteBookUrls(text: string, oldId: string, newId: string): string {
    return text.split(`/api/books/${oldId}/`).join(`/api/books/${newId}/`);
}

/**
 * Import a `.bgb` full-data backup file entirely client-side, through the
 * storage seam (offline-safe, zero `/api`).
 *
 * Dedups books + articles by their original id (skips when a live record
 * already carries that id). Child entities are re-parented onto the freshly
 * created book ids; asset bytes are cached under the new id and the chapter /
 * cover URLs are rewritten to match.
 *
 * @throws BgbImportError when the file is not a valid Bibliogon backup ZIP.
 */
export async function importBgbFile(
    file: File,
    confirmBaseUrlChange?: BaseUrlConfirm,
): Promise<BgbImportResult> {
    let archive: Awaited<ReturnType<typeof openBgbArchive>>;
    try {
        archive = await openBgbArchive(file);
    } catch {
        throw new BgbImportError("Beschädigte .bgb-Datei");
    }
    const { entries, prefix } = archive;
    const manifest = readJson<{ format?: string }>(entries, `${prefix}manifest.json`);
    if (manifest && manifest.format !== "bibliogon-backup") {
        throw new BgbImportError("Keine gültige Bibliogon-Backup-Datei");
    }

    const booksPrefix = `${prefix}books/`;
    const articlesPrefix = `${prefix}articles/`;
    const bookIds = childDirIds(entries, booksPrefix);
    const articleIds = childDirIds(entries, articlesPrefix);
    const hasAuthors = !!entries[`${prefix}globals/authors.json`];
    const hasSettings = !!entries[`${prefix}globals/settings.json`];
    if (
        !manifest &&
        bookIds.length === 0 &&
        articleIds.length === 0 &&
        !hasAuthors &&
        !hasSettings
    ) {
        throw new BgbImportError("Keine gültige Bibliogon-Backup-Datei");
    }

    const storage = getStorage();
    const imported = zeroCounts();
    const skipped = zeroCounts();

    await importSettings(entries, prefix, storage, imported, confirmBaseUrlChange);
    await importBooks(entries, booksPrefix, bookIds, storage, imported, skipped);
    await importArticles(entries, articlesPrefix, articleIds, storage, imported, skipped);
    await importAuthors(entries, prefix, storage, imported, skipped);

    return { imported, skipped };
}

type Storage = ReturnType<typeof getStorage>;

/**
 * Restore app settings from the client `.bgb` extension
 * (`globals/settings.json`). The author PROFILE is never overwritten (own
 * identity), mirroring the JSON-backup importer. Backend-produced archives
 * carry no settings file, so this is a no-op for them.
 *
 * The AI provider keys are merged rather than overwritten, for the same
 * reason as the JSON importer (#985): an archive taken since the export
 * scrubber carries empty keys, and writing those over the live settings
 * would clear the ones this machine holds. When the live settings cannot
 * be read the AI section is dropped instead of written blind.
 */
async function importSettings(
    entries: ZipEntries,
    prefix: string,
    storage: Storage,
    imported: BgbImportCounts,
    confirmBaseUrlChange?: BaseUrlConfirm,
): Promise<void> {
    const settings = readJson<Record<string, unknown>>(entries, `${prefix}globals/settings.json`);
    if (!settings || typeof settings !== "object") return;
    let next: Record<string, unknown>;
    try {
        const live = await storage.settings.getApp();
        const changes = baseUrlChangesBesideKeys(live, settings);
        const keepEndpoints =
            changes.length > 0 &&
            !(confirmBaseUrlChange ? await confirmBaseUrlChange(changes) : false);
        const merged = keepEndpoints
            ? preserveLocalBaseUrls(live, settings)
            : preserveLocalSecrets(live, settings);
        next = { ...(merged as Record<string, unknown>) };
    } catch (err) {
        console.warn("Live settings unreadable; restoring without the AI section", err);
        next = { ...settings };
        delete next.ai;
    }
    delete next.author;
    if (Object.keys(next).length === 0) return;
    await storage.settings.updateApp(next);
    imported.settings = 1;
}

/**
 * Apply ONLY the client settings extension (`globals/settings.json`) from a
 * `.bgb` archive.
 *
 * API mode restores the entity graph through the backend's
 * `/api/backup/import`, which knows nothing about that file — it is a client
 * extension this app writes on export. Without this the settings a user
 * backed up (theme, default language, editor prefs) are silently dropped on
 * restore, while the offline path restores them: the export would write
 * something no importer in that mode reads.
 *
 * The author PROFILE is preserved, exactly as in the full client import.
 * Returns whether a settings file was found and applied.
 */
export async function importBgbSettings(
    file: File,
    confirmBaseUrlChange?: BaseUrlConfirm,
): Promise<boolean> {
    let archive: Awaited<ReturnType<typeof openBgbArchive>>;
    try {
        archive = await openBgbArchive(file);
    } catch {
        throw new BgbImportError("Beschädigte .bgb-Datei");
    }
    const { entries, prefix } = archive;
    const counts: BgbImportCounts = zeroCounts();
    await importSettings(entries, prefix, getStorage(), counts, confirmBaseUrlChange);
    return counts.settings === 1;
}

async function importBooks(
    entries: ZipEntries,
    booksPrefix: string,
    bookIds: string[],
    storage: Storage,
    imported: BgbImportCounts,
    skipped: BgbImportCounts,
): Promise<void> {
    const existingBookIds = new Set((await storage.books.list()).map((b) => b.id));
    for (const oldId of bookIds.sort()) {
        const bookDir = `${booksPrefix}${oldId}/`;
        const book = readJson<Book>(entries, `${bookDir}book.json`);
        if (!book) continue;
        if (existingBookIds.has(book.id)) {
            skipped.books++;
            continue;
        }

        const created = await storage.books.create(bookCreateFrom(book));
        const newId = created.id;
        imported.books++;

        await importBookAssets(entries, bookDir, book, newId, storage, imported);
        const chapterIds = await importChapters(
            entries, bookDir, oldId, newId, storage, imported,
        );
        const entityIds = await importStoryEntities(entries, bookDir, newId, storage, imported);
        await importChapterLabels(entries, bookDir, newId, storage, imported);
        await importAplusDocuments(entries, bookDir, newId, storage, imported);
        const pageIds = await importPages(entries, bookDir, newId, storage, imported);
        await importEntityLinks(
            entries, bookDir, {entityIds, pageIds, chapterIds}, storage, imported, skipped,
        );
    }
}

async function importBookAssets(
    entries: ZipEntries,
    bookDir: string,
    book: Book,
    newBookId: string,
    storage: Storage,
    imported: BgbImportCounts,
): Promise<void> {
    const metas = readJson<Asset[]>(entries, `${bookDir}assets.json`) ?? [];
    const cachedFilenames = new Set<string>();
    for (const meta of metas) {
        const bytes = entries[`${bookDir}assets/${meta.filename}`];
        if (!bytes) continue;
        const blob = bytesToBlob(bytes, mimeFor(meta.filename));
        await storage.assets.cacheBlob(newBookId, meta.filename, blob, meta.asset_type);
        cachedFilenames.add(meta.filename);
        imported.assets++;
    }

    // Re-point the cover at the restored bytes. The cover filename is
    // preserved on cache, so the original `assets/covers/cover-x.png` path
    // still resolves under the regenerated book id (the resolver reads only
    // the trailing filename). Only set it when the bytes actually landed.
    const coverFilename = coverFilenameFromPath(book.cover_image);
    if (coverFilename && cachedFilenames.has(coverFilename)) {
        await storage.books.update(newBookId, { cover_image: book.cover_image });
    }
}

async function importChapters(
    entries: ZipEntries,
    bookDir: string,
    oldBookId: string,
    newBookId: string,
    storage: Storage,
    imported: BgbImportCounts,
): Promise<Map<string, string>> {
    const chaptersPrefix = `${bookDir}chapters/`;
    const chapters: Chapter[] = [];
    for (const path of Object.keys(entries)) {
        if (path.startsWith(chaptersPrefix) && path.endsWith(".json")) {
            const chapter = readJson<Chapter>(entries, path);
            if (chapter) chapters.push(chapter);
        }
    }
    chapters.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const idMap = new Map<string, string>();
    for (const chapter of chapters) {
        const content =
            typeof chapter.content === "string"
                ? rewriteBookUrls(chapter.content, oldBookId, newBookId)
                : chapter.content;
        const created = await storage.chapters.create(newBookId, {
            title: chapter.title,
            content,
            chapter_type: chapter.chapter_type,
            position: chapter.position,
        });
        idMap.set(chapter.id, created.id);
        imported.chapters++;
    }
    return idMap;
}

async function importStoryEntities(
    entries: ZipEntries,
    bookDir: string,
    newBookId: string,
    storage: Storage,
    imported: BgbImportCounts,
): Promise<Map<string, string>> {
    const entitiesData =
        readJson<Array<StoryEntityCreate & {id?: string}>>(
            entries,
            `${bookDir}story_entities.json`,
        ) ?? [];
    const idMap = new Map<string, string>();
    for (const entity of entitiesData) {
        const created = await storage.storyBible.createEntity(newBookId, {
            entity_type: entity.entity_type,
            name: entity.name,
            description: entity.description,
            entity_metadata: entity.entity_metadata,
            relationships: entity.relationships,
        });
        if (entity.id) idMap.set(entity.id, created.id);
        imported.story_entities++;
    }
    return idMap;
}

/**
 * Restore a book's pages with their comic panels and speech bubbles.
 *
 * The archive carries one flat file per level (`pages.json`,
 * `comic_panels.json`, `comic_bubbles.json`) in the layout the backend
 * importer already reads; children are matched to their new parent by
 * the id they carried at export time.
 *
 * @returns old page id -> new page id, for the entity links.
 */
async function importPages(
    entries: ZipEntries,
    bookDir: string,
    newBookId: string,
    storage: Storage,
    imported: BgbImportCounts,
): Promise<Map<string, string>> {
    const pages = readJson<Page[]>(entries, `${bookDir}pages.json`) ?? [];
    const pageIds = new Map<string, string>();
    if (!pages.length) return pageIds;

    const panels = readJson<ComicPanelOut[]>(entries, `${bookDir}comic_panels.json`) ?? [];
    const bubbles = readJson<ComicBubbleOut[]>(entries, `${bookDir}comic_bubbles.json`) ?? [];

    for (const page of [...pages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
        const created = await storage.pages.create(newBookId, {
            layout: page.layout,
            text_content: page.text_content,
            image_asset_id: page.image_asset_id,
            layout_config: page.layout_config,
            notes: page.notes,
            story_beat: page.story_beat as PageCreate["story_beat"],
            mood_color: page.mood_color,
            act_group: page.act_group,
        });
        pageIds.set(page.id, created.id);
        imported.pages++;

        for (const panel of panels.filter((p) => p.page_id === page.id)) {
            const newPanel = await storage.comics.createPanel(newBookId, created.id, {
                bounds: panel.bounds,
                panel_config: panel.panel_config,
            });
            imported.comic_panels++;
            for (const bubble of bubbles.filter((b) => b.panel_id === panel.id)) {
                await storage.comics.createBubble(newBookId, newPanel.id, {
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
    return pageIds;
}

/**
 * Restore the entity-page/chapter links once every parent has its new id.
 *
 * A link whose entity, page or chapter did not survive is counted as
 * skipped rather than dropped silently - it means the archive was
 * partial, and the caller reports the number.
 */
async function importEntityLinks(
    entries: ZipEntries,
    bookDir: string,
    maps: {
        entityIds: Map<string, string>;
        pageIds: Map<string, string>;
        chapterIds: Map<string, string>;
    },
    storage: Storage,
    imported: BgbImportCounts,
    skipped: BgbImportCounts,
): Promise<void> {
    const links =
        readJson<Array<Omit<StoryEntityLinkOut, "entity">>>(
            entries,
            `${bookDir}story_entity_page_links.json`,
        ) ?? [];
    for (const link of links) {
        const entityId = maps.entityIds.get(link.entity_id);
        const pageId = link.page_id ? maps.pageIds.get(link.page_id) : null;
        const chapterId = link.chapter_id ? maps.chapterIds.get(link.chapter_id) : null;
        if (!entityId || (!pageId && !chapterId)) {
            skipped.story_entity_links++;
            continue;
        }
        await storage.storyBible.createLink({
            entity_id: entityId,
            page_id: pageId ?? null,
            chapter_id: chapterId ?? null,
            role: link.role,
            notes: link.notes,
        });
        imported.story_entity_links++;
    }
}

async function importChapterLabels(
    entries: ZipEntries,
    bookDir: string,
    newBookId: string,
    storage: Storage,
    imported: BgbImportCounts,
): Promise<void> {
    const labels =
        readJson<Array<{ name: string; color: string }>>(
            entries,
            `${bookDir}chapter_labels.json`,
        ) ?? [];
    for (const label of labels) {
        await storage.chapterLabels.create(newBookId, {
            name: label.name,
            color: label.color,
        });
        imported.chapter_labels++;
    }
}

/** A+ documents (#891) in the backend row shape, written by both the
 *  backend's and the web app's `.bgb` exporter. */
async function importAplusDocuments(
    entries: ZipEntries,
    bookDir: string,
    newBookId: string,
    storage: Storage,
    imported: BgbImportCounts,
): Promise<void> {
    const rows = readJson<AplusStoredRow[]>(entries, `${bookDir}aplus_documents.json`) ?? [];
    for (const row of rows) {
        await storage.aplusDocuments.save(newBookId, row.language, fromStoredRow(row));
        imported.aplus_documents++;
    }
}

async function importArticles(
    entries: ZipEntries,
    articlesPrefix: string,
    articleIds: string[],
    storage: Storage,
    imported: BgbImportCounts,
    skipped: BgbImportCounts,
): Promise<void> {
    if (articleIds.length === 0) return;
    const existingArticleIds = new Set(
        (await storage.articles.list()).map((a) => a.id),
    );
    for (const id of articleIds.sort()) {
        const article = readJson<Article>(entries, `${articlesPrefix}${id}/article.json`);
        if (!article) continue;
        if (existingArticleIds.has(article.id)) {
            skipped.articles++;
            continue;
        }
        const created = await storage.articles.create(articleCreateFrom(article));
        const featuredImageAssetId = await importArticleAsset(
            entries,
            `${articlesPrefix}${id}/`,
            created.id,
            storage,
        );
        await storage.articles.update(created.id, {
            content_json: article.content_json,
            status: article.status,
            tags: article.tags,
            topic: article.topic,
            seo_title: article.seo_title,
            seo_description: article.seo_description,
            ...(featuredImageAssetId ? { featured_image_asset_id: featuredImageAssetId } : {}),
        });
        imported.articles++;
    }
}

/**
 * Restore an article's featured image: store the archived bytes through the
 * seam and return the freshly minted asset id to set on
 * `featured_image_asset_id`. Returns null when the archive carries no image
 * for this article (e.g. backend archives, or articles without one).
 */
async function importArticleAsset(
    entries: ZipEntries,
    articleDir: string,
    newArticleId: string,
    storage: Storage,
): Promise<string | null> {
    const metas =
        readJson<Array<{ filename: string; asset_type?: string }>>(
            entries,
            `${articleDir}assets.json`,
        ) ?? [];
    const meta = metas[0];
    if (!meta) return null;
    const bytes = entries[`${articleDir}assets/${meta.filename}`];
    if (!bytes) return null;
    const blob = bytesToBlob(bytes, mimeFor(meta.filename));
    try {
        return await storage.articleAssets.store(newArticleId, blob, meta.filename, blob.type);
    } catch {
        // api mode: articleAssets.store throws (server holds the bytes). The
        // featured_image_url in article.json keeps the online reference.
        return null;
    }
}

async function importAuthors(
    entries: ZipEntries,
    prefix: string,
    storage: Storage,
    imported: BgbImportCounts,
    skipped: BgbImportCounts,
): Promise<void> {
    const authors = readJson<Author[]>(entries, `${prefix}globals/authors.json`);
    if (!authors || authors.length === 0) return;
    const existing = await storage.authors.list({ limit: 1000 });
    const plan = planAuthorsImport(authors, existing);
    for (const name of plan.toCreate) {
        try {
            await storage.authors.create({ name });
            imported.authors++;
        } catch {
            skipped.authors++;
        }
    }
    skipped.authors += plan.skipped;
}
