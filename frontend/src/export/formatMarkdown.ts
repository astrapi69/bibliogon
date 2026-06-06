/**
 * Markdown export (Maximal-Offline P2).
 *
 * Per the agreed library choice, Markdown is produced by converting the
 * export model's body HTML (title + section headings + rich content) with
 * `turndown`. Reusing the HTML assembler keeps a single source of truth for
 * structure (the HTML walker), so MD and HTML can never drift in coverage.
 */

import TurndownService from "turndown";

import type { ExportDocument } from "./documentModel";
import { documentToBodyHtml } from "./formatHtml";

function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  return service;
}

/** Convert the export model to a GitHub-flavoured-ish Markdown string. */
export function toMarkdown(doc: ExportDocument): string {
  const html = documentToBodyHtml(doc);
  return createTurndown().turndown(html).trim() + "\n";
}
