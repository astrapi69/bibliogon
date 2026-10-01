import { describe, expect, it } from "vitest";

import { lineDiff, snapshotPlainText } from "./chapterDiff";

function doc(...paragraphs: string[]): string {
    return JSON.stringify({
        type: "doc",
        content: paragraphs.map((text) => ({
            type: "paragraph",
            content: text ? [{ type: "text", text }] : [],
        })),
    });
}

describe("snapshotPlainText", () => {
    it("flattens a TipTap doc to one line per block", () => {
        expect(snapshotPlainText(doc("Erste Zeile", "Zweite Zeile"))).toBe(
            "Erste Zeile\nZweite Zeile",
        );
    });

    it("drops blank blocks so the diff stays line-oriented", () => {
        expect(snapshotPlainText(doc("Text", "", "  ", "Mehr"))).toBe("Text\nMehr");
    });

    it("keeps a paragraph split across mark runs on one line", () => {
        // Verified against the backend snapshot_plain_text after #929: a
        // paragraph's children are INLINE, so a bold run inside it is not a
        // line break. ProseMirror keeps the whitespace inside the text node,
        // so the siblings concatenate with nothing between them.
        const mixed = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [
                        { type: "text", text: "fett" },
                        { type: "text", text: "kursiv" },
                    ],
                },
                { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "H2" }] },
            ],
        });
        expect(snapshotPlainText(mixed)).toBe("fettkursiv\nH2");
    });

    it("gives each list item its own line", () => {
        const list = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "bulletList",
                    content: [
                        {
                            type: "listItem",
                            content: [
                                { type: "paragraph", content: [{ type: "text", text: "eins" }] },
                            ],
                        },
                        {
                            type: "listItem",
                            content: [
                                { type: "paragraph", content: [{ type: "text", text: "zwei" }] },
                            ],
                        },
                    ],
                },
            ],
        });
        expect(snapshotPlainText(list)).toBe("eins\nzwei");
    });

    it("turns a hard break into a line break", () => {
        const withBreak = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [
                        { type: "text", text: "Zeile1" },
                        { type: "hardBreak" },
                        { type: "text", text: "Zeile2" },
                    ],
                },
            ],
        });
        expect(snapshotPlainText(withBreak)).toBe("Zeile1\nZeile2");
    });

    it("unwraps an imported chapter's HTML instead of diffing raw markup", () => {
        // The backend's snapshot_plain_text got this branch in #847; the port
        // never did, so the offline diff counted every tag as content for the
        // 778-of-833 chapters that are still HTML (#787, #943). The expected
        // string is the backend's own output for this input.
        const html = "<p>Ein Buch über <strong>Bewusstsein</strong> und Zeit.</p>";
        expect(snapshotPlainText(html)).toBe("Ein Buch über Bewusstsein und Zeit.");
    });

    it("passes legacy plain text through", () => {
        expect(snapshotPlainText("nur Text\n\nzweiter Absatz")).toBe("nur Text\nzweiter Absatz");
    });

    it("falls back to the raw string when the JSON does not parse", () => {
        expect(snapshotPlainText('{"type":"doc"')).toBe('{"type":"doc"');
    });

    it("returns an empty string for null/blank content", () => {
        expect(snapshotPlainText(null)).toBe("");
        expect(snapshotPlainText("   \n  ")).toBe("");
    });
});

describe("lineDiff", () => {
    it("marks every line unchanged for identical text", () => {
        expect(lineDiff("a\nb", "a\nb")).toEqual([
            { type: "unchanged", text: "a" },
            { type: "unchanged", text: "b" },
        ]);
    });

    it("marks a line present only in the current text as added", () => {
        expect(lineDiff("a\nc", "a\nb\nc")).toEqual([
            { type: "unchanged", text: "a" },
            { type: "added", text: "b" },
            { type: "unchanged", text: "c" },
        ]);
    });

    it("marks a line gone from the current text as removed", () => {
        expect(lineDiff("a\nb\nc", "a\nc")).toEqual([
            { type: "unchanged", text: "a" },
            { type: "removed", text: "b" },
            { type: "unchanged", text: "c" },
        ]);
    });

    it("emits removed before added for a replaced line (matches ndiff order)", () => {
        expect(lineDiff("a\nalt\nc", "a\nneu\nc")).toEqual([
            { type: "unchanged", text: "a" },
            { type: "removed", text: "alt" },
            { type: "added", text: "neu" },
            { type: "unchanged", text: "c" },
        ]);
    });

    it("treats an empty snapshot as an all-added diff and vice versa", () => {
        expect(lineDiff("", "a\nb")).toEqual([
            { type: "added", text: "a" },
            { type: "added", text: "b" },
        ]);
        expect(lineDiff("a\nb", "")).toEqual([
            { type: "removed", text: "a" },
            { type: "removed", text: "b" },
        ]);
        expect(lineDiff("", "")).toEqual([]);
    });

    it("keeps the added/removed sets correct on a large pair (past the LCS cap)", () => {
        const before = Array.from({ length: 1200 }, (_, i) => `line ${i}`).join("\n");
        const after = [...Array.from({ length: 1200 }, (_, i) => `line ${i}`), "neu"].join("\n");
        const diff = lineDiff(before, after);
        expect(diff.filter((l) => l.type === "added")).toEqual([{ type: "added", text: "neu" }]);
        expect(diff.filter((l) => l.type === "removed")).toEqual([]);
    });
});
