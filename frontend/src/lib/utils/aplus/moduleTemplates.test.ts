/**
 * The A+ module catalog (#895): Amazon's 17 standard modules, each a valid
 * template the editor can build a module from.
 */

import { describe, expect, it } from "vitest";

import {
    APLUS_MODULE_TEMPLATES,
    findTemplate,
    imageSizesSummary,
    slotSpecAt,
} from "./moduleTemplates";

describe("module catalog", () => {
    it("holds the 17 modules KDP offers, with unique slug ids", () => {
        expect(APLUS_MODULE_TEMPLATES).toHaveLength(17);
        const ids = APLUS_MODULE_TEMPLATES.map((t) => t.id);
        expect(new Set(ids).size).toBe(17);
        expect(ids.every((id) => /^[a-z0-9_]{1,40}$/.test(id))).toBe(true);
    });

    it("keeps the two templates documents already use, unchanged", () => {
        expect(findTemplate("image_header_text")?.slots).toEqual([
            expect.objectContaining({ size: "970x600", aspectRatio: "97:60" }),
        ]);
        const three = findTemplate("three_images_text");
        expect(three?.slots).toHaveLength(3);
        expect(three?.slots.every((s) => s.size === "300x300")).toBe(true);
    });

    it("gives every template a consistent slot range and a sketch", () => {
        for (const template of APLUS_MODULE_TEMPLATES) {
            expect(template.minSlots).toBeLessThanOrEqual(template.slots.length);
            expect(template.slots.length).toBeLessThanOrEqual(template.maxSlots);
            expect(template.sketch.length).toBeGreaterThan(0);
            expect(template.name.startsWith("Standard ")).toBe(true);
            if (template.rows) expect(template.rows.min).toBeLessThanOrEqual(template.rows.initial);
        }
    });

    it("marks only the company logo as once per A+ Content", () => {
        expect(APLUS_MODULE_TEMPLATES.filter((t) => t.once).map((t) => t.id)).toEqual(["company_logo"]);
    });

    it("follows Amazon's limits for tables", () => {
        expect(findTemplate("tech_specs")?.rows).toMatchObject({ kind: "pairs", min: 4, max: 16 });
        expect(findTemplate("comparison_chart")).toMatchObject({ maxSlots: 6, rows: { kind: "matrix", max: 10 } });
        expect(findTemplate("product_description")?.fields[0].maxChars).toBe(6000);
    });
});

describe("slotSpecAt", () => {
    it("returns the spec at the place, else the last one", () => {
        const sidebar = findTemplate("image_sidebar")!;
        expect(slotSpecAt(sidebar, 0)?.size).toBe("300x400");
        expect(slotSpecAt(sidebar, 1)?.size).toBe("350x175");
        const chart = findTemplate("comparison_chart")!;
        expect(slotSpecAt(chart, 5)?.size).toBe("150x300");
        expect(slotSpecAt(findTemplate("text")!, 0)).toBeUndefined();
    });
});

describe("imageSizesSummary", () => {
    it("names one size, a count, a range, or distinct sizes", () => {
        expect(imageSizesSummary(findTemplate("image_header_text")!)).toBe("970x600");
        expect(imageSizesSummary(findTemplate("three_images_text")!)).toBe("3 × 300x300");
        expect(imageSizesSummary(findTemplate("comparison_chart")!)).toBe("1-6 × 150x300");
        expect(imageSizesSummary(findTemplate("image_sidebar")!)).toBe("300x400, 350x175");
        expect(imageSizesSummary(findTemplate("text")!)).toBe("");
    });
});
