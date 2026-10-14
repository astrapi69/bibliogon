/**
 * Import a write-book-template project archive in the browser (#736).
 *
 * The orchestrator: unzip, read the project, and write a book with its
 * chapters and assets through the storage seam - so the same code imports a
 * `.bgp` on the desktop and on the backendless Pages build, with no `/api`
 * call of its own.
 *
 * The decisions live in the ported planners beside this file, each pinned
 * against what the backend produced for the same 17 projects
 * (`wbtImport.parity.json`): `metadata` for the book's fields, `chapters` for
 * which files become chapters in which order, `assets` for which images come
 * along and which one is the cover. This module only carries them out.
 *
 * Chapter content is stored as a TipTap document, not as HTML. That is what
 * every other client importer does (`chapterImporters`, and the GitHub repo
 * import through it), and it is the shape that avoids #787 - where imported
 * HTML stays HTML in the database until somebody opens and saves each
 * chapter, which for most books never happens.
 *
 * @example
 * const result = await importWbtArchive(file);
 * navigate(`/book/${result.bookId}`);
 */

import { unzipSync } from "fflate";
import { marked } from "marked";

import { sanitizeText } from "../../lib/utils/content/sanitizeText";
import { getStorage } from "../../storage";
import { htmlToTipTapDoc } from "../htmlToTipTap";
import { planAssets, chooseCoverImage, type PlannedAsset } from "./assets";
import { planChapters, readSectionOrder } from "./chapters";
import { parseMetadataYaml, parseProjectMetadata } from "./metadata";
import { buildProjectTree, findProjectRoot, WBT_MARKER, type ProjectTree } from "./projectFiles";

/** What the import produced, for the caller's summary. */
export interface WbtImportResult {
    bookId: string;
    bookTitle: string;
    chapterCount: number;
    assetCount: number;
}

/** The archive's filename stem, which stands in for the backend's project
 *  directory name when `metadata.yaml` declares no title. */
function stemOf(filename: string): string {
    const base = filename.split(/[\\/]/).pop() ?? filename;
    const dot = base.lastIndexOf(".");
    return (dot > 0 ? base.slice(0, dot) : base).trim() || base;
}

/**
 * True when these bytes look like a write-book-template project archive.
 *
 * The marker is the same one the backend's handler uses - a
 * `config/metadata.yaml`, at the top level or one directory down - so a ZIP
 * that is a Medium export or a `.bgb` backup is not claimed by this importer.
 */
export function isWbtArchive(entries: Record<string, Uint8Array>): boolean {
    const root = findProjectRoot(Object.keys(entries));
    if (root === null) return false;
    return Object.keys(entries).some(
        (name) => name.replace(/\\/g, "/").replace(/^\/+/, "") === `${root}${WBT_MARKER}`,
    );
}

/** Unzip the archive into the raw entry map the tree is built from. */
export function readArchiveEntries(bytes: Uint8Array): Record<string, Uint8Array> {
    return unzipSync(bytes);
}

/**
 * The keywords as the UPDATE payload wants them: a list.
 *
 * `ProjectMetadata.keywords` is the JSON string the Book COLUMN stores, which
 * is what the parity record pins and what the backend writes. The seam's
 * update payload takes the array instead and re-encodes it per deployment, so
 * this is the one place the two shapes meet. A malformed value - which the
 * parser cannot produce, but a hand-edited backup could - degrades to no
 * keywords rather than failing the whole import.
 */
function parseKeywords(encoded: string | null): string[] | undefined {
    if (!encoded) return undefined;
    try {
        const parsed: unknown = JSON.parse(encoded);
        return Array.isArray(parsed) ? parsed.map(String) : undefined;
    } catch {
        return undefined;
    }
}

/** One chapter's markdown turned into the document the editor stores. */
function chapterContent(markdown: string, language: string): string {
    const { sanitized } = sanitizeText(markdown.trim(), { language });
    const html = marked.parse(sanitized, { async: false }) as string;
    return JSON.stringify(htmlToTipTapDoc(html));
}

async function writeChapters(
    tree: ProjectTree,
    bookId: string,
    language: string,
): Promise<number> {
    const storage = getStorage();
    const planned = planChapters(tree, readSectionOrder(tree));
    for (const chapter of planned) {
        await storage.chapters.create(bookId, {
            title: chapter.title,
            content: chapterContent(tree.text(chapter.path) ?? "", language),
            position: chapter.position,
            chapter_type: chapter.chapter_type,
        });
    }
    return planned.length;
}

/**
 * Upload every planned asset, and report the ones that actually landed.
 *
 * The cover is chosen from THIS list rather than from the plan, so a file the
 * archive listed but could not supply cannot become a cover that resolves to
 * nothing - which is the failure the backend's own cover validation exists to
 * prevent, one layer further down.
 */
async function writeAssets(tree: ProjectTree, bookId: string): Promise<PlannedAsset[]> {
    const storage = getStorage();
    const uploaded: PlannedAsset[] = [];
    for (const asset of planAssets(tree)) {
        const bytes = tree.bytes(asset.path);
        if (!bytes) continue;
        // A File rather than a Blob: `assets.upload` reads `.name` for the
        // stored filename, and the seam's api backend posts it as multipart.
        const file = new File([bytes as BlobPart], asset.filename);
        await storage.assets.upload(bookId, file, asset.asset_type);
        uploaded.push(asset);
    }
    return uploaded;
}

/**
 * Import one write-book-template archive as a new book.
 *
 * Throws when the bytes are not a readable archive, or carry no project root
 * - the caller turns that into the user's error message rather than a
 * half-written book.
 */
export async function importWbtArchive(file: File | Blob): Promise<WbtImportResult> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const entries = readArchiveEntries(bytes);
    const tree = buildProjectTree(entries);

    const fallbackTitle = stemOf(file instanceof File ? file.name : "import");
    const metadata = parseProjectMetadata(parseMetadataYaml(tree), tree, fallbackTitle);

    const storage = getStorage();
    const book = await storage.books.create({
        title: metadata.title,
        subtitle: metadata.subtitle ?? undefined,
        author: metadata.author,
        language: metadata.language,
        series: metadata.series ?? undefined,
        series_index: metadata.series_index ?? undefined,
        description: metadata.description ?? undefined,
        book_type: "prose",
    });

    const chapterCount = await writeChapters(tree, book.id, metadata.language);
    const uploadedAssets = await writeAssets(tree, book.id);

    // After the assets on purpose: the cover is validated against what was
    // uploaded, so a metadata reference to a file the project did not ship
    // is replaced rather than stored as a dead path.
    await storage.books.update(book.id, {
        edition: metadata.edition,
        publisher: metadata.publisher,
        publisher_city: metadata.publisher_city,
        publish_date: metadata.publish_date,
        isbn_ebook: metadata.isbn_ebook,
        isbn_paperback: metadata.isbn_paperback,
        isbn_hardcover: metadata.isbn_hardcover,
        asin_ebook: metadata.asin_ebook,
        asin_paperback: metadata.asin_paperback,
        asin_hardcover: metadata.asin_hardcover,
        keywords: parseKeywords(metadata.keywords),
        html_description: metadata.html_description,
        backpage_description: metadata.backpage_description,
        backpage_author_bio: metadata.backpage_author_bio,
        custom_css: metadata.custom_css,
        cover_image: chooseCoverImage(metadata.cover_image, uploadedAssets),
    });

    return {
        bookId: book.id,
        bookTitle: metadata.title,
        chapterCount,
        assetCount: uploadedAssets.length,
    };
}
