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
/** YAML front-matter from the document's metadata (#605). Emits only the
 *  fields that are present; values are double-quoted with `"`/`\` escaped. */
function frontMatter(doc: ExportDocument): string {
  const q = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const lines: string[] = ["---"];
  lines.push(`title: ${q(doc.title)}`);
  if (doc.author?.trim()) lines.push(`author: ${q(doc.author.trim())}`);
  if (doc.publishDate?.trim()) lines.push(`date: ${q(doc.publishDate.trim())}`);
  if (doc.language?.trim()) lines.push(`language: ${q(doc.language.trim())}`);
  if (doc.description?.trim()) lines.push(`description: ${q(doc.description.trim())}`);
  if (doc.isbn?.trim()) lines.push(`isbn: ${q(doc.isbn.trim())}`);
  const categories = (doc.keywords ?? []).filter((k) => k.trim());
  if (categories.length > 0) {
    lines.push("categories:");
    for (const c of categories) lines.push(`  - ${q(c.trim())}`);
  }
  lines.push('generator: "Bibliogon"');
  lines.push("---", "");
  return lines.join("\n");
}

export function toMarkdown(doc: ExportDocument): string {
  const html = documentToBodyHtml(doc);
  const body = createTurndown().turndown(html).trim() + "\n";
  return frontMatter(doc) + "\n" + body;
}
