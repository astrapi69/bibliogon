/**
 * HTML export (Maximal-Offline P2).
 *
 * `documentToBodyHtml` builds the title + per-section body HTML shared by the
 * HTML and Markdown generators (Markdown runs it through turndown).
 * `toHtml` wraps it in a minimal, self-contained, readable HTML page.
 */

import type { ExportDocument } from "./documentModel";
import { escapeHtml, tiptapDocToHtml } from "./tiptapToHtml";

/** Title + optional subtitle/author + each section (heading + body) as a
 *  single HTML fragment (no <html>/<head> chrome). */
export function documentToBodyHtml(doc: ExportDocument): string {
  const parts: string[] = [`<h1>${escapeHtml(doc.title)}</h1>`];
  if (doc.subtitle?.trim()) {
    parts.push(`<p><em>${escapeHtml(doc.subtitle.trim())}</em></p>`);
  }
  if (doc.author?.trim()) {
    parts.push(`<p>${escapeHtml(doc.author.trim())}</p>`);
  }
  for (const section of doc.sections) {
    if (section.heading.trim()) {
      parts.push(`<h2>${escapeHtml(section.heading.trim())}</h2>`);
    }
    parts.push(tiptapDocToHtml(section.doc));
  }
  return parts.join("\n");
}

const PAGE_STYLE = `
  body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6;
    max-width: 42rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 2rem; } h2 { font-size: 1.4rem; margin-top: 2.5rem; }
  img { max-width: 100%; height: auto; }
  blockquote { border-left: 3px solid #ccc; margin: 1rem 0; padding-left: 1rem;
    color: #555; }
  pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; }
  figcaption { font-size: 0.9rem; color: #666; text-align: center; }
`;

/** A complete standalone HTML document for the given export model. */
export function toHtml(doc: ExportDocument): string {
  const lang = escapeHtml(doc.language || "en");
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(doc.title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
${documentToBodyHtml(doc)}
</body>
</html>`;
}
