/**
 * #751: the port reproduces the Python translator's extract and rebuild.
 *
 * `tiptapTranslate.parity.json` is recorded by
 * `plugins/bibliogon-plugin-translation/tests/test_translate_parity.py`
 * from the two functions running over inputs chosen to reach all four
 * content shapes a body can hold - TipTap JSON, HTML (what every imported
 * chapter is until someone saves it, #787), plain text, and empty - plus
 * the quirks that survive a round trip.
 *
 * One comparison diverges by necessity: rebuild returns a JSON STRING, and
 * Python's `json.dumps` writes `", "` and `": "` separators where
 * `JSON.stringify` writes none. Byte equality is therefore unreachable and
 * meaningless - the consumer stores a document, not a byte string - so the
 * rebuild cases are compared parsed. The extract cases, which return prose,
 * are compared exactly.
 */

import { describe, expect, it } from "vitest";

import record from "./tiptapTranslate.parity.json";
import {
    extractPlainTextFromTiptap,
    rebuildTiptapWithTranslation,
} from "./tiptapTranslate";

interface ExtractCase {
    name: string;
    content: string;
    expected: string;
}

interface RebuildCase {
    name: string;
    original: string;
    translated: string;
    expected: string;
}

const EXTRACT = record.extract as ExtractCase[];
const REBUILD = record.rebuild as RebuildCase[];

describe("extract parity", () => {
    it("covers every content shape the record carries", () => {
        // A record that silently lost its HTML cases would pass every
        // assertion below while leaving the port's riskiest path unpinned.
        expect(EXTRACT.length).toBeGreaterThanOrEqual(13);
        const names = EXTRACT.map((c) => c.name);
        expect(names).toContain("html-imported");
        expect(names).toContain("plain-text");
        expect(names).toContain("malformed-json");
        expect(names).toContain("empty");
    });

    it.each(EXTRACT.map((c) => [c.name, c] as const))(
        "reproduces %s",
        (_name, testCase) => {
            expect(extractPlainTextFromTiptap(testCase.content)).toBe(testCase.expected);
        },
    );
});

describe("rebuild parity", () => {
    it("covers the segment-count mismatches", () => {
        const names = REBUILD.map((c) => c.name);
        expect(names).toContain("fewer-segments-than-nodes");
        expect(names).toContain("more-segments-than-nodes");
        expect(names).toContain("non-json-original-returns-the-translation");
    });

    it.each(REBUILD.map((c) => [c.name, c] as const))(
        "reproduces %s",
        (_name, testCase) => {
            const got = rebuildTiptapWithTranslation(testCase.original, testCase.translated);
            // Parsed, per the separator note above - except where the
            // recorded value is not JSON at all, which is itself part of
            // the contract (a non-JSON original returns the translation).
            let expectedDoc: unknown;
            try {
                expectedDoc = JSON.parse(testCase.expected);
            } catch {
                expect(got).toBe(testCase.expected);
                return;
            }
            expect(JSON.parse(got)).toEqual(expectedDoc);
        },
    );
});

describe("the round trip", () => {
    it("puts a per-line translation back where it came from", () => {
        // What the feature actually does, end to end over the pure half:
        // extract, translate line by line, rebuild. The assertion is the
        // document, not the intermediate prose.
        const original = JSON.stringify({
            type: "doc",
            content: [
                {type: "paragraph", content: [{type: "text", text: "Erster Satz."}]},
                {type: "paragraph", content: [{type: "text", text: "Zweiter Satz."}]},
            ],
        });
        const prose = extractPlainTextFromTiptap(original);
        const translated = prose
            .split("\n")
            .map((line) => (line ? line.replace("Satz", "sentence") : line))
            .join("\n");
        const rebuilt = JSON.parse(rebuildTiptapWithTranslation(original, translated));
        expect(rebuilt.content[0].content[0].text).toBe("Erster sentence.");
        expect(rebuilt.content[1].content[0].text).toBe("Zweiter sentence.");
    });

    it("keeps marks and attrs through the trip", () => {
        const original = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "heading",
                    attrs: {level: 2},
                    content: [{type: "text", text: "Titel", marks: [{type: "bold"}]}],
                },
            ],
        });
        const rebuilt = JSON.parse(rebuildTiptapWithTranslation(original, "Title"));
        expect(rebuilt.content[0].attrs).toEqual({level: 2});
        expect(rebuilt.content[0].content[0].marks).toEqual([{type: "bold"}]);
        expect(rebuilt.content[0].content[0].text).toBe("Title");
    });

    it("does not mutate the original string's document", () => {
        const original = JSON.stringify({
            type: "doc",
            content: [{type: "paragraph", content: [{type: "text", text: "Eins."}]}],
        });
        rebuildTiptapWithTranslation(original, "One.");
        expect(JSON.parse(original).content[0].content[0].text).toBe("Eins.");
    });
});
