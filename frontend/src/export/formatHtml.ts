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

/** Escape a string for safe inclusion inside a `<script type="ld+json">`
 *  block: JSON-encode, then neutralise `<` so a stray `</script>` in any
 *  field can never terminate the block early. */
function jsonLdBlock(data: Record<string, unknown>): string {
  const json = JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

/** SEO `<head>` meta tags + schema.org JSON-LD built from the document's
 *  metadata (#605). Every field is emitted only when present. */
function seoHead(doc: ExportDocument): string {
  const isBook = doc.kind !== "article";
  const tags: string[] = [];
  const m = (attr: "name" | "property", key: string, value?: string) => {
    const v = value?.trim();
    if (v) tags.push(`<meta ${attr}="${key}" content="${escapeHtml(v)}" />`);
  };

  const keywords = doc.keywords?.join(", ");
  m("name", "description", doc.description);
  m("name", "author", doc.author);
  m("name", "keywords", keywords || doc.genre);
  m("property", "og:title", doc.title);
  m("property", "og:description", doc.description);
  m("property", "og:type", isBook ? "book" : "article");
  m("property", "og:locale", doc.language);
  if (isBook) {
    m("property", "book:author", doc.author);
    m("property", "book:isbn", doc.isbn);
    m("property", "book:release_date", doc.publishDate);
  }

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": isBook ? "Book" : "Article",
    name: doc.title,
  };
  if (doc.author?.trim()) ld.author = { "@type": "Person", name: doc.author.trim() };
  if (doc.description?.trim()) ld.description = doc.description.trim();
  if (doc.language?.trim()) ld.inLanguage = doc.language.trim();
  if (isBook) {
    ld.bookFormat = "EBook";
    if (doc.isbn?.trim()) ld.isbn = doc.isbn.trim();
    if (doc.publisher?.trim()) ld.publisher = doc.publisher.trim();
    if (doc.publishDate?.trim()) ld.datePublished = doc.publishDate.trim();
  }
  tags.push(jsonLdBlock(ld));
  return tags.join("\n");
}

/** A complete standalone HTML document for the given export model. */
export function toHtml(doc: ExportDocument): string {
  const lang = escapeHtml(doc.language || "en");
  const titleText = doc.author?.trim()
    ? `${doc.title} - von ${doc.author.trim()}`
    : doc.title;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(titleText)}</title>
${seoHead(doc)}
<style>${PAGE_STYLE}</style>
</head>
<body>
${documentToBodyHtml(doc)}
</body>
</html>`;
}
