import {describe, it, expect} from "vitest";

import {
    bledPoints,
    DEFAULT_KDP_MARGIN,
    DEFAULT_KDP_TRIM,
    KDP_BLEED_IN,
    KDP_MARGINS,
    KDP_TRIM_SIZES,
    POINTS_PER_INCH,
    resolveMarginIn,
    resolveTrim,
    trimPoints,
} from "./trim";

describe("KDP trim geometry", () => {
    it("carries the six trims the wizard offers, matching the Python table", () => {
        // The wizard's FormatStep TRIM_SIZES and manuscript_pdf.py's
        // KDP_TRIM_SIZES are the two other copies of this list. A trim
        // present in one and not the others means a user picks a size the
        // PDF is not rendered at.
        expect(Object.keys(KDP_TRIM_SIZES)).toEqual([
            "5x8",
            "5.25x8",
            "5.5x8.5",
            "6x9",
            "7x10",
            "8.5x11",
        ]);
        expect(KDP_TRIM_SIZES["6x9"]).toEqual([6.0, 9.0]);
        expect(KDP_TRIM_SIZES["5.25x8"]).toEqual([5.25, 8.0]);
    });

    it("resolves a known trim to its own dimensions", () => {
        expect(resolveTrim("5.5x8.5")).toEqual({
            id: "5.5x8.5",
            widthIn: 5.5,
            heightIn: 8.5,
        });
    });

    it("falls back rather than throwing on a missing or unknown trim", () => {
        const fallback = {id: DEFAULT_KDP_TRIM, widthIn: 6, heightIn: 9};
        expect(resolveTrim(undefined)).toEqual(fallback);
        expect(resolveTrim(null)).toEqual(fallback);
        expect(resolveTrim("")).toEqual(fallback);
        expect(resolveTrim("4x6")).toEqual(fallback);
        // A prototype key is not a trim. Without an own-property guard
        // `KDP_TRIM_SIZES["constructor"]` is truthy and would be read as a
        // dimension pair.
        expect(resolveTrim("constructor")).toEqual(fallback);
    });

    it("resolves the three margin presets and falls back on anything else", () => {
        expect(resolveMarginIn("narrow")).toBe(0.5);
        expect(resolveMarginIn("normal")).toBe(0.75);
        expect(resolveMarginIn("wide")).toBe(1.0);
        expect(resolveMarginIn("enormous")).toBe(KDP_MARGINS[DEFAULT_KDP_MARGIN]);
        expect(resolveMarginIn(null)).toBe(0.75);
    });

    it("converts inches to PDF points at 72 per inch", () => {
        expect(trimPoints(resolveTrim("6x9"))).toEqual({width: 432, height: 648});
        expect(trimPoints(resolveTrim("5x8"))).toEqual({width: 360, height: 576});
        expect(POINTS_PER_INCH).toBe(72);
    });

    it("grows a bled page by the bleed on all four sides", () => {
        // 0.125in on each edge = 9pt added to each dimension's two sides.
        const bled = bledPoints(resolveTrim("6x9"));
        expect(bled).toEqual({width: 432 + 18, height: 648 + 18});
        expect(KDP_BLEED_IN * POINTS_PER_INCH).toBe(9);
    });
});
