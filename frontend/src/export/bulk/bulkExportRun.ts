/**
 * The one place that decides whether a bulk export runs in the browser or
 * on the backend (#743).
 *
 * Same shape as `runStyleCheck`: the pure half lives in `bulkExport.ts`,
 * and this module is the thin seam-aware wrapper that loads the documents
 * and picks the path. Keeping the branch in exactly one place is what kept
 * #1042 from happening twice - a second branch is a second thing to forget
 * when the contract changes.
 *
 * In Dexie mode every read goes through `getStorage()`, so the whole
 * operation fires no `/api` request. Online it still calls the backend's
 * Pandoc loop, because that is what produces LaTeX-grade PDFs and the
 * user chose the backend engine.
 *
 * @example
 * const { blob, filename } = await runBookBulkExport(ids, "epub", setProgress);
 * downloadBlob(blob, filename);
 */

import { api } from "../../api/client";
import { getStorage } from "../../storage";
import {
    type BulkExportProgressCallback,
    buildBulkZip,
    bulkArchiveFilename,
    combineArticleDocuments,
    combinedFilename,
} from "./bulkExport";
import { buildArticleDocument, buildBookDocument } from "../buildExportDocument";
import type { ExportFormat } from "../documentModel";
import { renderExport } from "../index";

/** A finished bulk export: the bytes plus the name to download them under. */
export interface BulkExportResult {
    blob: Blob;
    filename: string;
}

/** The formats the Books dashboard's bulk export offers. */
export type BookBulkFormat = Extract<ExportFormat, "epub" | "pdf" | "docx">;

/** The formats + output modes the Articles dashboard's bulk export offers. */
export type ArticleBulkFormat = Extract<
    ExportFormat,
    "markdown" | "html" | "pdf" | "docx"
>;
export type ArticleBulkMode = "zip" | "combined";

/**
 * Export several books as one archive.
 *
 * ZIP only, in both modes, for the reason the backend route gives: a
 * single document merged from N books would have to decide whose metadata
 * wins and which one contributes the cover.
 */
export async function runBookBulkExport(
    bookIds: string[],
    format: BookBulkFormat,
    onProgress?: BulkExportProgressCallback,
): Promise<BulkExportResult> {
    const storage = getStorage();
    if (storage.mode !== "dexie") {
        return api.books.bulkExport(bookIds, format);
    }
    // `true` asks for the chapter CONTENT, which in-browser rendering needs
    // and the Pandoc path does not.
    const books = [];
    for (const id of bookIds) {
        const book = await storage.books.get(id, true);
        books.push(buildBookDocument(book, book.chapters));
    }
    return {
        blob: await buildBulkZip(books, format, onProgress),
        filename: bulkArchiveFilename("books"),
    };
}

/**
 * Export several articles as one archive or one combined document.
 *
 * `combined` merges them into a single document whose sections are the
 * articles, so every format's own generator builds the table of contents -
 * where the backend concatenates Markdown and hands it to Pandoc with
 * `--toc`. Same sections in the same order, different bytes.
 */
export async function runArticleBulkExport(
    articleIds: string[],
    format: ArticleBulkFormat,
    mode: ArticleBulkMode,
    onProgress?: BulkExportProgressCallback,
    combinedTitle = "Articles",
): Promise<BulkExportResult> {
    const storage = getStorage();
    if (storage.mode !== "dexie") {
        return api.articles.bulkExport(articleIds, format, mode);
    }
    const articles = [];
    for (const id of articleIds) {
        articles.push(buildArticleDocument(await storage.articles.get(id)));
    }
    if (mode === "zip") {
        return {
            blob: await buildBulkZip(articles, format, onProgress),
            filename: bulkArchiveFilename("articles"),
        };
    }
    onProgress?.({step: "rendering", current: 0, total: 1, title: combinedTitle});
    const { bytes, filename, mime } = await renderExport(
        combineArticleDocuments(articles, combinedTitle),
        format,
    );
    onProgress?.({step: "archiving", current: 1, total: 1});
    return {
        blob: new Blob([bytes as BlobPart], { type: mime }),
        // Not `renderExport`'s filename: that one is slugified from the
        // combined title, and the backend date-stamps this file so a user
        // can sort several exports without renaming.
        filename: combinedFilename("articles", filename.split(".").pop() ?? format),
    };
}
