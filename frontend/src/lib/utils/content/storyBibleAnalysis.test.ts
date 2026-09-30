import { describe, expect, it } from "vitest";

import {
    computeContinuityWarnings,
    countEntityMentions,
    detectUnlinkedMentions,
    storyBiblePlainText,
    MIN_ENTITY_NAME_LENGTH,
} from "./storyBibleAnalysis";

const tiptap = (...paragraphs: string[]) =>
    JSON.stringify({
        type: "doc",
        content: paragraphs.map((text) => ({
            type: "paragraph",
            content: [{ type: "text", text }],
        })),
    });

describe("storyBiblePlainText", () => {
    it("flattens a TipTap document to its text", () => {
        expect(storyBiblePlainText(tiptap("Max ging fort.", "Lisa blieb."))).toContain(
            "Max ging fort.",
        );
        expect(storyBiblePlainText(tiptap("Max ging fort.", "Lisa blieb."))).toContain(
            "Lisa blieb.",
        );
    });

    it("strips HTML rather than matching against the markup", () => {
        const text = storyBiblePlainText('<p>Siehe <a href="/w/Mueller">dort</a>.</p>');
        expect(text).toBe("Siehe dort.");
    });

    it("passes plain text and empty input through", () => {
        expect(storyBiblePlainText("Nur Text")).toBe("Nur Text");
        expect(storyBiblePlainText(null)).toBe("");
        expect(storyBiblePlainText(undefined)).toBe("");
    });

    it("returns the raw string when the JSON is malformed", () => {
        expect(storyBiblePlainText("{kaputt")).toBe("{kaputt");
    });
});

describe("countEntityMentions", () => {
    it("counts case-insensitively on word boundaries", () => {
        expect(countEntityMentions("Max", "Max traf max, aber MAX ging.")).toBe(3);
    });

    it("does not match inside a longer word", () => {
        expect(countEntityMentions("Tom", "Tomate und Tomaten.")).toBe(0);
        expect(countEntityMentions("Tom", "Tom isst eine Tomate.")).toBe(1);
    });

    it("respects Unicode word boundaries the way Python's \\w does", () => {
        // A leading umlaut is a word character, so ASCII-only \b would
        // refuse to match at the start of the string and match inside
        // "Ökologie" - both wrong.
        expect(countEntityMentions("Öko", "Öko ist gut.")).toBe(1);
        expect(countEntityMentions("Öko", "Ökologie ist gut.")).toBe(0);
        expect(countEntityMentions("mile", "Émile kam.")).toBe(0);
    });

    it("counts non-overlapping matches, left to right", () => {
        expect(countEntityMentions("a a", "a a a")).toBe(1);
    });

    it("returns zero for empty text", () => {
        expect(countEntityMentions("Max", "")).toBe(0);
    });
});

