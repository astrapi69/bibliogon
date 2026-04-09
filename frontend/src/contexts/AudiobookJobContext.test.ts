import {describe, it, expect} from "vitest";

import {formatChapterPrefix} from "./AudiobookJobContext";

describe("formatChapterPrefix", () => {
    it("uses two-digit padding for books with under 100 chapters", () => {
        expect(formatChapterPrefix(1, 12)).toBe("01");
        expect(formatChapterPrefix(7, 12)).toBe("07");
        expect(formatChapterPrefix(12, 12)).toBe("12");
        expect(formatChapterPrefix(99, 99)).toBe("99");
    });

    it("uses three-digit padding once the book hits 100+ chapters", () => {
        expect(formatChapterPrefix(1, 100)).toBe("001");
        expect(formatChapterPrefix(42, 250)).toBe("042");
        expect(formatChapterPrefix(250, 250)).toBe("250");
    });

    it("falls back to two-digit when total is unknown (0)", () => {
        // The progress popover sometimes renders before the start event
        // sets ``total``. Two-digit is the friendlier default than the
        // raw number.
        expect(formatChapterPrefix(3, 0)).toBe("03");
    });
});
