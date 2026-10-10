/**
 * The download name, against the recorded `Content-Disposition` (#745).
 *
 * The record is the backend's own header for the same title, so this
 * pins the one property that matters: a template exported in the
 * browser lands as the same file as one exported on the desktop.
 */

import { describe, it, expect } from "vitest";

import record from "./aiTemplate.parity.json";
import { asciiFilenameSlug, templateFilename } from "./filename";

interface Case {
    key: string;
    kind: "article" | "book";
    title: string;
    content_disposition: string;
}

const CASES = record.cases as unknown as Case[];

/** The filename out of a recorded `Content-Disposition` value. */
function recordedFilename(disposition: string): string {
    const match = /filename="([^"]+)"/.exec(disposition);
    if (!match) throw new Error(`no filename in ${disposition}`);
    return match[1];
}

describe("templateFilename matches the header the endpoint sent", () => {
    it.each(CASES.map((c) => [c.key, c] as const))("%s", (_key, testCase) => {
        expect(templateFilename(testCase.title, testCase.kind)).toBe(
            recordedFilename(testCase.content_disposition),
        );
    });
});

describe("asciiFilenameSlug reproduces the backend's folding", () => {
    it("keeps the letter under a combining mark", () => {
        expect(asciiFilenameSlug("Über Dächer")).toBe("uber-dacher");
    });

    it("drops an eszett entirely, as the backend does", () => {
        // `ß` has no NFKD decomposition, so `encode("ascii", "ignore")`
        // removes it rather than writing `ss`. Reproduced on purpose:
        // the filename has to match the desktop's, not improve on it.
        expect(asciiFilenameSlug("Straßen")).toBe("straen");
    });

    it("collapses whitespace, underscores and hyphens to one hyphen", () => {
        expect(asciiFilenameSlug("a   b__c--d")).toBe("a-b-c-d");
    });

    it("strips punctuation and trims the edges", () => {
        expect(asciiFilenameSlug("  Hallo, Welt!  ")).toBe("hallo-welt");
        expect(asciiFilenameSlug("Why Cats Climb?")).toBe("why-cats-climb");
    });

    it("falls back when nothing survives", () => {
        expect(asciiFilenameSlug("***", "book")).toBe("book");
        expect(asciiFilenameSlug("", "article")).toBe("article");
        // A title that is entirely non-ASCII leaves nothing behind.
        expect(asciiFilenameSlug("日本語", "book")).toBe("book");
    });

    it("names the kind in the fallback, like the endpoints do", () => {
        expect(templateFilename("***", "book")).toBe("book.biblio.yaml");
        expect(templateFilename("***", "article")).toBe("article.biblio.yaml");
    });
});