describe("detectUnlinkedMentions", () => {
    const entities = [
        { id: "e1", name: "Max", entity_type: "character" },
        { id: "e2", name: "Lisa", entity_type: "character" },
    ];

    it("proposes one link per unlinked chapter/page mention", () => {
        const proposals = detectUnlinkedMentions({
            entities,
            chapters: [{ id: "c1", title: "Kapitel 1", content: tiptap("Max traf Max.") }],
            pages: [{ id: "p1", position: 2, text_content: "Lisa winkte." }],
            links: [],
        });
        expect(proposals).toEqual([
            {
                entity_id: "e1",
                entity_name: "Max",
                entity_type: "character",
                page_id: null,
                chapter_id: "c1",
                ref_label: "Kapitel 1",
                occurrences: 2,
            },
            {
                entity_id: "e2",
                entity_name: "Lisa",
                entity_type: "character",
                page_id: "p1",
                chapter_id: null,
                ref_label: "Page 2",
                occurrences: 1,
            },
        ]);
    });

    it("excludes pairs that are already linked", () => {
        const proposals = detectUnlinkedMentions({
            entities,
            chapters: [{ id: "c1", title: "K1", content: "Max und Lisa." }],
            pages: [],
            links: [{ entity_id: "e1", chapter_id: "c1", page_id: null }],
        });
        expect(proposals.map((p) => p.entity_id)).toEqual(["e2"]);
    });

    it("skips names shorter than the minimum length", () => {
        expect(MIN_ENTITY_NAME_LENGTH).toBe(3);
        const proposals = detectUnlinkedMentions({
            entities: [{ id: "e1", name: "Al", entity_type: "character" }],
            chapters: [{ id: "c1", title: "K1", content: "Al kam." }],
            pages: [],
            links: [],
        });
        expect(proposals).toEqual([]);
    });

    it("falls back to the chapter id when the title is empty", () => {
        const proposals = detectUnlinkedMentions({
            entities: [entities[0]],
            chapters: [{ id: "c1", title: "", content: "Max kam." }],
            pages: [],
            links: [],
        });
        expect(proposals[0].ref_label).toBe("c1");
    });

    it("returns nothing when the book has no entities", () => {
        expect(
            detectUnlinkedMentions({
                entities: [],
                chapters: [{ id: "c1", title: "K1", content: "Max kam." }],
                pages: [],
                links: [],
            }),
        ).toEqual([]);
    });
});

describe("computeContinuityWarnings", () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}`, position: i + 1 }));

    it("flags pages without any entity link", () => {
        const warnings = computeContinuityWarnings(
            [
                { id: "p1", position: 1 },
                { id: "p2", position: 2 },
            ],
            [{ page_id: "p1", entity_id: "e1", entity_name: "Max" }],
        );
        expect(warnings).toEqual([{ code: "empty_page", page_id: "p2", page_position: 2 }]);
    });

    it("flags an internal gap at the threshold but not below it", () => {
        const links = (positions: number[]) =>
            positions.map((p) => ({ page_id: `p${p}`, entity_id: "e1", entity_name: "Max" }));
        const atThreshold = computeContinuityWarnings(pages, links([1, 7, 10]));
        expect(atThreshold.filter((w) => w.code === "entity_gap")).toEqual([
            {
                code: "entity_gap",
                page_id: "p1",
                page_position: 1,
                entity_id: "e1",
                entity_name: "Max",
                gap_to_position: 7,
            },
        ]);
        const belowThreshold = computeContinuityWarnings(pages, links([1, 6, 10]));
        expect(belowThreshold.filter((w) => w.code === "entity_gap")).toEqual([]);
    });

    it("flags an entity that never returns after its last appearance", () => {
        const warnings = computeContinuityWarnings(
            pages,
            pages.slice(0, 5).map((p) => ({ page_id: p.id, entity_id: "e1", entity_name: "Max" })),
        );
        expect(warnings.filter((w) => w.code === "entity_disappears")).toEqual([
            {
                code: "entity_disappears",
                page_id: "p5",
                page_position: 5,
                entity_id: "e1",
                entity_name: "Max",
            },
        ]);
    });

    it("honours a custom gap threshold", () => {
        const links = [1, 4].map((p) => ({ page_id: `p${p}`, entity_id: "e1", entity_name: "Max" }));
        expect(
            computeContinuityWarnings(pages.slice(0, 4), links, { gapThreshold: 2 })
                .filter((w) => w.code === "entity_gap")
                .map((w) => w.gap_to_position),
        ).toEqual([4]);
    });

    it("returns nothing when the book has no pages", () => {
        expect(computeContinuityWarnings([], [])).toEqual([]);
    });

    it("ignores links pointing at a page outside the book", () => {
        const warnings = computeContinuityWarnings(
            [{ id: "p1", position: 1 }],
            [
                { page_id: "p1", entity_id: "e1", entity_name: "Max" },
                { page_id: "ghost", entity_id: "e2", entity_name: "Lisa" },
            ],
        );
        expect(warnings).toEqual([]);
    });
});
