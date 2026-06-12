import { describe, it, expect } from "vitest";
import {
    offlineShortcuts,
    offlineFaq,
    offlineAbout,
    offlineNavigation,
    offlinePage,
    offlineSearch,
    offlineGuide,
    offlineSampleBook,
} from "./offlineHelp";
import { ApiError } from "../api/client";

/**
 * Regression pins for the offline help/getstarted seed resolvers. These
 * assert against the REAL bundled seed (generated from the docs/help +
 * help.yaml + getstarted.yaml SSoT) so a regenerated seed that drops a
 * surface fails here. Before this module the help page / panel / onboarding
 * were empty offline.
 */
describe("offlineHelp resolvers", () => {
    it("returns localized keyboard shortcuts (non-empty)", () => {
        const de = offlineShortcuts("de");
        expect(de.length).toBeGreaterThan(0);
        expect(de[0]).toHaveProperty("keys");
        expect(de[0]).toHaveProperty("action");
    });

    it("falls back to English for an unknown shortcut language", () => {
        expect(offlineShortcuts("zz")).toEqual(offlineShortcuts("en"));
    });

    it("returns localized FAQ entries", () => {
        const faq = offlineFaq("de");
        expect(faq.length).toBeGreaterThan(0);
        expect(faq[0]).toHaveProperty("question");
        expect(faq[0]).toHaveProperty("answer");
    });

    it("returns the about block", () => {
        expect(offlineAbout().name).toBe("Bibliogon");
        expect(offlineAbout().license).toBe("MIT");
    });

    it("returns a navigation tree for de and en", () => {
        expect(offlineNavigation("de").length).toBeGreaterThan(0);
        expect(offlineNavigation("en").length).toBeGreaterThan(0);
    });

    it("falls back unknown locales to the default doc tree", () => {
        expect(offlineNavigation("fr")).toEqual(offlineNavigation("de"));
    });

    it("returns markdown content for an existing page", () => {
        const page = offlinePage("de", "getting-started");
        expect(page.slug).toBe("getting-started");
        expect(page.content.length).toBeGreaterThan(0);
    });

    it("throws a 404 ApiError for an unknown page", () => {
        expect(() => offlinePage("de", "does-not-exist")).toThrowError(
            ApiError,
        );
    });

    it("searches page content client-side", () => {
        const { results } = offlineSearch("en", "export");
        expect(results.length).toBeGreaterThan(0);
        expect(results[0]).toHaveProperty("snippet");
        expect(results[0].score).toBeGreaterThan(0);
    });

    it("returns no search results for a too-short query", () => {
        expect(offlineSearch("de", "a").results).toEqual([]);
    });

    it("returns the onboarding guide steps", () => {
        const guide = offlineGuide("de");
        expect(guide.length).toBeGreaterThan(0);
        expect(guide[0]).toHaveProperty("id");
        expect(guide[0]).toHaveProperty("title");
    });

    it("returns a prose sample book with chapters", () => {
        const book = offlineSampleBook("de", "prose");
        expect(book.book_type).toBe("prose");
        expect(book.chapters?.length).toBeGreaterThan(0);
    });

    it("returns a picture_book sample book with pages", () => {
        const book = offlineSampleBook("de", "picture_book");
        expect(book.book_type).toBe("picture_book");
        expect(book.pages?.length).toBeGreaterThan(0);
    });
});
