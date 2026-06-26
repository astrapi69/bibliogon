/** Tests for the native-DOM SEO meta helper (#605). */
import { describe, it, expect, beforeEach } from "vitest";

import {
    setDocumentMeta,
    setDocumentTitle,
    resetDocumentMeta,
    DEFAULT_META,
} from "./documentMeta";

function metaContent(attr: "name" | "property", key: string): string | null {
    return (
        document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)?.getAttribute(
            "content",
        ) ?? null
    );
}

beforeEach(() => {
    document.head.querySelectorAll("meta").forEach((m) => m.remove());
    document.title = "";
});

describe("setDocumentMeta", () => {
    it("sets title (suffixed) + description + og/twitter from the given fields", () => {
        setDocumentMeta({ title: "Mein Buch", description: "Der Klappentext.", type: "book" });
        expect(document.title).toBe("Mein Buch – Bibliogon");
        expect(metaContent("name", "description")).toBe("Der Klappentext.");
        expect(metaContent("property", "og:title")).toBe("Mein Buch");
        expect(metaContent("property", "og:description")).toBe("Der Klappentext.");
        expect(metaContent("property", "og:type")).toBe("book");
        expect(metaContent("name", "twitter:title")).toBe("Mein Buch");
    });

    it("falls back to defaults for missing fields", () => {
        setDocumentMeta({ title: "Nur Titel" });
        expect(metaContent("name", "description")).toBe(DEFAULT_META.ogDescription);
        expect(metaContent("property", "og:image")).toBe(DEFAULT_META.ogImage);
    });

    it("upserts (no duplicate meta on a second call)", () => {
        setDocumentMeta({ title: "A", description: "1" });
        setDocumentMeta({ title: "B", description: "2" });
        expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
        expect(metaContent("property", "og:title")).toBe("B");
    });
});

describe("setDocumentTitle", () => {
    it("sets only the title + og:title, leaving description untouched", () => {
        setDocumentMeta({ title: "X", description: "keep-me" });
        setDocumentTitle("Einstellungen");
        expect(document.title).toBe("Einstellungen – Bibliogon");
        expect(metaContent("property", "og:title")).toBe("Einstellungen");
        expect(metaContent("name", "description")).toBe("keep-me");
    });
});

describe("resetDocumentMeta", () => {
    it("restores the static app defaults (navigation away)", () => {
        setDocumentMeta({ title: "Etwas", description: "weg" });
        resetDocumentMeta();
        expect(document.title).toBe(DEFAULT_META.title);
        expect(metaContent("name", "description")).toBe(DEFAULT_META.description);
        expect(metaContent("property", "og:title")).toBe(DEFAULT_META.ogTitle);
    });
});
