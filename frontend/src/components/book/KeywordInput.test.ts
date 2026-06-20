/**
 * Tests for the KeywordInput validator and its public constants.
 *
 * The component logic (add, inline edit via double-click, delete)
 * all funnel through ``validateKeyword``. Testing the pure helper
 * gives us coverage of the rules without mounting React.
 *
 * Also pins MAX_LENGTH = 50 and RECOMMENDED_MAX = 7 (soft limit).
 */

import {describe, it, expect} from "vitest";
import {
    validateKeyword,
    MAX_LENGTH,
    RECOMMENDED_MAX,
} from "./KeywordInput";

describe("KeywordInput constants", () => {
    it("soft-recommends 7 keywords (Amazon KDP guideline)", () => {
        expect(RECOMMENDED_MAX).toBe(7);
    });

    it("hard-caps individual keyword length at 50 characters", () => {
        expect(MAX_LENGTH).toBe(50);
    });
});

describe("validateKeyword", () => {
    it("accepts a plain keyword", () => {
        const result = validateKeyword("science fiction", []);
        expect(result.ok).toBe(true);
        expect(result.cleaned).toBe("science fiction");
    });

    it("trims surrounding whitespace", () => {
        const result = validateKeyword("  dystopia  ", []);
        expect(result.ok).toBe(true);
        expect(result.cleaned).toBe("dystopia");
    });

    it("rejects empty input with error 'empty'", () => {
        expect(validateKeyword("", []).error).toBe("empty");
        expect(validateKeyword("   ", []).error).toBe("empty");
    });

    it("rejects keywords longer than MAX_LENGTH with error 'too_long'", () => {
        const tooLong = "x".repeat(MAX_LENGTH + 1);
        const result = validateKeyword(tooLong, []);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("too_long");
    });

    it("accepts a keyword at exactly MAX_LENGTH", () => {
        const exact = "x".repeat(MAX_LENGTH);
        expect(validateKeyword(exact, []).ok).toBe(true);
    });

    it("rejects keywords containing a comma with error 'no_comma'", () => {
        const result = validateKeyword("foo, bar", []);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("no_comma");
    });

    it("rejects duplicates case-insensitively", () => {
        const result = validateKeyword("Science Fiction", ["science fiction"]);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("duplicate");
    });

    it("does not consider the ignored index a duplicate (inline edit)", () => {
        // Editing index 0 from 'science fiction' to 'Science Fiction'
        // must succeed because the only collision is the slot we're
        // editing.
        const result = validateKeyword("Science Fiction", ["science fiction", "dystopia"], 0);
        expect(result.ok).toBe(true);
        expect(result.cleaned).toBe("Science Fiction");
    });

    it("still flags duplicates against OTHER slots during inline edit", () => {
        const result = validateKeyword("dystopia", ["science fiction", "dystopia"], 0);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("duplicate");
    });

    it("does NOT enforce a hard 7-keyword cap (soft warning only)", () => {
        // The spec says 7 is a recommendation, not a limit. A validator
        // that rejected the 8th keyword would block the user.
        const sevenKeywords = ["a", "b", "c", "d", "e", "f", "g"];
        const result = validateKeyword("eighth", sevenKeywords);
        expect(result.ok).toBe(true);
        expect(result.cleaned).toBe("eighth");
    });
});
