/**
 * Shape detection for free-text fields that may hold either HTML or
 * Markdown (#814).
 *
 * The heuristic deliberately mirrors the backend's own convention
 * (`content.strip().startswith("<")` in the export scaffolder), so both
 * sides of the stack classify the same value the same way. These cases
 * pin that equivalence plus the documented edge behaviour.
 */

import { describe, it, expect } from "vitest";

import { looksLikeHtml } from "./contentShape";

describe("looksLikeHtml", () => {
    it("treats a value starting with a tag as HTML", () => {
        expect(looksLikeHtml("<p>Ein Satz.</p>")).toBe(true);
        expect(looksLikeHtml("<b>fett</b>")).toBe(true);
    });

    it("ignores leading whitespace, like the backend's strip() does", () => {
        expect(looksLikeHtml("\n\n   <p>Ein Satz.</p>")).toBe(true);
        expect(looksLikeHtml("   Ein Satz.")).toBe(false);
    });

    it("treats Markdown as not-HTML even when it contains inline tags", () => {
        expect(looksLikeHtml("**fett**")).toBe(false);
        expect(looksLikeHtml("# Titel\n\nAbsatz")).toBe(false);
        // Mixed content: the leading text decides, and the inline tag
        // survives the Markdown conversion untouched.
        expect(looksLikeHtml("Ein Satz mit <b>fett</b> darin.")).toBe(false);
    });

    it("treats plain prose as not-HTML", () => {
        expect(looksLikeHtml("Nur ein Satz ohne Auszeichnung.")).toBe(false);
    });

    it("reports empty and whitespace-only values as not-HTML", () => {
        expect(looksLikeHtml("")).toBe(false);
        expect(looksLikeHtml("   \n\t ")).toBe(false);
    });

    it("accepts a comment or doctype as HTML, since both start with a tag", () => {
        expect(looksLikeHtml("<!-- Kommentar -->")).toBe(true);
    });
});
