import { describe, expect, it } from "vitest";

import { toUtf16Offsets, utf16OffsetTable } from "./styleOffsets";

const HOUSE = "\u{1F3E0}"; // one code point, two UTF-16 units

describe("utf16OffsetTable", () => {
    it("is the identity for a BMP-only string, plus a sentinel", () => {
        expect(utf16OffsetTable("abc")).toEqual([0, 1, 2, 3]);
    });

    it("advances by two across an astral character", () => {
        expect(utf16OffsetTable(`${HOUSE}ab`)).toEqual([0, 2, 3, 4]);
    });

    it("handles an empty string", () => {
        expect(utf16OffsetTable("")).toEqual([0]);
    });

    it("counts a combining mark as its own code point", () => {
        // "e" + U+0301 is two code points and two UTF-16 units; the table
        // must not try to be grapheme-aware, because the Python side is
        // not either.
        expect(utf16OffsetTable("éx")).toEqual([0, 1, 2, 3]);
    });
});

describe("toUtf16Offsets", () => {
    it("shifts a finding that follows an astral character", () => {
        // The case from #1039: Python finds 'eigentlich' at code point 10,
        // and text.slice(10, 20) in JavaScript is ' eigentlic' - one short.
        const text = `${HOUSE} Das ist eigentlich einfach.`;
        expect(text.slice(10, 20)).toBe(" eigentlic");
        const [fixed] = toUtf16Offsets(text, [{ offset: 10, length: 10 }]);
        expect(text.slice(fixed.offset, fixed.offset + fixed.length)).toBe("eigentlich");
    });

    it("leaves a finding before the astral character alone", () => {
        const text = `Das ${HOUSE} eigentlich`;
        const [fixed] = toUtf16Offsets(text, [{ offset: 0, length: 3 }]);
        expect(fixed).toMatchObject({ offset: 0, length: 3 });
    });

    it("widens a finding that spans an astral character", () => {
        // length is recomputed from the converted endpoints, not carried
        // over: a match containing an emoji is longer in UTF-16, and
        // keeping the old length would end the decoration mid-character.
        const text = `ab${HOUSE}cd`;
        const [fixed] = toUtf16Offsets(text, [{ offset: 1, length: 3 }]);
        expect(fixed.offset).toBe(1);
        expect(fixed.length).toBe(4);
        expect(text.slice(fixed.offset, fixed.offset + fixed.length)).toBe(`b${HOUSE}c`);
    });

    it("shifts by two per astral character, not once", () => {
        const text = `${HOUSE}${HOUSE} eigentlich`;
        const [fixed] = toUtf16Offsets(text, [{ offset: 3, length: 10 }]);
        expect(text.slice(fixed.offset, fixed.offset + fixed.length)).toBe("eigentlich");
    });

    it("returns the findings unchanged for a BMP-only text", () => {
        const findings = [{ offset: 4, length: 3 }];
        expect(toUtf16Offsets("Das ist einfach", findings)).toEqual(findings);
    });

    it("does not mutate the input", () => {
        const findings = [{ offset: 10, length: 10 }];
        toUtf16Offsets(`${HOUSE} Das ist eigentlich einfach.`, findings);
        expect(findings[0]).toEqual({ offset: 10, length: 10 });
    });

    it("carries every other field over", () => {
        const [fixed] = toUtf16Offsets(`${HOUSE}abc`, [
            { offset: 1, length: 1, type: "filler_word", word: "a", severity: "info" },
        ]);
        expect(fixed).toMatchObject({ type: "filler_word", word: "a", severity: "info" });
    });

    it("clamps an offset past the end of the text", () => {
        // A finding that does not fit the text it was computed from is a
        // bug elsewhere; a NaN position would put the decoration nowhere,
        // a clamped one puts it somewhere visible.
        const text = `${HOUSE}ab`;
        const [fixed] = toUtf16Offsets(text, [{ offset: 99, length: 5 }]);
        expect(Number.isFinite(fixed.offset)).toBe(true);
        expect(fixed.offset).toBe(text.length);
        expect(fixed.length).toBe(0);
    });
});
