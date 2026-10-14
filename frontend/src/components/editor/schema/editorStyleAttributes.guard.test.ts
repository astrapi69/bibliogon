import { describe, it, expect, vi } from "vitest";
import { Node } from "@tiptap/core";

/**
 * The guard that keeps the editor and the import walker from drifting (#1105).
 *
 * The editor OWNS which style declarations survive a paste or an import: its
 * extension set decides, and `editorStyleAttributes` writes that down. The
 * walker READS that declaration. This file proves the declaration still
 * describes the real editor, by building the actual schema
 * `buildEditorExtensions` returns and parsing HTML through it.
 *
 * So a sixth style-emitting extension - or the removal of one of the three -
 * turns this red rather than silently making the walker wrong.
 *
 * The Figure extension is mocked for one reason, stated in
 * `editorExtensions`'s own docstring: its CJS build crashes under Vitest's
 * module interop. It contributes none of the probed properties (it models an
 * image and a caption), so the probe is unaffected - and mocking it is what
 * lets the probe run against the REAL extension list instead of a
 * hand-picked subset, which would be the second list this guard exists to
 * prevent.
 */
vi.mock("@pentestpad/tiptap-extension-figure", () => ({
    default: Node.create({ name: "imageFigure", group: "block", content: "inline*" }),
}));

async function parseThroughTheEditorSchema(html: string): Promise<unknown> {
    const { getSchema } = await import("@tiptap/core");
    const { DOMParser } = await import("prosemirror-model");
    const { buildEditorExtensions } = await import("../editorExtensions");
    const schema = getSchema(buildEditorExtensions(undefined, []));
    const dom = new window.DOMParser().parseFromString(html, "text/html");
    return DOMParser.fromSchema(schema).parse(dom.body).toJSON();
}

function find(json: unknown, predicate: (node: Record<string, unknown>) => boolean): boolean {
    if (Array.isArray(json)) return json.some((child) => find(child, predicate));
    if (typeof json !== "object" || json === null) return false;
    const node = json as Record<string, unknown>;
    if (predicate(node)) return true;
    return Object.values(node).some((value) => find(value, predicate));
}

describe("the editor's own schema decides which styles survive", () => {
    it("keeps text-align as a node attribute", async () => {
        const json = await parseThroughTheEditorSchema('<p style="text-align: center">X</p>');
        expect(
            find(json, (n) => (n.attrs as Record<string, unknown>)?.textAlign === "center"),
        ).toBe(true);
    });

    it("keeps text-align on a heading too", async () => {
        const json = await parseThroughTheEditorSchema('<h2 style="text-align: right">X</h2>');
        expect(
            find(json, (n) => n.type === "heading" &&
                (n.attrs as Record<string, unknown>)?.textAlign === "right"),
        ).toBe(true);
    });

    it("keeps color as a textStyle mark", async () => {
        const json = await parseThroughTheEditorSchema(
            '<p><span style="color: rgb(255, 0, 0)">X</span></p>',
        );
        expect(
            find(json, (n) => n.type === "textStyle" &&
                (n.attrs as Record<string, unknown>)?.color === "rgb(255, 0, 0)"),
        ).toBe(true);
    });

    it("keeps background-color as a highlight mark", async () => {
        const json = await parseThroughTheEditorSchema(
            '<p><mark style="background-color: yellow">X</mark></p>',
        );
        expect(
            find(json, (n) => n.type === "highlight" &&
                (n.attrs as Record<string, unknown>)?.color === "yellow"),
        ).toBe(true);
    });

    it.each([
        ['<p style="position: fixed">X</p>', "position"],
        ['<p style="background-image: url(https://example.invalid/x.png)">X</p>', "background-image"],
        ['<p style="font-family: Comic Sans MS">X</p>', "font-family"],
    ])("drops %s", async (html) => {
        const json = await parseThroughTheEditorSchema(html);
        expect(JSON.stringify(json)).not.toMatch(/position|background-image|font-family/);
    });

    it("does NOT read a table column width from a style attribute", async () => {
        // Measured, and it corrects the premise #1105 was filed on: the
        // backend's five-entry allowlist includes width/min-width, but the
        // editor's table cell parses `colwidth` from the COLWIDTH attribute,
        // not from `style: width`. Carrying width in the walker would invent
        // a behaviour the editor does not have.
        const fromStyle = await parseThroughTheEditorSchema(
            '<table><tbody><tr><td style="width: 120px">X</td></tr></tbody></table>',
        );
        expect(
            find(fromStyle, (n) => (n.attrs as Record<string, unknown>)?.colwidth !== null &&
                (n.attrs as Record<string, unknown>)?.colwidth !== undefined),
        ).toBe(false);

        const fromAttribute = await parseThroughTheEditorSchema(
            '<table><tbody><tr><td colwidth="120">X</td></tr></tbody></table>',
        );
        expect(
            find(fromAttribute, (n) =>
                JSON.stringify((n.attrs as Record<string, unknown>)?.colwidth) === "[120]"),
        ).toBe(true);
    });

    it("imports a centred dedication the same way on desktop and in the browser", async () => {
        // The measured case #1105 was filed on, closed end to end.
        //
        // Desktop: the backend stores HTML and its import filter keeps
        // text-align. Measured, not assumed:
        //   >>> md_to_html('<p style="text-align: center; position: fixed">Für Anna</p>')
        //   '<p style="text-align: center">Für Anna</p>'
        // The editor then parses that HTML with the schema below.
        //
        // Browser: the walker stores a doc directly from the same source.
        //
        // Two representations, and the assertion is that they arrive at the
        // same document - which is what "imports identically" has to mean
        // when one side stores HTML and the other stores a doc.
        const source = '<p style="text-align: center; position: fixed">Für Anna</p>';
        const backendStoredHtml = '<p style="text-align: center">Für Anna</p>';

        const { htmlToTipTapDoc } = await import("../../../import/htmlToTipTap");
        const browserDoc = htmlToTipTapDoc(source);
        const desktopDoc = await parseThroughTheEditorSchema(backendStoredHtml);

        expect(browserDoc.content[0]).toMatchObject({
            type: "paragraph",
            attrs: { textAlign: "center" },
        });
        expect(
            find(desktopDoc, (n) => (n.attrs as Record<string, unknown>)?.textAlign === "center"),
        ).toBe(true);

        // Same text, same alignment, and neither side carries the
        // declaration the author never wrote.
        expect(JSON.stringify(browserDoc)).not.toContain("position");
        expect(JSON.stringify(desktopDoc)).not.toContain("position");
        expect(JSON.stringify(browserDoc)).toContain("Für Anna");
        expect(JSON.stringify(desktopDoc)).toContain("Für Anna");
    });

    it("declares exactly the properties the schema keeps", async () => {
        // The point of the file: the declaration the walker reads has to be
        // the set this schema actually honours - no more (inventing a
        // behaviour) and no less (losing the author's formatting).
        const { EDITOR_STYLE_ATTRIBUTES } = await import("./editorStyleAttributes");
        expect(Object.keys(EDITOR_STYLE_ATTRIBUTES).sort()).toEqual([
            "background-color",
            "color",
            "text-align",
        ]);
    });
});
