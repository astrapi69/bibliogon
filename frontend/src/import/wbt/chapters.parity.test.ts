import { describe, it, expect } from "vitest";

import record from "./wbtImport.parity.json";
import { planChapters, readSectionOrder, pythonTitle, detectChapterType } from "./chapters";
import { recordedTree, type RecordedFiles } from "./recordFixtures";

/**
 * The chapter-layout half of the write-book-template parity record (#736).
 *
 * Compares the plan - order, titles, types, positions - against the chapters
 * the backend actually persisted for the same 17 projects.
 *
 * Chapter HTML is deliberately NOT part of the record and so not compared
 * here. The backend converts markdown with Python's `markdown`; the browser
 * uses `marked` into the shared TipTap walker, and that difference is
 * documented as deliberate in `library-first.md` (the walker's output has to
 * fit the editor's `imageFigure` node, which the Python converter knows
 * nothing about). What IS comparable is the text, which the orchestrator's
 * own test checks.
 */
describe("planChapters vs the recorded backend import", () => {
    for (const entry of record.cases) {
        it(entry.name, () => {
            const tree = recordedTree(entry.files as RecordedFiles);
            const plan = planChapters(tree, readSectionOrder(tree));
            expect(
                plan.map(({ title, chapter_type, position }) => ({
                    title,
                    chapter_type,
                    position,
                })),
            ).toEqual(
                entry.chapters.map(({ title, chapter_type, position }) => ({
                    title,
                    chapter_type,
                    position,
                })),
            );
        });
    }

    it("covers both layouts", () => {
        // A record where every project declared a section_order would leave
        // the alphabetical fallback - and its 0/100/900 position bases -
        // unpinned. Assert both shapes are present rather than trusting it.
        const bases = new Set<number>();
        for (const entry of record.cases) {
            for (const chapter of entry.chapters) bases.add(chapter.position);
        }
        expect(bases.has(0)).toBe(true);
        expect(bases.has(100)).toBe(true);
        expect(bases.has(900)).toBe(true);
    });
});

describe("pythonTitle", () => {
    // Expected values taken from CPython's str.title() for the same inputs,
    // not from reading this implementation.
    it.each([
        ["der lange weg", "Der Lange Weg"],
        ["über nacht", "Über Nacht"],
        ["straße", "Straße"],
        ["don't stop", "Don'T Stop"],
        ["a1b c", "A1B C"],
        ["ÜBER ALLES", "Über Alles"],
        ["x-y z", "X-Y Z"],
        ["  spaced  ", "  Spaced  "],
        ["3d print", "3D Print"],
        ["café", "Café"],
    ])("titles %j as %j", (input, expected) => {
        expect(pythonTitle(input)).toBe(expected);
    });
});

describe("detectChapterType", () => {
    it.each([
        ["01-0-part-1-intro", "part_intro"],
        ["05-1-interludium", "interlude"],
        ["06-interlude", "interlude"],
        ["02-kapitel", "chapter"],
        ["part", "part_intro"],
        ["kapitel-part-zwei", "chapter"],
    ])("reads %j as %j", (stem, expected) => {
        // The last case is the boundary: the patterns match as a PREFIX of
        // the cleaned stem, so a stem that merely contains "part" is not one.
        expect(detectChapterType(stem)).toBe(expected);
    });
});
