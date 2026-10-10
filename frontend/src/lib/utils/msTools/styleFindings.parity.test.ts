/**
 * #733: the port reproduces the Python checker's output.
 *
 * `styleFindings.parity.json` is recorded by
 * `plugins/bibliogon-plugin-ms-tools/tests/test_style_check_parity.py`
 * from `check_style` running over 23 texts chosen to reach every
 * finding type in every language the tables cover. This asserts the
 * port produces the same counts, the same ratios and the same findings
 * in the same order.
 *
 * One case diverges on purpose. See `ASTRAL_OFFSET_CASES`.
 */

import {describe, expect, it} from "vitest";

import record from "./styleFindings.parity.json";
import {checkStyle, type StyleCheckResult} from "./styleFindings";

interface RecordedCase {
    name: string;
    language: string;
    text: string;
    expected: StyleCheckResult;
}

const CASES = record.cases as unknown as RecordedCase[];

/**
 * Cases whose text holds an astral character, where offsets cannot
 * agree: Python counts code points, this counts UTF-16 units, and the
 * consumer is a JavaScript string walk. Everything else is compared as
 * usual; the offsets are asserted to be the correct ones for this
 * runtime instead, which is the stronger claim.
 */
const ASTRAL_OFFSET_CASES = new Set(["astral-before-finding"]);

/** The record carries the whole response; compare it minus the offsets. */
function withoutOffsets(result: StyleCheckResult) {
    return {
        ...result,
        findings: result.findings.map(({offset: _offset, ...rest}) => rest),
    };
}

describe("style-check parity with the Python checker", () => {
    it("records the thresholds the port defaults to", () => {
        expect(record.defaults).toEqual({
            max_sentence_length: 25,
            repetition_window: 50,
        });
    });

    it.each(CASES.map((c) => [c.name, c] as const))("%s", (name, testCase) => {
        const actual = checkStyle(testCase.text, testCase.language);
        if (ASTRAL_OFFSET_CASES.has(name)) {
            expect(withoutOffsets(actual)).toEqual(
                withoutOffsets(testCase.expected),
            );
            return;
        }
        expect(actual).toEqual(testCase.expected);
    });

    it.each([...ASTRAL_OFFSET_CASES])(
        "%s reports offsets this runtime can use",
        (name) => {
            const testCase = CASES.find((c) => c.name === name);
            expect(testCase, `${name} is not in the record`).toBeDefined();
            const {text} = testCase!;
            expect([...text].length).toBeLessThan(text.length);

            const actual = checkStyle(text, testCase!.language);
            expect(actual.findings.length).toBeGreaterThan(0);
            for (const finding of actual.findings) {
                if (finding.type === "long_sentence") continue;
                const slice = text.slice(
                    finding.offset,
                    finding.offset + finding.length,
                );
                expect(
                    slice.toLowerCase(),
                    `${finding.type} at ${finding.offset} points at ${slice}`,
                ).toBe(finding.word.toLowerCase());
            }

            // And the recorded code-point offsets would not: this is the
            // divergence, not a tolerance.
            const recorded = testCase!.expected.findings[0];
            expect(actual.findings[0].offset).not.toBe(recorded.offset);
        },
    );

    it("every finding in every other case points at the word it names", () => {
        for (const testCase of CASES) {
            if (ASTRAL_OFFSET_CASES.has(testCase.name)) continue;
            const {text} = testCase;
            for (const finding of checkStyle(text, testCase.language).findings) {
                if (finding.type === "long_sentence") continue;
                const slice = text.slice(
                    finding.offset,
                    finding.offset + finding.length,
                );
                expect(
                    slice.toLowerCase(),
                    `${testCase.name}: ${finding.type} at ${finding.offset} points at ${slice}`,
                ).toBe(finding.word.toLowerCase());
            }
        }
    });

    it("covers every finding type", () => {
        const types = new Set(
            CASES.flatMap((c) => c.expected.findings.map((f) => f.type)),
        );
        expect([...types].sort()).toEqual([
            "adjective",
            "adverb",
            "filler_word",
            "long_sentence",
            "passive_voice",
            "redundant_phrase",
            "word_repetition",
        ]);
    });
});
