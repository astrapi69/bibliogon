/**
 * HTML -> TipTap-JSON converter for the offline import path (#76).
 *
 * Shared by the `.html` importer and the `.md` importer (Markdown is rendered
 * to HTML by `marked` first), so there is a single DOM-walking converter
 * rather than one per source format. The output matches the editor's
 * ProseMirror schema: images emit `imageFigure` (NOT `image`), per the
 * lessons-learned "TipTap image node in Bibliogon is imageFigure".
 *
 * The walker handles the block + inline subset that loose documents actually
 * carry (headings, paragraphs, lists, blockquotes, code, rules, images, and
 * the bold/italic/underline/strike/code/link marks). Unknown elements degrade
 * to their inline text content rather than being dropped.
 */

import type { TipTapDoc, TipTapMark, TipTapNode } from "../medium-import/walker";

const HEADING_TAGS: Record<string, number> = {
    H1: 1,
    H2: 2,
    H3: 3,
    H4: 4,
    H5: 5,
    H6: 6,
};

const MARK_FOR_TAG: Record<string, TipTapMark> = {
    STRONG: { type: "bold" },
    B: { type: "bold" },
    EM: { type: "italic" },
    I: { type: "italic" },
    U: { type: "underline" },
    S: { type: "strike" },
    STRIKE: { type: "strike" },
    DEL: { type: "strike" },
    CODE: { type: "code" },
    MARK: { type: "highlight" },
};

function withMark(marks: TipTapMark[], mark: TipTapMark): TipTapMark[] {
    if (marks.some((m) => m.type === mark.type)) return marks;
    return [...marks, mark];
}

function textNode(text: string, marks: TipTapMark[]): TipTapNode {
    const node: TipTapNode = { type: "text", text };
    if (marks.length > 0) node.marks = marks;
    return node;
}

/** Walk inline-level DOM into TipTap text/hardBreak/image nodes. */
function inlineNodes(node: Node, marks: TipTapMark[]): TipTapNode[] {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent ?? "").replace(/\s+/g, " ");
        return text.length > 0 ? [textNode(text, marks)] : [];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];

    const el = node as Element;
    const tag = el.tagName;

    if (tag === "BR") return [{ type: "hardBreak" }];
    if (tag === "IMG") {
        const src = el.getAttribute("src") ?? "";
        return src ? [imageFigureNode(el)] : [];
    }

    if (tag === "A") {
        const href = el.getAttribute("href");
        const childMarks = href
            ? withMark(marks, { type: "link", attrs: { href } })
            : marks;
        return childrenInline(el, childMarks);
    }

    const mark = MARK_FOR_TAG[tag];
    return childrenInline(el, mark ? withMark(marks, mark) : marks);
}

function childrenInline(el: Element, marks: TipTapMark[]): TipTapNode[] {
    const out: TipTapNode[] = [];
    el.childNodes.forEach((child) => out.push(...inlineNodes(child, marks)));
    return out;
}

function imageFigureNode(el: Element): TipTapNode {
    const attrs: Record<string, unknown> = {
        src: el.getAttribute("src") ?? "",
        alt: el.getAttribute("alt") ?? "",
    };
    const title = el.getAttribute("title");
    if (title) attrs.title = title;
    return { type: "imageFigure", attrs };
}

function paragraph(content: TipTapNode[]): TipTapNode {
    return content.length > 0
        ? { type: "paragraph", content }
        : { type: "paragraph" };
}

function listItem(el: Element): TipTapNode {
    const blocks = blockNodes(el);
    return {
        type: "listItem",
        content: blocks.length > 0 ? blocks : [{ type: "paragraph" }],
    };
}

function listNode(el: Element, type: "bulletList" | "orderedList"): TipTapNode {
    const items: TipTapNode[] = [];
    el.childNodes.forEach((child) => {
        if (
            child.nodeType === Node.ELEMENT_NODE &&
            (child as Element).tagName === "LI"
        ) {
            items.push(listItem(child as Element));
        }
    });
    return { type, content: items };
}

/** Walk block-level DOM children of `parent` into TipTap block nodes. */
function blockNodes(parent: Node): TipTapNode[] {
    const out: TipTapNode[] = [];
    let inlineRun: TipTapNode[] = [];

    const flush = () => {
        if (inlineRun.length > 0) {
            out.push(paragraph(inlineRun));
            inlineRun = [];
        }
    };

    parent.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
            inlineRun.push(...inlineNodes(child, []));
            return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;

        const el = child as Element;
        const tag = el.tagName;

        if (tag in HEADING_TAGS) {
            flush();
            out.push({
                type: "heading",
                attrs: { level: HEADING_TAGS[tag] },
                content: childrenInline(el, []),
            });
            return;
        }
        if (tag === "P") {
            flush();
            out.push(paragraph(childrenInline(el, [])));
            return;
        }
        if (tag === "UL") {
            flush();
            out.push(listNode(el, "bulletList"));
            return;
        }
        if (tag === "OL") {
            flush();
            out.push(listNode(el, "orderedList"));
            return;
        }
        if (tag === "BLOCKQUOTE") {
            flush();
            const inner = blockNodes(el);
            out.push({
                type: "blockquote",
                content: inner.length > 0 ? inner : [{ type: "paragraph" }],
            });
            return;
        }
        if (tag === "PRE") {
            flush();
            out.push({
                type: "codeBlock",
                content: [{ type: "text", text: el.textContent ?? "" }],
            });
            return;
        }
        if (tag === "HR") {
            flush();
            out.push({ type: "horizontalRule" });
            return;
        }
        if (tag === "IMG") {
            flush();
            if (el.getAttribute("src")) out.push(imageFigureNode(el));
            return;
        }
        if (tag === "FIGURE") {
            flush();
            const img = el.querySelector("img");
            if (img?.getAttribute("src")) out.push(imageFigureNode(img));
            return;
        }
        if (tag === "DIV" || tag === "SECTION" || tag === "ARTICLE") {
            flush();
            out.push(...blockNodes(el));
            return;
        }

        inlineRun.push(...inlineNodes(el, []));
    });

    flush();
    return out;
}

/**
 * Convert an HTML string into a TipTap document for storage as chapter
 * content. A document with no recognisable block content still yields a
 * single empty paragraph so the result is a valid ProseMirror doc.
 *
 * @param html - the source HTML (a full document or a fragment).
 * @returns a `{ type: "doc", content: [...] }` TipTap document.
 */
export function htmlToTipTapDoc(html: string): TipTapDoc {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const content = blockNodes(parsed.body);
    return {
        type: "doc",
        content: content.length > 0 ? content : [{ type: "paragraph" }],
    };
}
