import { describe, expect, it } from "vitest";

import { COMIC_GRID_GUTTER, comicPanelRects } from "../../lib/comics/comicGrid";
import {
    bubbleOverflowMargin,
    bubbleRect,
    bubbleSvg,
    bubbleTextNode,
    buildComicPdfDefinition,
    comicFormatDims,
    type ComicPdfBubble,
    type ComicPdfPage,
} from "./comicPdf";

const SPEECH: ComicPdfBubble = {
    bubbleType: "speech",
    anchor: { x_pct: 10, y_pct: 20 },
    widthPct: 40,
    heightPct: 25,
    tailDirection: "S",
    tailPositionPct: 50,
    tailLengthPx: 20,
    text: "Hallo!",
};

function nodes(def: Record<string, unknown>): Record<string, unknown>[] {
    return def.content as Record<string, unknown>[];
}

describe("comicFormatDims", () => {
    it("resolves the five trims the dropdown offers", () => {
        // The same catalogue as the picture book, because the dropdown is
        // the same dropdown and the backend walker shares it too. A
        // comic-specific table would fall back to its own default for any
        // key it did not share, so the user would pick a trim and get
        // another.
        expect(comicFormatDims("8.5x8.5")).toEqual([612, 612]);
        expect(comicFormatDims("8x10")).toEqual([576, 720]);
        expect(comicFormatDims("8.5x11")).toEqual([612, 792]);
        expect(comicFormatDims("11x8.5")).toEqual([792, 612]);
        expect(comicFormatDims("10x8")).toEqual([720, 576]);
    });

    it("defaults to the dropdown's default for a missing or unknown key", () => {
        expect(comicFormatDims()).toEqual([612, 612]);
        expect(comicFormatDims("6.625x10.25")).toEqual([612, 612]);
    });
});

describe("bubbleRect", () => {
    const panel = { x: 100, y: 200, width: 300, height: 400 };

    it("places the bubble by percent of its panel, not of the page", () => {
        expect(bubbleRect(SPEECH, panel)).toEqual({
            x: 100 + 30,
            y: 200 + 80,
            width: 120,
            height: 100,
        });
    });

    it("falls back to the editor's defaults for missing values", () => {
        const bare = { ...SPEECH, anchor: null, widthPct: NaN, heightPct: NaN };
        expect(bubbleRect(bare, panel)).toEqual({
            x: 100,
            y: 200,
            width: 90, // 30 %
            height: 80, // 20 %
        });
    });

    it("clamps percentages into range", () => {
        const out = bubbleRect(
            { ...SPEECH, anchor: { x_pct: -50, y_pct: 400 }, widthPct: 250, heightPct: 0 },
            panel,
        );
        expect(out.x).toBe(100);
        expect(out.y).toBe(600);
        expect(out.width).toBe(300);
        expect(out.height).toBe(0);
    });
});

