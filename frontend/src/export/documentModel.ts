/**
 * Client-side export document model (Maximal-Offline P2).
 *
 * A backend-free, format-agnostic intermediate that both books (title +
 * chapters) and articles (title + single body) map onto. Every format
 * generator (Markdown / HTML / Text / PDF / EPUB / DOCX) consumes this one
 * shape, so the book/article-to-format mapping lives in exactly one place.
 *
 * `doc` is the parsed TipTap JSON of a chapter/article body. Parsing is done
 * once here (see `parseTipTap`) so each generator walks a real object, never
 * a JSON string.
 */

/** A TipTap document/node as stored in the DB (loose by design — the walkers
 *  read `type` / `content` / `attrs` / `marks` defensively). */
export type TipTapNode = Record<string, unknown>;

export interface ExportSection {
  /** Section heading (a book chapter's title; empty for a single-body
   *  article where the document title already heads the output). */
  heading: string;
  /** Parsed TipTap document for this section's body. */
  doc: TipTapNode;
}

export interface ExportDocument {
  title: string;
  subtitle?: string;
  author?: string;
  /** BCP47-ish language code (e.g. "de"); used for EPUB metadata. */
  language?: string;
  /** Source kind. Drives format-specific structure that depends on it
   *  (e.g. LaTeX uses `\documentclass{book}` + `\chapter` for books,
   *  `\documentclass{article}` + `\section` for articles). Defaults to
   *  book-style when absent. */
  kind?: "book" | "article";
  sections: ExportSection[];
}

/** The export formats offered by the client-side engine. */
export type ExportFormat =
  | "markdown"
  | "html"
  | "text"
  | "pdf"
  | "epub"
  | "docx"
  | "latex";

/**
 * Parse a stored TipTap `content_json` string into a node tree. Tolerates an
 * already-parsed object, an empty string, and malformed JSON (returns an
 * empty doc) so a single bad chapter can never abort a whole-book export.
 */
export function parseTipTap(contentJson: string | TipTapNode | null | undefined): TipTapNode {
  const empty: TipTapNode = { type: "doc", content: [] };
  if (!contentJson) return empty;
  if (typeof contentJson !== "string") return contentJson;
  try {
    const parsed = JSON.parse(contentJson);
    return parsed && typeof parsed === "object" ? (parsed as TipTapNode) : empty;
  } catch {
    return empty;
  }
}
