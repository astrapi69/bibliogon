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

describe("htmlToTipTapDoc carries the styles the editor owns (#1105)", () => {
    it("carries text-align onto a paragraph", () => {
        // The measured case from the issue: a centred dedication imported
        // centred on the desktop and flush-left in the browser.
        const doc = htmlToTipTapDoc('<p style="text-align: center">Für Anna</p>');
        expect(doc.content[0]).toMatchObject({
            type: "paragraph",
            attrs: { textAlign: "center" },
        });
    });

    it("carries text-align onto a heading, beside its level", () => {
        const doc = htmlToTipTapDoc('<h2 style="text-align: right">Teil</h2>');
        expect(doc.content[0]).toMatchObject({
            type: "heading",
            attrs: { level: 2, textAlign: "right" },
        });
    });

    it("carries color as a textStyle mark", () => {
        const doc = htmlToTipTapDoc('<p><span style="color: red">rot</span></p>');
        expect(doc.content[0].content?.[0]).toMatchObject({
            type: "text",
            text: "rot",
            marks: [{ type: "textStyle", attrs: { color: "red" } }],
        });
    });

    it("carries background-color as a highlight mark", () => {
        const doc = htmlToTipTapDoc(
            '<p><span style="background-color: yellow">gelb</span></p>',
        );
        expect(doc.content[0].content?.[0]).toMatchObject({
            marks: [{ type: "highlight", attrs: { color: "yellow" } }],
        });
    });

    it("gives a <mark> element its colour instead of a bare highlight", () => {
        // MARK already maps to a highlight mark; the style adds the colour
        // the author chose, and multicolor is what the editor mounts.
        const doc = htmlToTipTapDoc('<p><mark style="background-color: #ff0">gelb</mark></p>');
        expect(doc.content[0].content?.[0]).toMatchObject({
            marks: [{ type: "highlight", attrs: { color: "#ff0" } }],
        });
    });

    it("drops a declaration the editor does not own", () => {
        const doc = htmlToTipTapDoc('<p style="position: fixed">X</p>');
        expect(doc.content[0]).toEqual({
            type: "paragraph",
            content: [{ type: "text", text: "X" }],
        });
    });

    it("drops a url background while keeping the alignment beside it", () => {
        const doc = htmlToTipTapDoc(
            '<p style="text-align: center; background-image: url(https://example.invalid/x.png)">X</p>',
        );
        expect(doc.content[0]).toMatchObject({ attrs: { textAlign: "center" } });
        expect(JSON.stringify(doc)).not.toContain("example.invalid");
    });

    it("does not carry a table column width from a style attribute", () => {
        // The editor reads colwidth from the attribute, not from the style,
        // so carrying it here would invent a behaviour it does not have.
        const doc = htmlToTipTapDoc(
            '<table><tbody><tr><td style="width: 120px">X</td></tr></tbody></table>',
        );
        expect(JSON.stringify(doc)).not.toContain("120");
    });

    it("leaves a styled element alone when nothing survives the filter", () => {
        const doc = htmlToTipTapDoc('<p><span style="font-family: Comic Sans MS">X</span></p>');
        expect(doc.content[0].content?.[0]).toEqual({ type: "text", text: "X" });
    });

    it("applies both marks when one element carries both", () => {
        const doc = htmlToTipTapDoc(
            '<p><span style="color: red; background-color: yellow">X</span></p>',
        );
        const marks = doc.content[0].content?.[0].marks ?? [];
        expect(marks.map((m) => m.type).sort()).toEqual(["highlight", "textStyle"]);
    });
});