describe("bubbleSvg", () => {
    const rect = { x: 50, y: 60, width: 200, height: 100 };

    it("widens the viewBox so the tail is not clipped", () => {
        // buildBubblePath returns a viewBox equal to the bubble box and
        // lets the tail run past it; on screen overflow: visible shows it,
        // in an SVG with explicit dimensions it would be cut off.
        const out = bubbleSvg(SPEECH, rect)!;
        const margin = bubbleOverflowMargin(SPEECH.tailLengthPx);
        expect(out.svg).toContain(`viewBox="${-margin} ${-margin} ${100 + margin * 2} ${100 + margin * 2}"`);
        expect(margin).toBeGreaterThan(SPEECH.tailLengthPx);
    });

    it("offsets the node so the bubble box still lands on its rectangle", () => {
        // The widened viewBox must not move the bubble. Mapping the
        // 0..100 box back through the node's position and scale has to
        // return the rectangle we asked for - this is the assertion that
        // catches an off-by-a-margin in either direction.
        const out = bubbleSvg(SPEECH, rect)!;
        const margin = bubbleOverflowMargin(SPEECH.tailLengthPx);
        const span = 100 + margin * 2;
        const scaleX = out.width / span;
        const scaleY = out.height / span;
        expect(out.x + margin * scaleX).toBeCloseTo(rect.x, 6);
        expect(out.y + margin * scaleY).toBeCloseTo(rect.y, 6);
        expect(100 * scaleX).toBeCloseTo(rect.width, 6);
        expect(100 * scaleY).toBeCloseTo(rect.height, 6);
    });

    it("stretches each axis independently", () => {
        // preserveAspectRatio="none" plus a non-square rect: a uniform
        // scale would letterbox the outline inside its own box.
        //
        // Asserted on the MARKUP, not only on the returned width/height:
        // pdfmake sizes the node from those two numbers but svg-to-pdfkit
        // lays the drawing out from the attributes, so a mismatch between
        // them squashes the outline inside a correctly sized box - and a
        // test reading only the return value passes through it.
        const out = bubbleSvg(SPEECH, rect)!;
        expect(out.width).not.toBeCloseTo(out.height, 6);
        expect(out.svg).toContain(`width="${out.width}" height="${out.height}"`);
        expect(out.svg).toContain('preserveAspectRatio="none"');
    });

    it("carries the type's default visual attributes", () => {
        const whisper = bubbleSvg({ ...SPEECH, bubbleType: "whisper" }, rect)!;
        expect(whisper.svg).toContain('stroke-dasharray="4 3"');
        const narration = bubbleSvg({ ...SPEECH, bubbleType: "narration" }, rect)!;
        expect(narration.svg).toContain('fill="#f5f5dc"');
    });

    it("lets bubble_config override fill and border", () => {
        const out = bubbleSvg(
            { ...SPEECH, config: { background_color: "#ffeeaa", border_width: 4 } },
            rect,
        )!;
        expect(out.svg).toContain('fill="#ffeeaa"');
        expect(out.svg).toContain('stroke-width="4"');
    });

    it("draws nothing for a sound effect", () => {
        // sound_effect is lettering on the artwork: no outline, no fill.
        expect(bubbleSvg({ ...SPEECH, bubbleType: "sound_effect" }, rect)).toBeNull();
    });
});

describe("bubbleTextNode", () => {
    const rect = { x: 50, y: 60, width: 200, height: 100 };

    it("returns null for an empty or whitespace bubble", () => {
        expect(bubbleTextNode({ ...SPEECH, text: null }, rect)).toBeNull();
        expect(bubbleTextNode({ ...SPEECH, text: "   " }, rect)).toBeNull();
    });

    it("insets the text and centres it by default", () => {
        const node = bubbleTextNode(SPEECH, rect)!;
        expect(node.absolutePosition).toEqual({ x: 58, y: 60 + 50 - 6 });
        expect(node.width).toBe(184);
        expect(node.alignment).toBe("center");
        expect(node.color).toBe("black");
        expect(node.fontSize).toBe(10);
    });

    it("applies the config typography", () => {
        const node = bubbleTextNode(
            {
                ...SPEECH,
                config: {
                    font_size: 18,
                    font_weight: "bold",
                    italic: true,
                    text_align: "left",
                    text_color: "#123456",
                    padding: 2,
                },
            },
            rect,
        )!;
        expect(node.fontSize).toBe(18);
        expect(node.bold).toBe(true);
        expect(node.italics).toBe(true);
        expect(node.alignment).toBe("left");
        expect(node.color).toBe("#123456");
        expect(node.width).toBe(196);
    });

    it("drops font_family rather than naming a font pdfmake has not loaded", () => {
        // pdfmake renders from its virtual filesystem; an unknown family
        // throws at render time instead of falling back, so a PDF with one
        // arbitrary family in it would fail to build at all.
        const node = bubbleTextNode({ ...SPEECH, config: { font_family: "Comic Sans MS" } }, rect)!;
        expect(JSON.stringify(node)).not.toContain("Comic Sans");
    });

    it("keeps a tall bubble's text inside the box", () => {
        const node = bubbleTextNode(SPEECH, { ...rect, height: 4 })!;
        const y = (node.absolutePosition as { y: number }).y;
        expect(y).toBeGreaterThanOrEqual(rect.y);
    });
});

