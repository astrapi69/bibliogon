import { describe, it, expect } from "vitest";

import record from "./wbtImport.parity.json";
import { parseMetadataYaml, parseProjectMetadata } from "./metadata";
import { recordedTree, type RecordedFiles } from "./recordFixtures";

/**
 * The metadata half of the write-book-template parity record (#736).
 *
 * Every field here is compared against what the BACKEND produced for the same
 * project, recorded through `POST /api/import/detect` + `/api/import/execute`
 * - the boundary the desktop app's consumer actually calls, per the lesson
 * #1042 filed about recording one layer too low.
 *
 * `cover_image` is excluded on purpose: the asset importer can override it
 * when the metadata names no cover but `assets/covers/` holds one, so it is
 * not a metadata-derived field and belongs to the orchestrator's own test.
 * The always-empty columns (audiobook config, TTS, ms-tools thresholds,
 * BISAC, categories) are excluded because a write-book-template project does
 * not carry them - pinning them here would assert the Book model's defaults,
 * not this parser.
 */
const METADATA_FIELDS = [
    "title",
    "subtitle",
    "author",
    "language",
    "series",
    "series_index",
    "description",
    "edition",
    "publisher",
    "publisher_city",
    "publish_date",
    "isbn_ebook",
    "isbn_paperback",
    "isbn_hardcover",
    "asin_ebook",
    "asin_paperback",
    "asin_hardcover",
    "keywords",
    "html_description",
    "backpage_description",
    "backpage_author_bio",
    "custom_css",
] as const;

describe("parseProjectMetadata vs the recorded backend import", () => {
    it("has cases to compare", () => {
        expect(record.cases.length).toBeGreaterThan(0);
    });

    for (const entry of record.cases) {
        it(entry.name, () => {
            const tree = recordedTree(entry.files as RecordedFiles);
            // The backend falls back to the project directory's name, which
            // every recorded fixture wraps as "book"; the browser has no
            // directory, so the caller supplies the same stem.
            const parsed = parseProjectMetadata(parseMetadataYaml(tree), tree, "book");
            const expected = entry.book as Record<string, unknown>;
            for (const field of METADATA_FIELDS) {
                expect({ [field]: parsed[field] }).toEqual({ [field]: expected[field] });
            }
        });
    }
});

describe("parseProjectMetadata field coverage", () => {
    it("compares every field the parser produces except the asset-owned cover", () => {
        // Guards the exclusion list above: a field added to ProjectMetadata
        // without being added here would be ported unpinned.
        const tree = recordedTree(record.cases[0].files as RecordedFiles);
        const parsed = parseProjectMetadata(parseMetadataYaml(tree), tree, "book");
        expect(Object.keys(parsed).sort()).toEqual(
            [...METADATA_FIELDS, "cover_image"].sort(),
        );
    });
});
