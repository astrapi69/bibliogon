import {describe, expect, it} from "vitest";
import {legalPageHref, legalPagePath} from "./legalPages";

describe("legalPagePath", () => {
    it("serves the German pages for de", () => {
        expect(legalPagePath("imprint", "de")).toBe("impressum.html");
        expect(legalPagePath("privacy", "de")).toBe("datenschutz.html");
    });

    it("serves the English pages for en and for every other language", () => {
        for (const lang of ["en", "fr", "es", "el", "pt", "tr", "ja", "", "xx"]) {
            expect(legalPagePath("imprint", lang), lang).toBe("imprint.html");
            expect(legalPagePath("privacy", lang), lang).toBe("privacy.html");
        }
    });

    it("treats regional German variants as German", () => {
        expect(legalPagePath("imprint", "de-AT")).toBe("impressum.html");
    });
});

describe("legalPageHref", () => {
    it("prefixes the deploy base so the link works under /bibliogon/ and under /", () => {
        expect(legalPageHref("imprint", "de", "/bibliogon/")).toBe("/bibliogon/impressum.html");
        expect(legalPageHref("privacy", "en", "/")).toBe("/privacy.html");
    });

    it("tolerates a base without a trailing slash", () => {
        expect(legalPageHref("imprint", "en", "/bibliogon")).toBe("/bibliogon/imprint.html");
    });

    it("defaults to Vite's BASE_URL", () => {
        expect(legalPageHref("imprint", "de")).toBe(`${import.meta.env.BASE_URL}impressum.html`);
    });
});