describe("buildComicPdfDefinition", () => {
    const page = (template: ComicPdfPage["template"], panels: ComicPdfPage["panels"]) =>
        ({ template, panels }) satisfies ComicPdfPage;

    it("sets the page size from the trim key", () => {
        const def = buildComicPdfDefinition([], "8.5x11");
        expect(def.pageSize).toEqual({ width: 612, height: 792 });
        expect(def.pageMargins).toEqual([36, 36, 36, 36]);
    });

    it("emits a page even with no content, so pagination matches the book", () => {
        const def = buildComicPdfDefinition([page("grid_2x2", [])]);
        expect(nodes(def).length).toBeGreaterThanOrEqual(1);
    });

    it("breaks before every page but the first", () => {
        // Absolutely positioned content does not advance pdfmake's cursor,
        // so the flow node carrying pageBreak is the only thing keeping
        // page two off page one.
        const def = buildComicPdfDefinition([
            page("single_panel", [{ bubbles: [] }]),
            page("single_panel", [{ bubbles: [] }]),
        ]);
        const breaks = nodes(def).filter((n) => n.pageBreak === "before");
        expect(breaks).toHaveLength(1);
        expect(nodes(def)[0].pageBreak).toBeUndefined();
    });

    it("frames every panel at its cell rectangle", () => {
        const def = buildComicPdfDefinition(
            [page("grid_2x2", [{ bubbles: [] }, { bubbles: [] }, { bubbles: [] }, { bubbles: [] }])],
            "8.5x11",
        );
        const canvas = nodes(def).find((n) => n.canvas) as
            | { canvas: Record<string, number>[] }
            | undefined;
        const expected = comicPanelRects(
            "grid_2x2",
            { x: 36, y: 36, width: 540, height: 720 },
            COMIC_GRID_GUTTER,
        );
        expect(canvas?.canvas).toHaveLength(4);
        canvas?.canvas.forEach((frame, i) => {
            expect(frame.x).toBeCloseTo(expected[i].x, 6);
            expect(frame.y).toBeCloseTo(expected[i].y, 6);
            expect(frame.w).toBeCloseTo(expected[i].width, 6);
            expect(frame.h).toBeCloseTo(expected[i].height, 6);
        });
    });

    it("omits the frame when the panel asks for no border", () => {
        const def = buildComicPdfDefinition([
            page("single_panel", [{ bubbles: [], config: { border_style: "none" } }]),
        ]);
        expect(nodes(def).some((n) => n.canvas)).toBe(false);
    });

    it("fits a panel image to its cell", () => {
        const def = buildComicPdfDefinition(
            [page("single_panel", [{ bubbles: [], imageDataUrl: "data:image/png;base64,AAA" }])],
            "8.5x8.5",
        );
        const image = nodes(def).find((n) => n.image) as Record<string, unknown>;
        expect(image.fit).toEqual([540, 540]);
        expect(image.absolutePosition).toEqual({ x: 36, y: 36 });
    });

    it("drops panels the template has no cell for", () => {
        // The editor's panel cap prevents this; a page that predates the
        // cap, or one whose template was switched down, still has to
        // render rather than throw or draw off-page.
        const def = buildComicPdfDefinition([
            page("single_panel", [
                { bubbles: [], imageDataUrl: "data:image/png;base64,AAA" },
                { bubbles: [], imageDataUrl: "data:image/png;base64,BBB" },
            ]),
        ]);
        expect(nodes(def).filter((n) => n.image)).toHaveLength(1);
    });

    it("renders a bubble as an outline plus its words", () => {
        const def = buildComicPdfDefinition([page("single_panel", [{ bubbles: [SPEECH] }])]);
        expect(nodes(def).filter((n) => n.svg)).toHaveLength(1);
        expect(nodes(def).filter((n) => n.text === "Hallo!")).toHaveLength(1);
    });

    it("renders a sound effect as words with no outline", () => {
        const def = buildComicPdfDefinition([
            page("single_panel", [
                { bubbles: [{ ...SPEECH, bubbleType: "sound_effect", text: "KRACH!" }] },
            ]),
        ]);
        expect(nodes(def).filter((n) => n.svg)).toHaveLength(0);
        expect(nodes(def).filter((n) => n.text === "KRACH!")).toHaveLength(1);
    });

    it("positions a bubble relative to its own panel", () => {
        // The regression this guards: computing the bubble from the page
        // box instead of the cell puts every bubble on the first panel.
        const def = buildComicPdfDefinition(
            [page("grid_1x2", [{ bubbles: [] }, { bubbles: [SPEECH] }])],
            "8.5x11",
        );
        const svgNode = nodes(def).find((n) => n.svg) as { absolutePosition: { x: number } };
        const cells = comicPanelRects(
            "grid_1x2",
            { x: 36, y: 36, width: 540, height: 720 },
            COMIC_GRID_GUTTER,
        );
        expect(svgNode.absolutePosition.x).toBeGreaterThan(cells[1].x - 50);
        expect(svgNode.absolutePosition.x).toBeGreaterThan(cells[0].x + cells[0].width - 50);
    });
});
