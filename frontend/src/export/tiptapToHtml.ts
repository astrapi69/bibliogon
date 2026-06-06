/**
 * TipTap JSON -> HTML walker for the client-side export engine
 * (Maximal-Offline P2).
 *
 * A self-contained node walker (no `@tiptap/html`, so export does not couple
 * to the editor's runtime extension array) that mirrors the node coverage of
 * `utils/tiptap-markdown.ts`. Produces clean, semantic body HTML; the EPUB
 * generator reuses it per chapter, and the Markdown generator runs the output
 * through `turndown`.
 */

import type { TipTapNode } from "./documentModel";

/** Escape the five HTML-significant characters in text content. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textNodeToHtml(node: TipTapNode): string {
  let html = escapeHtml((node.text as string) || "");
  const marks = node.marks as Record<string, unknown>[] | undefined;
  if (!marks) return html;
  for (const mark of marks) {
    const type = mark.type as string;
    if (type === "bold") html = `<strong>${html}</strong>`;
    else if (type === "italic") html = `<em>${html}</em>`;
    else if (type === "strike") html = `<s>${html}</s>`;
    else if (type === "code") html = `<code>${html}</code>`;
    else if (type === "underline") html = `<u>${html}</u>`;
    else if (type === "link") {
      const href = escapeHtml(
        ((mark.attrs as Record<string, unknown>)?.href as string) || "",
      );
      html = `<a href="${href}">${html}</a>`;
    }
  }
  return html;
}

function inlineToHtml(nodes: TipTapNode[]): string {
  return nodes.map(nodeToHtml).join("");
}

/** Convert a single TipTap node to its HTML representation. */
export function nodeToHtml(node: TipTapNode): string {
  if (!node) return "";
  const type = node.type as string;
  const content = (node.content as TipTapNode[] | undefined) || [];
  const attrs = node.attrs as Record<string, unknown> | undefined;

  switch (type) {
    case "doc":
      return content.map(nodeToHtml).join("");
    case "paragraph": {
      const inner = inlineToHtml(content);
      return `<p>${inner}</p>`;
    }
    case "heading": {
      const level = Math.min(Math.max((attrs?.level as number) || 1, 1), 6);
      return `<h${level}>${inlineToHtml(content)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${content.map(nodeToHtml).join("")}</ul>`;
    case "orderedList":
      return `<ol>${content.map(nodeToHtml).join("")}</ol>`;
    case "listItem":
      return `<li>${content.map(nodeToHtml).join("")}</li>`;
    case "blockquote":
      return `<blockquote>${content.map(nodeToHtml).join("")}</blockquote>`;
    case "codeBlock": {
      const code = escapeHtml(content.map((n) => (n.text as string) || "").join(""));
      return `<pre><code>${code}</code></pre>`;
    }
    case "imageFigure":
    case "figure": {
      const src = escapeHtml((attrs?.src as string) || "");
      const alt = escapeHtml((attrs?.alt as string) || "");
      const caption = content.length ? inlineToHtml(content) : "";
      const img = `<img src="${src}" alt="${alt}" />`;
      return caption
        ? `<figure>${img}<figcaption>${caption}</figcaption></figure>`
        : `<figure>${img}</figure>`;
    }
    case "image": {
      const src = escapeHtml((attrs?.src as string) || "");
      const alt = escapeHtml((attrs?.alt as string) || "");
      return `<img src="${src}" alt="${alt}" />`;
    }
    case "horizontalRule":
      return "<hr />";
    case "hardBreak":
      return "<br />";
    case "text":
      return textNodeToHtml(node);
    default:
      // Unknown block node: still surface its inline content so text is
      // never silently dropped on export.
      return content.length ? inlineToHtml(content) : "";
  }
}

/** Convert a TipTap document's body to HTML (no surrounding page chrome). */
export function tiptapDocToHtml(doc: TipTapNode): string {
  return nodeToHtml(doc);
}
