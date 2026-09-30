import { describe, it, expect } from "vitest";

import { computeChapterMetrics, extractPlainText } from "./chapterMetrics";
import type { Chapter } from "../../api/types";

function makeChapter(partial: Partial<Chapter> & { id: string }): Chapter {
    return {
        book_id: "book-1",
        title: "Kapitel",
        content: "",
        position: 0,
        chapter_type: "chapter",
        created_at: "",
        updated_at: "",
        version: 1,
        ...partial,
    } as Chapter;
}

function tiptap(...paragraphs: string[]): string {
    return JSON.stringify({
        type: "doc",
        content: paragraphs.map((text) => ({
            type: "paragraph",
            content: [{ type: "text", text }],
        })),
    });
}

describe("extractPlainText", () => {
    it("extracts text from TipTap JSON and joins blocks", () => {
        const text = extractPlainText(tiptap("Erster Satz.", "Zweiter Satz."));
        expect(text).toContain("Erster Satz.");
        expect(text).toContain("Zweiter Satz.");
    });

    it("returns a raw string unchanged when not JSON", () => {
        expect(extractPlainText("plain text")).toBe("plain text");
    });

    it("returns empty string for null/empty content", () => {
        expect(extractPlainText("")).toBe("");
        expect(extractPlainText(null)).toBe("");
    });

    // An imported chapter stays HTML until someone opens and saves it in
    // the editor (#787) - 779 of 834 on the dev library - so this is the
    // common shape, not an edge case (#914).
    it("strips HTML instead of counting the markup as prose", () => {
        expect(extractPlainText("<p>Hallo <strong>Welt</strong>.</p>")).toBe("Hallo Welt.");
    });

    it("keeps block boundaries when stripping HTML", () => {
        expect(extractPlainText("<h2>Titel</h2><p>Erster Satz.</p><p>Zweiter Satz.</p>")).toBe(
            "Titel\nErster Satz.\nZweiter Satz.",
        );
    });

    it("drops attribute values, which are never prose", () => {
        expect(extractPlainText('<p>Siehe <a href="/wiki/Goethe">dort</a>.</p>')).toBe(
            "Siehe dort.",
        );
    });

    it("leaves genuine plain text alone", () => {
        expect(extractPlainText("Kein Markup, nur Text.")).toBe("Kein Markup, nur Text.");
    });
});

describe("computeChapterMetrics on imported (HTML) chapters", () => {
    it("counts words of the prose, not of the tags", () => {
        const html = "<p>Ein kurzer Satz.</p><p>Noch ein Satz.</p>";
        const equivalent = tiptap("Ein kurzer Satz.", "Noch ein Satz.");
        const fromHtml = computeChapterMetrics("Importiert", "de", [
            makeChapter({ id: "c1", content: html }),
        ]);
        const fromJson = computeChapterMetrics("Getippt", "de", [
            makeChapter({ id: "c1", content: equivalent }),
        ]);
        expect(fromHtml.chapters[0].word_count).toBe(6);
        expect(fromHtml.chapters[0].word_count).toBe(fromJson.chapters[0].word_count);
        expect(fromHtml.chapters[0].sentence_count).toBe(fromJson.chapters[0].sentence_count);
    });

    it("does not read class names and hrefs as words", () => {
        const noisy =
            '<div class="chapter-body"><p>Nur <em>drei</em> Woerter.</p>' +
            '<p><a href="https://example.com/a/very/long/path">Link</a></p></div>';
        const metrics = computeChapterMetrics("Importiert", "de", [
            makeChapter({ id: "c1", content: noisy }),
        ]);
        expect(metrics.chapters[0].word_count).toBe(4);
    });
});

describe("computeChapterMetrics", () => {
    it("returns empty averages and zero chapters for a book without chapters", () => {
        const result = computeChapterMetrics("Leeres Buch", "de", []);
        expect(result.book_title).toBe("Leeres Buch");
        expect(result.chapter_count).toBe(0);
        expect(result.chapters).toHaveLength(0);
        expect(result.averages).toEqual({});
    });

    it("computes metrics for a chapter with text (happy path)", () => {
        const result = computeChapterMetrics("Mein Buch", "de", [
            makeChapter({
                id: "c1",
                content: tiptap(
                    "Das ist ein einfacher Satz. Hier folgt noch ein zweiter Satz.",
                ),
            }),
        ]);
        const ch = result.chapters[0];
        expect(ch.empty).toBe(false);
        expect(ch.word_count).toBeGreaterThan(0);
        expect(ch.sentence_count).toBe(2);
        expect(ch.flesch_reading_ease).toBeGreaterThan(0);
        expect(ch.long_sentences).toBeDefined();
        // Averages cover the non-empty chapter.
        expect(result.averages.word_count).toBe(ch.word_count);
        expect(result.averages.flesch_reading_ease).toBeCloseTo(ch.flesch_reading_ease, 1);
    });

    it("marks a chapter without text as empty with dash-worthy zero metrics", () => {
        const result = computeChapterMetrics("Buch", "de", [
            makeChapter({ id: "empty", content: tiptap("") }),
        ]);
        const ch = result.chapters[0];
        expect(ch.empty).toBe(true);
        expect(ch.word_count).toBe(0);
        expect(ch.sentence_count).toBe(0);
        expect(ch.flesch_reading_ease).toBe(0);
        // No non-empty chapters -> no averages.
        expect(result.averages).toEqual({});
    });

    it("detects long sentences (>25 words)", () => {
        const longSentence = `${Array.from({ length: 40 }, (_, i) => `wort${i}`).join(" ")}.`;
        const result = computeChapterMetrics("Buch", "de", [
            makeChapter({ id: "c1", content: tiptap(`${longSentence} Kurz.`) }),
        ]);
        const ch = result.chapters[0];
        expect(ch.long_sentence_count).toBe(1);
        expect(ch.long_sentences?.[0].word_count).toBeGreaterThan(25);
    });

    it("detects German filler words in the ratio", () => {
        const result = computeChapterMetrics("Buch", "de", [
            makeChapter({
                id: "c1",
                content: tiptap("Das ist eigentlich wirklich natürlich ein Satz."),
            }),
        ]);
        // eigentlich + wirklich + natürlich -> filler_ratio > 0.
        expect(result.chapters[0].filler_ratio).toBeGreaterThan(0);
    });

    it("handles a very long chapter (>10000 words) without crashing", () => {
        const huge = `${Array.from({ length: 10500 }, (_, i) => `wort${i}`).join(" ")}.`;
        const result = computeChapterMetrics("Buch", "de", [
            makeChapter({ id: "big", content: tiptap(huge) }),
        ]);
        const ch = result.chapters[0];
        expect(ch.empty).toBe(false);
        expect(ch.word_count).toBeGreaterThan(10000);
        // One giant sentence -> counted as a long sentence.
        expect(ch.long_sentence_count).toBe(1);
    });

    it("orders chapters by position regardless of input order", () => {
        const result = computeChapterMetrics("Buch", "de", [
            makeChapter({ id: "b", position: 1, content: tiptap("Zwei.") }),
            makeChapter({ id: "a", position: 0, content: tiptap("Eins.") }),
        ]);
        expect(result.chapters.map((c) => c.chapter_id)).toEqual(["a", "b"]);
    });

    it("falls back to German when language is null", () => {
        const result = computeChapterMetrics("Buch", null, [
            makeChapter({ id: "c1", content: tiptap("Ein deutscher Satz hier.") }),
        ]);
        expect(result.chapters[0].flesch_reading_ease).toBeGreaterThan(0);
    });
});
