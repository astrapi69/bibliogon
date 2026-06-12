import { describe, it, expect } from "vitest";

import { htmlToTipTapDoc } from "./htmlToTipTap";

describe("htmlToTipTapDoc", () => {
    it("maps headings to heading nodes with levels", () => {
        const doc = htmlToTipTapDoc("<h1>Title</h1><h2>Sub</h2>");
        expect(doc.content[0]).toMatchObject({
            type: "heading",
            attrs: { level: 1 },
        });
        expect(doc.content[1]).toMatchObject({
            type: "heading",
            attrs: { level: 2 },
        });
    });

    it("maps paragraphs and inline marks", () => {
        const doc = htmlToTipTapDoc(
            "<p>plain <strong>bold</strong> <em>italic</em></p>",
        );
        const para = doc.content[0];
        expect(para.type).toBe("paragraph");
        const marks = (para.content ?? []).map((n) =>
            (n.marks ?? []).map((m) => m.type).join(","),
        );
        expect(marks).toContain("bold");
        expect(marks).toContain("italic");
    });

    it("maps links to a link mark with href", () => {
        const doc = htmlToTipTapDoc('<p><a href="https://x.test">go</a></p>');
        const textNode = doc.content[0].content?.[0];
        expect(textNode?.marks?.[0]).toMatchObject({
            type: "link",
            attrs: { href: "https://x.test" },
        });
    });

    it("maps unordered and ordered lists", () => {
        const doc = htmlToTipTapDoc("<ul><li>a</li><li>b</li></ul>");
        expect(doc.content[0].type).toBe("bulletList");
        expect(doc.content[0].content).toHaveLength(2);
        expect(doc.content[0].content?.[0].type).toBe("listItem");

        const ol = htmlToTipTapDoc("<ol><li>x</li></ol>");
        expect(ol.content[0].type).toBe("orderedList");
    });

    it("emits imageFigure (not image) per the editor schema", () => {
        const doc = htmlToTipTapDoc('<img src="cover.png" alt="Cover">');
        expect(doc.content[0]).toMatchObject({
            type: "imageFigure",
            attrs: { src: "cover.png", alt: "Cover" },
        });
    });

    it("maps blockquote, code block and horizontal rule", () => {
        const doc = htmlToTipTapDoc(
            "<blockquote><p>q</p></blockquote><pre>code()</pre><hr>",
        );
        const types = doc.content.map((n) => n.type);
        expect(types).toEqual(["blockquote", "codeBlock", "horizontalRule"]);
    });

    it("yields a single empty paragraph for empty input", () => {
        const doc = htmlToTipTapDoc("");
        expect(doc.content).toEqual([{ type: "paragraph" }]);
    });
});
