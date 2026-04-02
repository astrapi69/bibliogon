import {describe, it, expect} from "vitest";

/**
 * Tests for the markdown conversion helpers used in the Editor component.
 * These are extracted from Editor.tsx for testability.
 */

// --- nodeToMarkdown (simplified extraction) ---

function nodeToMarkdown(node: Record<string, unknown>): string {
    if (!node) return "";
    const type = node.type as string;
    const content = node.content as Record<string, unknown>[] | undefined;
    const attrs = node.attrs as Record<string, unknown> | undefined;

    if (type === "doc") return (content || []).map(nodeToMarkdown).join("\n\n");
    if (type === "paragraph") return inlineToMarkdown(content || []);
    if (type === "heading") {
        const level = (attrs?.level as number) || 1;
        return "#".repeat(level) + " " + inlineToMarkdown(content || []);
    }
    if (type === "bulletList") {
        return (content || []).map((item) => {
            const inner = (item.content as Record<string, unknown>[] || []).map(nodeToMarkdown).join("\n");
            return "- " + inner;
        }).join("\n");
    }
    if (type === "imageFigure" || type === "figure") {
        const src = (attrs?.src as string) || "";
        const alt = (attrs?.alt as string) || "";
        const caption = content ? inlineToMarkdown(content) : "";
        let md = `![${alt}](${src})`;
        if (caption) md += `\n*${caption}*`;
        return md;
    }
    if (type === "image") {
        const src = (attrs?.src as string) || "";
        const alt = (attrs?.alt as string) || "";
        return `![${alt}](${src})`;
    }
    if (type === "horizontalRule") return "---";
    if (type === "text") {
        let text = (node.text as string) || "";
        const marks = node.marks as Record<string, unknown>[] | undefined;
        if (marks) {
            for (const mark of marks) {
                const mt = mark.type as string;
                if (mt === "bold") text = `**${text}**`;
                else if (mt === "italic") text = `*${text}*`;
                else if (mt === "code") text = "`" + text + "`";
                else if (mt === "link") {
                    const href = (mark.attrs as Record<string, unknown>)?.href as string || "";
                    text = `[${text}](${href})`;
                }
            }
        }
        return text;
    }
    return "";
}

function inlineToMarkdown(nodes: Record<string, unknown>[]): string {
    return nodes.map(nodeToMarkdown).join("");
}

// --- markdownToHtml (simplified extraction) ---

function markdownToHtml(md: string): string {
    const lines = md.split("\n");
    const htmlLines: string[] = [];
    let inList: "ul" | "ol" | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (inList && !line.match(/^[-*]\s/) && !line.match(/^\d+\.\s/) && line.trim() !== "") {
            htmlLines.push(inList === "ul" ? "</ul>" : "</ol>");
            inList = null;
        }
        if (line.trim() === "") {
            if (inList) { htmlLines.push(inList === "ul" ? "</ul>" : "</ol>"); inList = null; }
            continue;
        }
        if (line.match(/^---+$/)) { htmlLines.push("<hr>"); continue; }
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            htmlLines.push(`<h${headingMatch[1].length}>${headingMatch[2]}</h${headingMatch[1].length}>`);
            continue;
        }
        const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
        if (imgMatch) {
            const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
            const captionMatch = nextLine.match(/^\*([^*]+)\*\s*$/);
            if (captionMatch) {
                htmlLines.push(`<figure><img src="${imgMatch[2]}" alt="${imgMatch[1]}" /><figcaption>${captionMatch[1]}</figcaption></figure>`);
                i++;
            } else {
                htmlLines.push(`<img src="${imgMatch[2]}" alt="${imgMatch[1]}" />`);
            }
            continue;
        }
        const ulMatch = line.match(/^[-*]\s+(.+)$/);
        if (ulMatch) {
            if (inList !== "ul") { if (inList) htmlLines.push("</ol>"); htmlLines.push("<ul>"); inList = "ul"; }
            htmlLines.push(`<li>${ulMatch[1]}</li>`);
            continue;
        }
        htmlLines.push(`<p>${line}</p>`);
    }
    if (inList) htmlLines.push(inList === "ul" ? "</ul>" : "</ol>");
    return htmlLines.join("\n");
}

// --- Tests ---

describe("nodeToMarkdown", () => {
    it("converts heading", () => {
        const node = {type: "heading", attrs: {level: 2}, content: [{type: "text", text: "Title"}]};
        expect(nodeToMarkdown(node)).toBe("## Title");
    });

    it("converts paragraph with bold", () => {
        const node = {type: "paragraph", content: [
            {type: "text", text: "Hello "},
            {type: "text", text: "world", marks: [{type: "bold"}]},
        ]};
        expect(nodeToMarkdown(node)).toBe("Hello **world**");
    });

    it("converts image", () => {
        const node = {type: "image", attrs: {src: "/img/test.png", alt: "Test"}};
        expect(nodeToMarkdown(node)).toBe("![Test](/img/test.png)");
    });

    it("converts imageFigure without caption", () => {
        const node = {type: "imageFigure", attrs: {src: "/img/test.png", alt: "Test"}, content: []};
        expect(nodeToMarkdown(node)).toBe("![Test](/img/test.png)");
    });

    it("converts imageFigure with caption", () => {
        const node = {type: "imageFigure", attrs: {src: "/img/test.png", alt: "Test"},
            content: [{type: "text", text: "A caption"}]};
        expect(nodeToMarkdown(node)).toBe("![Test](/img/test.png)\n*A caption*");
    });

    it("converts link", () => {
        const node = {type: "text", text: "click", marks: [{type: "link", attrs: {href: "https://example.com"}}]};
        expect(nodeToMarkdown(node)).toBe("[click](https://example.com)");
    });

    it("converts bullet list", () => {
        const node = {type: "bulletList", content: [
            {type: "listItem", content: [{type: "paragraph", content: [{type: "text", text: "One"}]}]},
            {type: "listItem", content: [{type: "paragraph", content: [{type: "text", text: "Two"}]}]},
        ]};
        expect(nodeToMarkdown(node)).toBe("- One\n- Two");
    });

    it("converts horizontal rule", () => {
        expect(nodeToMarkdown({type: "horizontalRule"})).toBe("---");
    });

    it("handles empty doc", () => {
        expect(nodeToMarkdown({type: "doc", content: []})).toBe("");
    });
});

describe("markdownToHtml", () => {
    it("converts heading", () => {
        expect(markdownToHtml("## Title")).toBe("<h2>Title</h2>");
    });

    it("converts paragraph", () => {
        expect(markdownToHtml("Hello world")).toBe("<p>Hello world</p>");
    });

    it("converts image", () => {
        expect(markdownToHtml("![alt](src.png)")).toBe('<img src="src.png" alt="alt" />');
    });

    it("converts image with caption", () => {
        const md = "![alt](src.png)\n*Caption text*";
        const html = markdownToHtml(md);
        expect(html).toContain("<figure>");
        expect(html).toContain("<figcaption>Caption text</figcaption>");
    });

    it("converts bullet list", () => {
        const html = markdownToHtml("- One\n- Two");
        expect(html).toContain("<ul>");
        expect(html).toContain("<li>One</li>");
        expect(html).toContain("<li>Two</li>");
    });

    it("converts horizontal rule", () => {
        expect(markdownToHtml("---")).toBe("<hr>");
    });
});
