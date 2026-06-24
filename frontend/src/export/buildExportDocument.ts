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
  const keywords = [...(book.keywords ?? []), ...(book.categories ?? [])]
    .map((k) => k.trim())
    .filter(Boolean);
  return {
    title: book.title,
    subtitle: book.subtitle ?? undefined,
    author: book.author ?? undefined,
    language: book.language ?? undefined,
    kind: "book",
    description: book.description ?? undefined,
    keywords: keywords.length > 0 ? Array.from(new Set(keywords)) : undefined,
    genre: book.genre ?? undefined,
    isbn: book.isbn_ebook || book.isbn_paperback || book.isbn_hardcover || undefined,
    publishDate: book.publish_date ?? undefined,
    publisher: book.publisher ?? undefined,
    sections: ordered.map((chapter) => ({
      heading: chapter.title,
      doc: parseTipTap(chapter.content),
    })),
  };
}

/** An article becomes title + a single body section (the title already heads
 *  the output, so the section heading is empty). */
export function buildArticleDocument(article: Article): ExportDocument {
  const tags = (article.tags ?? []).map((tg) => tg.trim()).filter(Boolean);
  return {
    title: article.title,
    subtitle: article.subtitle ?? undefined,
    author: article.author ?? undefined,
    language: article.language ?? undefined,
    kind: "article",
    description: article.seo_description ?? article.excerpt ?? undefined,
    keywords: tags.length > 0 ? tags : undefined,
    genre: article.topic ?? undefined,
    sections: [{ heading: "", doc: parseTipTap(article.content_json) }],
  };
}
