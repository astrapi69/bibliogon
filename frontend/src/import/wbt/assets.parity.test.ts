import { describe, it, expect } from "vitest";

import record from "./wbtImport.parity.json";
import { planAssets, classifyAssetType, chooseCoverImage } from "./assets";
import { parseMetadataYaml, parseProjectMetadata } from "./metadata";
import { recordedTree, type RecordedFiles } from "./recordFixtures";

/**
 * The asset half of the write-book-template parity record (#736).
 *
 * `filename` and `asset_type` are compared against the rows the backend
 * persisted. The stored PATH is not: the backend writes an absolute uploads
 * path because it serves the file from disk, and the browser keeps the bytes
 * in IndexedDB behind the storage seam. The decision - which files become
 * assets, and what each one is - is the same, and that is what is pinned.
 */
describe("planAssets vs the recorded backend import", () => {
    for (const entry of record.cases) {
        it(entry.name, () => {
            const tree = recordedTree(entry.files as RecordedFiles);
            const planned = planAssets(tree).map(({ filename, asset_type }) => ({
                filename,
                asset_type,
            }));
            expect(planned.sort((a, b) => a.filename.localeCompare(b.filename))).toEqual(
                entry.assets
                    .map(({ filename, asset_type }) => ({ filename, asset_type }))
                    .sort((a, b) => a.filename.localeCompare(b.filename)),
            );
        });
    }

    it("covers more than one asset type", () => {
        // A record where every project shipped one cover would leave the
        // folder-to-type map unpinned.
        const types = new Set(record.cases.flatMap((c) => c.assets.map((a) => a.asset_type)));
        expect(types.size).toBeGreaterThanOrEqual(4);
    });
});

describe("chooseCoverImage vs the recorded backend choice", () => {
    for (const entry of record.cases) {
        it(entry.name, () => {
            const tree = recordedTree(entry.files as RecordedFiles);
            const metadata = parseProjectMetadata(parseMetadataYaml(tree), tree, "book");
            const chosen = chooseCoverImage(metadata.cover_image, planAssets(tree));
            const recorded = entry.book.cover_image as string | null;
            // The filename is the decision; the surrounding path is the
            // deployment's own (uploads dir vs the seam's assets/covers).
            const basename = (value: string | null) => value?.split("/").pop() ?? null;
            expect(basename(chosen)).toBe(basename(recorded));
        });
    }
});

describe("classifyAssetType", () => {
    it.each([
        ["covers/cover.png", "cover"],
        ["cover/cover.png", "cover"],
        ["back-cover/back.png", "cover"],
        ["figures/bild.png", "figure"],
        ["images/bild.png", "figure"],
        ["diagrams/plan.png", "diagram"],
        ["tables/t.png", "table"],
        ["author/portrait.png", "author-asset"],
        ["authors/portrait.png", "author-asset"],
        ["about-author/portrait.png", "author-asset"],
        ["logo/logo.png", "figure"],
        ["infographics/i.png", "figure"],
        ["unbekannt/x.png", "figure"],
        ["lose.png", "figure"],
        // The subfolder override: the first folder says figure, the second
        // says diagram, and the deeper one wins.
        ["figures/diagrams/plan.png", "diagram"],
        // ...but only when it names a known type.
        ["figures/kapitel-01/bild.png", "figure"],
    ])("reads %j as %j", (path, expected) => {
        expect(classifyAssetType(path)).toBe(expected);
    });
});

describe("chooseCoverImage rules", () => {
    const planned = [
        { path: "assets/covers/echt.png", filename: "echt.png", asset_type: "cover" },
        { path: "assets/figures/bild.png", filename: "bild.png", asset_type: "figure" },
    ];

    it("keeps a metadata cover that names an imported file", () => {
        expect(chooseCoverImage("assets/covers/echt.png", planned)).toBe("assets/covers/echt.png");
    });

    it("replaces a metadata cover that names a file the project did not ship", () => {
        expect(chooseCoverImage("assets/covers/nicht-da.png", planned)).toBe(
            "assets/covers/echt.png",
        );
    });

    it("falls back to a filename containing cover when nothing is cover-typed", () => {
        const onlyFigures = [
            { path: "assets/figures/mein-cover.png", filename: "mein-cover.png", asset_type: "figure" },
            { path: "assets/figures/bild.png", filename: "bild.png", asset_type: "figure" },
        ];
        expect(chooseCoverImage(null, onlyFigures)).toBe("assets/covers/mein-cover.png");
    });

    it("leaves a stale metadata cover alone when there is no asset at all", () => {
        // Matching the backend, which also leaves it: a project that declares
        // a cover it did not ship keeps saying so rather than silently
        // losing what the author wrote.
        expect(chooseCoverImage("assets/figures/nicht-da.png", [])).toBe(
            "assets/figures/nicht-da.png",
        );
    });

    it("has no cover when the project declares none and ships none", () => {
        expect(chooseCoverImage(null, [])).toBeNull();
    });
});
