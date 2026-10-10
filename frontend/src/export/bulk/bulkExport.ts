/**
 * Client-side bulk export: many documents, one archive or one combined
 * document (#743).
 *
 * `POST /books/bulk-export` and `POST /articles/bulk-export` loop Pandoc
 * server-side, so the multi-select Export buttons were desktop-only. This
 * does the same two shapes in the browser on top of the existing export
 * engine - {@link renderExport} per document for the ZIP, one merged
 * {@link ExportDocument} for the combined document - so neither path is a
 * second renderer that can drift from the single-file one.
 *
 * Archive layout mirrors the backend so a user cannot tell which path
 * produced their file: `<kind>-YYYY-MM-DD.zip`, one `<slug>.<ext>` per
 * document, and a numeric suffix when two titles slugify the same.
 *
 * What deliberately differs: the backend builds its combined document by
 * concatenating per-article Markdown and handing it to Pandoc with
 * `--toc`. Here the merge happens one level up, on the document model, so
 * every format gets the same structure from its own generator rather than
 * from a Markdown round-trip. Same sections in the same order; the bytes
 * are not identical, and a combined PDF is laid out by pdfmake rather than
 * by LaTeX.
 *
 * @example
 * const blob = await buildBulkZip(docs, "epub", (p) => setProgress(p));
 * downloadBlob(blob, bulkArchiveFilename("books"));
 */

import { zipSync } from "fflate";

import type { ExportDocument, ExportFormat } from "../documentModel";
import { slugifyFilename } from "../download";
import { renderExport } from "../index";

/** Which dashboard a bulk export came from; names the output file. */
export type BulkExportKind = "books" | "articles";

/** Progress while a bulk export runs. `current` counts finished documents. */
export interface BulkExportProgress {
    step: "rendering" | "archiving";
    current: number;
    total: number;
    /** Title of the document being rendered, for a live label. */
    title?: string;
}

/** Receives {@link BulkExportProgress} updates during a bulk export. */
export type BulkExportProgressCallback = (progress: BulkExportProgress) => void;

function isoDay(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10);
}

/**
 * Archive entry names for `titles`, in order.
 *
 * Two books called "Der Kater" and "Der Käter" slugify the same, and a ZIP
 * with a duplicate entry name loses one of them silently. The second
 * encounter becomes `<slug>-2`, the third `<slug>-3`, matching the
 * backend's convention so the two paths produce the same archive.
 */
export function zipEntryNames(titles: string[], ext: string): string[] {
    const seen = new Map<string, number>();
    return titles.map((title) => {
        const base = slugifyFilename(title);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        return count === 0 ? `${base}.${ext}` : `${base}-${count + 1}.${ext}`;
    });
}

/** `books-2026-10-10.zip` / `articles-2026-10-10.zip`. */
export function bulkArchiveFilename(kind: BulkExportKind, now?: Date): string {
    return `${kind}-${isoDay(now)}.zip`;
}

/** `articles-2026-10-10.epub` - the combined document's name. */
export function combinedFilename(
    kind: BulkExportKind,
    ext: string,
    now?: Date,
): string {
    return `${kind}-${isoDay(now)}.${ext}`;
}

/**
 * Render every document and pack them into one ZIP.
 *
 * Sequential, not `Promise.all`: a PDF or EPUB generator holds its whole
 * output in memory, and twenty of them at once is how a tab runs out of
 * it. The progress callback is what makes the wait legible instead.
 *
 * A document that fails to render aborts the export rather than producing
 * a quietly incomplete archive - the same fail-loud contract the backend
 * has, where one broken book fails the whole call with its title in the
 * message.
 */
export async function buildBulkZip(
    docs: ExportDocument[],
    format: ExportFormat,
    onProgress?: BulkExportProgressCallback,
): Promise<Blob> {
    const rendered: { bytes: Uint8Array; ext: string }[] = [];
    for (const [index, doc] of docs.entries()) {
        onProgress?.({
            step: "rendering",
            current: index,
            total: docs.length,
            title: doc.title,
        });
        try {
            const result = await renderExport(doc, format);
            rendered.push({
                bytes: result.bytes,
                ext: result.filename.split(".").pop() ?? format,
            });
        } catch (err) {
            // Name the document. "Export failed" over a 40-book selection
            // tells the user nothing they can act on.
            throw new Error(
                `Failed exporting ${JSON.stringify(doc.title)}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
                { cause: err },
            );
        }
    }

    onProgress?.({ step: "archiving", current: docs.length, total: docs.length });
    const ext = rendered[0]?.ext ?? format;
    const names = zipEntryNames(
        docs.map((doc) => doc.title),
        ext,
    );
    const entries: Record<string, Uint8Array> = {};
    names.forEach((name, index) => {
        entries[name] = rendered[index].bytes;
    });
    return new Blob([zipSync(entries) as BlobPart], { type: "application/zip" });
}

/**
 * Merge article documents into one, each article becoming a section.
 *
 * Articles only, like the backend's `mode=combined`, which books do not
 * offer. The reason is in the book bulk-export route and still holds:
 * merging N books into one document means deciding whose metadata wins
 * and which one contributes the cover, and neither has a right answer.
 * N articles under one heading each is a thing people actually want.
 *
 * Metadata comes from `title` plus the first article, for the same
 * reason; the backend sidesteps it by emitting a bare concatenation with
 * no metadata at all.
 *
 * An article's body is one unnamed section, so its own title becomes the
 * section heading - which is what gives the combined PDF and DOCX a table
 * of contents with one entry per article, the point of the backend's
 * `--toc`. An article that already carries named sections keeps them.
 */
export function combineArticleDocuments(
    docs: ExportDocument[],
    title: string,
): ExportDocument {
    const first = docs[0];
    return {
        title,
        author: first?.author,
        language: first?.language,
        kind: "book",
        sections: docs.flatMap((doc) =>
            doc.sections.length === 1 && !doc.sections[0].heading
                ? [{ heading: doc.title, doc: doc.sections[0].doc }]
                : doc.sections,
        ),
    };
}
