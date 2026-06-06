/**
 * Map Bibliogon's Book/Chapter and Article shapes onto the format-agnostic
 * `ExportDocument` (Maximal-Offline P2). One mapping place; every format
 * generator consumes the result.
 */

import type { Article, BookDetail, Chapter } from "../api/client";
import type { ExportDocument } from "./documentModel";
import { parseTipTap } from "./documentModel";

/** A prose book becomes title + one section per chapter (position order). */
export function buildBookDocument(
  book: BookDetail,
  chapters: Chapter[],
): ExportDocument {
  const ordered = [...chapters].sort((a, b) => a.position - b.position);
  return {
    title: book.title,
    subtitle: book.subtitle ?? undefined,
    author: book.author ?? undefined,
    language: book.language ?? undefined,
    sections: ordered.map((chapter) => ({
      heading: chapter.title,
      doc: parseTipTap(chapter.content),
    })),
  };
}

/** An article becomes title + a single body section (the title already heads
 *  the output, so the section heading is empty). */
export function buildArticleDocument(article: Article): ExportDocument {
  return {
    title: article.title,
    subtitle: article.subtitle ?? undefined,
    author: article.author ?? undefined,
    language: article.language ?? undefined,
    sections: [{ heading: "", doc: parseTipTap(article.content_json) }],
  };
}
