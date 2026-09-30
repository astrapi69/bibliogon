import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { chapterTypeLabels } from "./chapterTypeLabels";

const identity = (_key: string, fallback?: string) => fallback ?? "";

/**
 * Read the backend `ChapterType` enum's values straight from the model.
 *
 * `backend/app/models/__init__.py` is the single source of truth for the
 * set; parsing it here is what makes the assertion below a real guard
 * rather than a second hand-maintained list that can drift alongside the
 * first one.
 */
function backendChapterTypes(): string[] {
    const source = fs.readFileSync(
        path.resolve(__dirname, "../../../backend/app/models/__init__.py"),
        "utf-8",
    );
    const block = /class ChapterType\b[\s\S]*?(?=\nclass |\n@|$)/.exec(source);
    if (!block) throw new Error("ChapterType enum not found in the backend model");
    return [...block[0].matchAll(/^\s+[A-Z_]+\s*=\s*"([a-z_]+)"/gm)].map((m) => m[1]);
}

describe("ChapterType parity with the backend enum", () => {
    // The frontend union is a type, so it has no runtime form. The label
    // map is `Record<ChapterType, string>`, so the compiler already
    // forces its keys to be exactly the union - which makes those keys a
    // faithful runtime stand-in for it.
    const frontendTypes = Object.keys(chapterTypeLabels(identity));

    it("covers every backend chapter type", () => {
        const backend = backendChapterTypes();
        expect(backend.length).toBeGreaterThan(0);
        expect([...frontendTypes].sort()).toEqual([...backend].sort());
    });

    it("gives every type a non-empty label", () => {
        const labels = chapterTypeLabels(identity);
        for (const [type, label] of Object.entries(labels)) {
            expect(label, `chapter type "${type}" has no fallback label`).not.toBe("");
        }
    });
});
