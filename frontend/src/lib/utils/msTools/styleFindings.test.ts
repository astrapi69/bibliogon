import {describe, expect, it} from "vitest";

import {checkStyle} from "./styleFindings";

/** Every finding's offset must index the word it names. */
function offsetsPointAtTheirWords(text: string, language = "de") {
    for (const finding of checkStyle(text, language).findings) {
        if (finding.type === "long_sentence") continue;
        const slice = text.slice(finding.offset, finding.offset + finding.length);
        expect(slice.toLowerCase(), `${finding.type} at ${finding.offset}`).toBe(
            finding.word.toLowerCase(),
        );
    }
}

describe("checkStyle", () => {
    it("reports nothing for text with no issues", () => {
        const result = checkStyle("Der Hund lag im Hof.", "de");
        expect(result.findings).toEqual([]);
        expect(result.finding_count).toBe(0);
        expect(result.total_words).toBe(5);
        expect(result.total_sentences).toBe(1);
    });

    it("returns zero ratios for empty text instead of dividing by zero", () => {
        const result = checkStyle("", "de");
        expect(result).toMatchObject({
            total_words: 0,
            total_sentences: 0,
            filler_ratio: 0,
            passive_ratio: 0,
            adverb_ratio: 0,
            adjective_ratio: 0,
            findings: [],
        });
    });

    it("treats whitespace-only text as empty", () => {
        expect(checkStyle("   \n  ", "de").total_words).toBe(0);
    });

    it("finds a filler word and says where it is", () => {
        const text = "Das ist eigentlich einfach.";
        const filler = checkStyle(text, "de").findings.filter(
            (f) => f.type === "filler_word",
        );
        expect(filler.map((f) => f.word)).toContain("eigentlich");
        expect(text.slice(filler[0].offset, filler[0].offset + filler[0].length)).toBe(
            "eigentlich",
        );
    });

    it("matches a filler word whatever its case", () => {
        expect(
            checkStyle("Eigentlich ist das einfach.", "de").findings.some(
                (f) => f.type === "filler_word" && f.word === "eigentlich",
            ),
        ).toBe(true);
    });

    it("does not match a filler word inside a longer one", () => {
        // "ja" is a German filler; "Jahrgang" is not two words.
        expect(
            checkStyle("Der Jahrgang war gut.", "de").findings.some(
                (f) => f.type === "filler_word" && f.word === "ja",
            ),
        ).toBe(false);
    });

    it("keeps offsets correct across umlauts", () => {
        offsetsPointAtTheirWords(
            "Natürlich war es gewissermaßen grundsätzlich übrigens klar.",
        );
    });

    it("keeps offsets correct after an astral character", () => {
        const text = "\u{1F3E0} Das ist eigentlich einfach.";
        expect([...text].length).toBeLessThan(text.length);
        offsetsPointAtTheirWords(text);
    });

    it("flags a sentence over the limit and carries its word count", () => {
        const long = `Er ${"ging ".repeat(30)}fort.`;
        const [finding] = checkStyle(long, "de").findings.filter(
            (f) => f.type === "long_sentence",
        );
        expect(finding.severity).toBe("warning");
        expect(finding.word_count).toBeGreaterThan(25);
        expect(finding.max_words).toBe(25);
    });

    it("respects a raised sentence limit", () => {
        const long = `Er ${"ging ".repeat(30)}fort.`;
        expect(
            checkStyle(long, "de", {maxSentenceLength: 100}).long_sentence_count,
        ).toBe(0);
    });

    it("does not flag a sentence exactly at the limit", () => {
        const exactly = `${"wort ".repeat(24)}wort.`;
        expect(checkStyle(exactly, "de").total_words).toBe(25);
        expect(checkStyle(exactly, "de").long_sentence_count).toBe(0);
    });

    it("ignores stop words when looking for repetitions", () => {
        const result = checkStyle("Der Hund und der Hund.", "de");
        const repeats = result.findings.filter((f) => f.type === "word_repetition");
        expect(repeats.map((f) => f.word)).toEqual(["hund"]);
        expect(repeats[0].distance).toBeGreaterThan(0);
    });

    it("stops reporting a repetition outside the window", () => {
        // Padded with a stop word: it is skipped by the repetition check
        // but still takes a position, which is what the window counts.
        const far = `Garten ${"der ".repeat(60)}Garten.`;
        expect(checkStyle(far, "de").repetition_count).toBe(0);
        expect(
            checkStyle(far, "de", {repetitionWindow: 100}).repetition_count,
        ).toBe(1);
    });

    it("skips the known adjective false positives", () => {
        expect(checkStyle("Die Landschaft der Gesellschaft.", "de").adjective_count).toBe(
            0,
        );
        expect(checkStyle("The table is stable.", "en").adjective_count).toBe(0);
    });

    it("carries the shorter form on a redundant phrase", () => {
        const [finding] = checkStyle(
            "In my personal opinion it works.",
            "en",
        ).findings.filter((f) => f.type === "redundant_phrase");
        expect(finding.word).toBe("personal opinion");
        expect(finding.suggestion).toBe("opinion");
    });

    it("falls back to the English tables for an unknown language", () => {
        expect(
            checkStyle("This is actually simple.", "zz").filler_count,
        ).toBeGreaterThan(0);
    });

    it("rounds the ratios to four decimals", () => {
        const result = checkStyle("Das ist eigentlich wirklich einfach genug hier.", "de");
        for (const ratio of [
            result.filler_ratio,
            result.passive_ratio,
            result.adverb_ratio,
            result.adjective_ratio,
        ]) {
            expect(ratio).toBe(Math.round(ratio * 10000) / 10000);
        }
    });

    it("counts each finding type into its own total", () => {
        const result = checkStyle("Das ist eigentlich einfach.", "de");
        const sum =
            result.filler_count +
            result.passive_count +
            result.long_sentence_count +
            result.repetition_count +
            result.adverb_count +
            result.adjective_count +
            result.redundant_phrase_count;
        expect(sum).toBe(result.finding_count);
    });
});
