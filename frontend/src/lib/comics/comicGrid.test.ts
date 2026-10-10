import { describe, expect, it } from "vitest";

import {
    COMIC_GRID_DIMENSIONS,
    COMIC_GRID_GUTTER,
    COMIC_GRID_MAX_PANELS,
    COMIC_GRID_TEMPLATES,
    DEFAULT_COMIC_GRID_TEMPLATE,
    comicPanelRects,
    resolveComicGridTemplate,
    type ComicGridTemplate,
} from "./comicGrid";

const BOX = { x: 36, y: 36, width: 540, height: 540 };

describe("resolveComicGridTemplate", () => {
    it("reads the stored template", () => {
        expect(resolveComicGridTemplate({ comic_grid_template: "grid_2x3" })).toBe("grid_2x3");
    });

    it.each([
        ["null config", null],
        ["undefined config", undefined],
        ["no key", {}],
        ["an unknown id", { comic_grid_template: "grid_4x4" }],
        ["a non-string", { comic_grid_template: 2 }],
    ])("falls back to single_panel for %s", (_label, config) => {
        expect(resolveComicGridTemplate(config as Record<string, unknown> | null)).toBe(
            DEFAULT_COMIC_GRID_TEMPLATE,
        );
    });

    it("honours grid_3x3, which the picker no longer offers", () => {
        // Legacy pages still carry it; dropping it on read would silently
        // collapse a nine-panel page to one.
        expect(resolveComicGridTemplate({ comic_grid_template: "grid_3x3" })).toBe("grid_3x3");
    });
});

describe("the template table", () => {
    it("gives every template a dimension and a panel cap", () => {
        for (const template of COMIC_GRID_TEMPLATES) {
            expect(COMIC_GRID_DIMENSIONS[template]).toBeDefined();
            expect(COMIC_GRID_MAX_PANELS[template]).toBeDefined();
        }
    });

    it("caps panels at exactly the cell count", () => {
        // The two disagreeing is the shape that lets the editor accept a
        // panel the exporter has nowhere to put.
        for (const template of COMIC_GRID_TEMPLATES) {
            const { rows, cols } = COMIC_GRID_DIMENSIONS[template];
            expect(COMIC_GRID_MAX_PANELS[template], template).toBe(rows * cols);
        }
    });

    it("distinguishes grid_1x2 from grid_2x1", () => {
        // RxC, so 1x2 is side-by-side and 2x1 is stacked. Swapping them
        // rotates every two-panel page in the book.
        expect(COMIC_GRID_DIMENSIONS.grid_1x2).toEqual({ rows: 1, cols: 2 });
        expect(COMIC_GRID_DIMENSIONS.grid_2x1).toEqual({ rows: 2, cols: 1 });
    });
});

describe("comicPanelRects", () => {
    it("gives a single panel the whole box", () => {
        expect(comicPanelRects("single_panel", BOX)).toEqual([BOX]);
    });

    it("splits 2x2 with one interior gutter per axis", () => {
        const cell = (540 - COMIC_GRID_GUTTER) / 2;
        expect(comicPanelRects("grid_2x2", BOX)).toEqual([
            { x: 36, y: 36, width: cell, height: cell },
            { x: 36 + cell + 6, y: 36, width: cell, height: cell },
            { x: 36, y: 36 + cell + 6, width: cell, height: cell },
            { x: 36 + cell + 6, y: 36 + cell + 6, width: cell, height: cell },
        ]);
    });

    it("returns cells in reading order", () => {
        // Panels are stored by position and dropped into cells in order,
        // so row-major is the contract, not an implementation detail.
        const rects = comicPanelRects("grid_2x3", BOX);
        expect(rects).toHaveLength(6);
        expect(rects[0].y).toBe(rects[1].y);
        expect(rects[1].x).toBeGreaterThan(rects[0].x);
        expect(rects[3].y).toBeGreaterThan(rects[0].y);
        expect(rects[3].x).toBe(rects[0].x);
    });

    it("keeps the outer edges flush with the box", () => {
        for (const template of COMIC_GRID_TEMPLATES) {
            const rects = comicPanelRects(template, BOX);
            const last = rects[rects.length - 1];
            expect(rects[0].x, template).toBe(BOX.x);
            expect(rects[0].y, template).toBe(BOX.y);
            expect(last.x + last.width, template).toBeCloseTo(BOX.x + BOX.width, 6);
            expect(last.y + last.height, template).toBeCloseTo(BOX.y + BOX.height, 6);
        }
    });

    it("never returns a negative cell when the box cannot hold its gutters", () => {
        // A negative width silently flips a rectangle in most renderers
        // instead of failing, so the panel would be drawn mirrored
        // somewhere off-page rather than reported.
        const rects = comicPanelRects("grid_3x3", { x: 0, y: 0, width: 4, height: 4 });
        for (const rect of rects) {
            expect(rect.width).toBeGreaterThanOrEqual(0);
            expect(rect.height).toBeGreaterThanOrEqual(0);
        }
    });

    it("accepts a caller gutter", () => {
        const [first, second] = comicPanelRects("grid_1x2", BOX, 0);
        expect(first.width).toBe(270);
        expect(second.x).toBe(36 + 270);
    });

    it("matches the editor and the backend walker on the gutter", () => {
        // The editor uses gap: 6px, the walker gap: 6pt. A different
        // default here would make the PDF disagree with the canvas the
        // author laid the page out on.
        expect(COMIC_GRID_GUTTER).toBe(6);
    });
});

describe("the templates are a closed set", () => {
    it("names exactly the seven the backend walker knows", () => {
        expect([...COMIC_GRID_TEMPLATES]).toEqual([
            "single_panel",
            "grid_1x2",
            "grid_2x1",
            "grid_2x2",
            "grid_2x3",
            "grid_3x2",
            "grid_3x3",
        ] satisfies ComicGridTemplate[]);
    });
});
