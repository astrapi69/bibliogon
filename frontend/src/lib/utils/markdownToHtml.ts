/**
 * Convert Markdown text to HTML so TipTap can parse it correctly.
 *
 * TipTap stores documents as JSON and cannot ingest Markdown directly;
 * the editor's Markdown mode therefore round-trips through HTML (Markdown
 * -> HTML -> TipTap JSON). This is the pure Markdown -> HTML half of that
 * round-trip: a self-contained, line-based converter with no application
 * imports, so it can be exercised from unit tests without pulling in the
 * TipTap extension graph.
 *
 * Handles headings, bold, italic, strikethrough, code, links, lists,
 * blockquotes, code blocks, horizontal rules, and standalone images
 * (promoted to ``<figure>``/``<figcaption>`` when an italic caption line
 * immediately follows).
 *
 * @example
 * markdownToHtml("# Title\n\nHello **world**")
 * // "<h1>Title</h1>\n<p>Hello <strong>world</strong></p>"
 */
export function markdownToHtml(md: string): string {
    const lines = md.split("\n");
    const htmlLines: string[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let inList: "ul" | "ol" | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Code blocks
        if (line.startsWith("```")) {
            if (inCodeBlock) {
                htmlLines.push(`<pre><code>${codeBlockContent.join("\n")}</code></pre>`);
                codeBlockContent = [];
                inCodeBlock = false;
            } else {
                if (inList) {
                    htmlLines.push(inList === "ul" ? "</ul>" : "</ol>");
                    inList = null;
                }
                inCodeBlock = true;
            }
            continue;
        }
        if (inCodeBlock) {
            codeBlockContent.push(line.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
            continue;
        }

        // Close list if current line is not a list item
        if (inList && !line.match(/^[-*]\s/) && !line.match(/^\d+\.\s/) && line.trim() !== "") {
            htmlLines.push(inList === "ul" ? "</ul>" : "</ol>");
            inList = null;
        }

        // Empty line
        if (line.trim() === "") {
            if (inList) {
                htmlLines.push(inList === "ul" ? "</ul>" : "</ol>");
                inList = null;
            }
            continue;
        }

        // Horizontal rule
        if (line.match(/^---+$/)) {
            htmlLines.push("<hr>");
            continue;
        }

        // Headings
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            htmlLines.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
            continue;
        }

        // Blockquote
        if (line.startsWith("> ")) {
            htmlLines.push(`<blockquote><p>${inlineMarkdown(line.slice(2))}</p></blockquote>`);
            continue;
        }

        // Unordered list
        const ulMatch = line.match(/^[-*]\s+(.+)$/);
        if (ulMatch) {
            if (inList !== "ul") {
                if (inList) htmlLines.push("</ol>");
                htmlLines.push("<ul>");
                inList = "ul";
            }
            htmlLines.push(`<li>${inlineMarkdown(ulMatch[1])}</li>`);
            continue;
        }

        // Ordered list
        const olMatch = line.match(/^\d+\.\s+(.+)$/);
        if (olMatch) {
            if (inList !== "ol") {
                if (inList) htmlLines.push("</ul>");
                htmlLines.push("<ol>");
                inList = "ol";
            }
            htmlLines.push(`<li>${inlineMarkdown(olMatch[1])}</li>`);
            continue;
        }

        // Image: ![alt](src) - standalone on a line
        // If next line is italic (*caption*), treat as figure+figcaption
        const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
        if (imgMatch) {
            const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
            const captionMatch = nextLine.match(/^\*([^*]+)\*\s*$/);
            if (captionMatch) {
                htmlLines.push(
                    `<figure><img src="${imgMatch[2]}" alt="${imgMatch[1]}" />` +
                        `<figcaption>${captionMatch[1]}</figcaption></figure>`,
                );
                i++; // skip caption line
            } else {
                htmlLines.push(`<img src="${imgMatch[2]}" alt="${imgMatch[1]}" />`);
            }
            continue;
        }

        // Paragraph (also handle inline images)
        htmlLines.push(`<p>${inlineMarkdown(line)}</p>`);
    }

    if (inList) htmlLines.push(inList === "ul" ? "</ul>" : "</ol>");
    if (inCodeBlock) htmlLines.push(`<pre><code>${codeBlockContent.join("\n")}</code></pre>`);

    return htmlLines.join("\n");
}

function inlineMarkdown(text: string): string {
    return (
        text
            // Images must be before links (both use [...](...)  syntax)
            .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>")
            .replace(/~~(.+?)~~/g, "<s>$1</s>")
            .replace(/`(.+?)`/g, "<code>$1</code>")
            .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    );
}
