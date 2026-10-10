/**
 * The `.biblio.yaml` round-trip, offline (#745 stage 3).
 *
 * The desktop app does this through `GET`/`POST
 * /api/{books,articles}/{id}/ai-template`. These two functions do the
 * same work in the browser: read the record through the storage seam,
 * build the file with the ported factory, and - on the way back - apply
 * it with the ported rules and write the patch through the seam.
 *
 * Everything that decides what the file says or what it does lives in
 * `lib/ai/template/` and is pinned against the endpoints' own recorded
 * responses. What is here is the part that needs the app: the seam, and
 * the `AiTemplateImportResult` shape the panel already renders.
 *
 * Lives in `ai/template/` rather than beside the other `ai/` modules
 * because the folder ratchet caps `ai/` at its current file count, and a
 * sub-package for the template's seam half is the shape the God-Folder
 * campaign asks for anyway.
 *
 * @example
 * const {blob, filename} = await exportTemplateOffline("book", bookId);
 * const result = await importTemplateOffline("book", bookId, yaml, false);
 */

import type { AiTemplateImportResult } from "../../api/client";
import { applyTemplate } from "../../lib/ai/template/apply";
import {
  buildArticleTemplateFromRecord,
  buildBookTemplateFromRecord,
  type ArticleTemplateSource,
  type BookTemplateSource,
} from "../../lib/ai/template/factories";
import { templateFilename } from "../../lib/ai/template/filename";
import { TemplateSchemaError } from "../../lib/ai/template/models";
import { parseTemplate, serializeTemplate } from "../../lib/ai/template/yaml";
import { getStorage } from "../../storage";

export type TemplateKind = "article" | "book";

/** Build the downloadable template for one record, read via the seam. */
export async function exportTemplateOffline(
  kind: TemplateKind,
  id: string,
): Promise<{ blob: Blob; filename: string }> {
  const storage = getStorage();
  let yamlText: string;
  let title: string;
  if (kind === "article") {
    const article = await storage.articles.get(id);
    title = article.title;
    yamlText = serializeTemplate(
      buildArticleTemplateFromRecord(article as unknown as ArticleTemplateSource),
    );
  } else {
    const book = await storage.books.get(id);
    // Ordered by position, like the endpoint's `book.chapters`, so the
    // preview reads as the book does.
    const chapters = await storage.chapters.list(id);
    title = book.title;
    yamlText = serializeTemplate(
      buildBookTemplateFromRecord(
        book as unknown as BookTemplateSource,
        chapters.map((chapter) => chapter.content),
      ),
    );
  }
  return {
    // `text/yaml; charset=utf-8`, matching the response the desktop
    // path hands the same download helper.
    blob: new Blob([yamlText], { type: "text/yaml; charset=utf-8" }),
    filename: templateFilename(title, kind),
  };
}

/**
 * Apply a filled template to one record, writing through the seam.
 *
 * Returns what the endpoint returns, so the panel's toasts and its
 * dropped-summaries notice need no offline branch of their own.
 *
 * @throws TemplateSchemaError when the file is not a template of this
 * kind - the same 400 the endpoint answers, raised where the caller can
 * tell it apart from a storage failure.
 */
export async function importTemplateOffline(
  kind: TemplateKind,
  id: string,
  yamlText: string,
  force: boolean,
): Promise<AiTemplateImportResult> {
  const template = parseTemplate(yamlText);
  if (template.type !== kind) {
    throw new TemplateSchemaError(
      `Template type is '${template.type}'; this record is a ${kind}`,
    );
  }
  const storage = getStorage();

  if (kind === "article") {
    const article = await storage.articles.get(id);
    const applied = applyTemplate(template, article as unknown as Record<string, unknown>, {
      force,
    });
    if (applied.updated.length) {
      await storage.articles.update(id, applied.patch);
    }
    return {
      article_id: id,
      updated_fields: applied.updated,
      skipped_fields: Object.keys(applied.skipped),
      skip_reasons: applied.skipped,
      force,
    } as AiTemplateImportResult;
  }

  const book = await storage.books.get(id);
  const chapters = await storage.chapters.list(id);
  const applied = applyTemplate(template, book as unknown as Record<string, unknown>, {
    force,
    chapters: chapters.map((chapter) => ({ id: chapter.id, title: chapter.title })),
  });
  if (applied.updated.length) {
    await storage.books.update(id, applied.patch);
  }
  return {
    book_id: id,
    updated_fields: applied.updated,
    skipped_fields: Object.keys(applied.skipped),
    skip_reasons: applied.skipped,
    dropped_chapter_summaries: applied.droppedChapterSummaries,
    force,
  } as AiTemplateImportResult;
}
