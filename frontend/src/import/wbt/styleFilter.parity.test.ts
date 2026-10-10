import { describe, it, expect } from "vitest";

import record from "./wbtImport.parity.json";
import { filterImportStyles, ALLOWED_STYLE_PROPERTIES } from "./styleFilter";

/**
 * The style-allowlist half of the write-book-template parity record (#736).
 *
 * Recorded in its own section, NOT as part of an imported chapter, because an
 * end-to-end case cannot observe this filter: plugin-ms-tools'
 * `content_pre_import` hook strips every style attribute before the core
 * allowlist runs, so a styled fixture imported through the endpoint arrives
 * with no style attribute at all and the record would agree with a port that
 * had no filter (#988). The browser has no ms-tools, so the core filter is
 * what this mirrors, and the recorder calls it directly.
 */
describe("filterImportStyles vs the recorded backend output", () => {
    const cases = record.style_filter;

    it("records cases at all", () => {
        expect(cases.length).toBeGreaterThan(0);
    });

    for (const entry of cases) {
        it(entry.name, () => {
            expect(filterImportStyles(entry.html)).toBe(entry.filtered);
        });
    }
});

describe("filterImportStyles allowlist", () => {
    it("mirrors the backend's five properties", () => {
        // Drift here is the failure the record cannot see: a property added
        // on one side only still passes every recorded case.
        expect([...ALLOWED_STYLE_PROPERTIES].sort()).toEqual([
            "background-color",
            "color",
            "min-width",
            "text-align",
            "width",
        ]);
    });

    it("leaves markup without the word style untouched by reference", () => {
        // The early return is a cheap path, not a semantic one; pin that it
        // returns the input rather than a re-serialised equivalent.
        const html = "<p>Plain</p>";
        expect(filterImportStyles(html)).toBe(html);
    });
});
