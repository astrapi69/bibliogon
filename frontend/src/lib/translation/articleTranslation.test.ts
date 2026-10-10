import { describe, expect, it } from "vitest";

import {
    TRANSLATED_FIELDS,
    buildTranslatedArticle,
    languageCodeFor,
    titleSuffixFor,
    translatableFields,
    translatedBody,
    type TranslationSource,
} from "./articleTranslation";

const doc = (...texts: string[]) =>
    JSON.stringify({
        type: "doc",
        content: texts.map((text) => ({
            type: "paragraph",
            content: [{ type: "text", text }],
        })),
    });

const SOURCE: TranslationSource = {
    title: "Mein Artikel",
    subtitle: "Ein Untertitel",
    author: "Asterios Raptis",
    content_type: "blogpost",
    content_json: doc("Erster Satz.", "Zweiter Satz."),
    canonical_url: "https://example.com/a",
    featured_image_url: "https://example.com/a.png",
    excerpt: "Kurzfassung",
    tags: ["eins", "zwei"],
    topic: "Technik",
    seo_title: "SEO-Titel",
    seo_description: "SEO-Beschreibung",
};

describe("translatableFields", () => {
    it("sends every non-empty field plus the body prose", () => {
        const items = translatableFields(SOURCE);
        expect(items.map((i) => i.key)).toEqual([...TRANSLATED_FIELDS, "body"]);
        // The body is prose, never the JSON - a provider handed raw
        // TipTap would translate its keys.
        expect(items.at(-1)!.text).not.toContain('"type"');
        expect(items.at(-1)!.text).toContain("Erster Satz.");
    });

    it("skips empty and whitespace-only fields", () => {
        // Each skipped field is a request that would cost money or rate
        // limit and return the same nothing.
        const items = translatableFields({
            title: "Nur ein Titel",
            subtitle: "",
            excerpt: "   ",
            seo_title: null,
            content_json: null,
        });
        expect(items.map((i) => i.key)).toEqual(["title"]);
    });

    it("skips the body when the document holds no prose", () => {
        const imageOnly = JSON.stringify({
            type: "doc",
            content: [{ type: "imageFigure", attrs: { src: "a.png" } }],
        });
        expect(
            translatableFields({ title: "T", content_json: imageOnly }).map((i) => i.key),
        ).toEqual(["title"]);
    });
});

describe("titleSuffixFor and languageCodeFor", () => {
    it("derives the suffix from the target language", () => {
        expect(titleSuffixFor({ targetLang: "en" })).toBe("(EN)");
        expect(titleSuffixFor({ targetLang: "pt-BR" })).toBe("(PT-BR)");
    });

    it("prefers the caller's suffix when it has one", () => {
        expect(titleSuffixFor({ targetLang: "en", titleSuffix: "[EN]" })).toBe("[EN]");
        expect(titleSuffixFor({ targetLang: "en", titleSuffix: "   " })).toBe("(EN)");
    });

    it("keeps only the language part of a regional code", () => {
        // The article's language column is a bare code; storing en-GB
        // there would break every language filter in the app.
        expect(languageCodeFor("en-GB")).toBe("en");
        expect(languageCodeFor("PT")).toBe("pt");
    });
});

describe("translatedBody", () => {
    it("rebuilds the document when the line counts line up", () => {
        const out = JSON.parse(
            translatedBody(SOURCE.content_json, "Erster Satz.\n\nZweiter Satz.", "One.\n\nTwo."),
        );
        expect(out.content[0].content[0].text).toBe("One.");
        expect(out.content[1].content[0].text).toBe("Two.");
    });

    it("falls back to one paragraph when the rebuild loses the translation", () => {
        // The rebuild maps segments onto text nodes positionally, so a
        // translation that collapsed two paragraphs into one sentence
        // leaves the second node untouched and can come back unchanged.
        // Showing the user their own untranslated text and calling it a
        // translation is the outcome this prevents.
        const original = doc("Eins.", "Zwei.");
        const out = JSON.parse(translatedBody(original, "Eins.\n\nZwei.", ""));
        expect(JSON.stringify(out)).toBe(JSON.stringify(JSON.parse(original)));

        const lost = JSON.parse(
            translatedBody(original, "Eins.\n\nZwei.", "Eins.\n\nZwei."),
        );
        // Identical translation is not a loss - it is a no-op the user
        // asked for, so no fallback.
        expect(lost.content).toHaveLength(2);
    });

    it("uses the fallback when a differing translation changed nothing", () => {
        // A document whose only text node is already the translation's
        // first segment: the rebuild writes the same value back, so the
        // result equals the source while the translation differs.
        const original = doc("One.");
        const out = JSON.parse(translatedBody(original, "One.", "One.\nTwo."));
        expect(out.content).toHaveLength(1);
        expect(out.content[0].content[0].text).toBe("One.\nTwo.");
    });

    it("leaves a body-less article's content alone", () => {
        expect(translatedBody(null, "", "irrelevant")).toBe("");
        expect(translatedBody("", "", "irrelevant")).toBe("");
    });

    it("compares documents parsed, not as strings", () => {
        // The original came from the editor and the rebuild from
        // JSON.stringify; they differ in whitespace without differing in
        // content. A string compare would call this rebuild "changed" and
        // the fallback would never fire - so the second sentence of the
        // translation would be dropped silently.
        //
        // The setup has to make the comparison DECIDE: one text node, a
        // translation whose first segment equals it, and a spaced
        // original. Then content is unchanged, bytes are not, and the two
        // comparisons disagree about what to do.
        const spaced =
            '{ "type": "doc", "content": [ { "type": "paragraph", "content": [ { "type": "text", "text": "One." } ] } ] }';
        const out = JSON.parse(translatedBody(spaced, "One.", "One.\nTwo."));
        expect(out.content).toHaveLength(1);
        expect(out.content[0].content[0].text).toBe("One.\nTwo.");
    });
});

describe("buildTranslatedArticle", () => {
    const translations = {
        title: "My Article",
        subtitle: "A subtitle",
        excerpt: "Summary",
        seo_title: "SEO title",
        seo_description: "SEO description",
        body: "First sentence.\n\nSecond sentence.",
    };

    it("suffixes the title and keeps the translated fields", () => {
        const draft = buildTranslatedArticle(SOURCE, translations, { targetLang: "en" });
        expect(draft.title).toBe("My Article (EN)");
        expect(draft.subtitle).toBe("A subtitle");
        expect(draft.excerpt).toBe("Summary");
        expect(draft.seo_title).toBe("SEO title");
        expect(draft.seo_description).toBe("SEO description");
        expect(draft.language).toBe("en");
        expect(draft.status).toBe("draft");
    });

    it("copies the fields the backend does not translate", () => {
        // Tags, topic and the canonical URL are identity, not prose -
        // translating a canonical URL would break the publication link.
        const draft = buildTranslatedArticle(SOURCE, translations, { targetLang: "en" });
        expect(draft.author).toBe(SOURCE.author);
        expect(draft.tags).toEqual(["eins", "zwei"]);
        expect(draft.topic).toBe("Technik");
        expect(draft.canonical_url).toBe("https://example.com/a");
        expect(draft.featured_image_url).toBe("https://example.com/a.png");
        expect(draft.content_type).toBe("blogpost");
    });

    it("keeps the source value for a field that came back untranslated", () => {
        // A partial failure should cost the translation of that field,
        // not the field - an article with a blanked excerpt is worse than
        // one with a German excerpt.
        const draft = buildTranslatedArticle(SOURCE, { title: "My Article" }, {
            targetLang: "en",
        });
        expect(draft.subtitle).toBe("Ein Untertitel");
        expect(draft.excerpt).toBe("Kurzfassung");
    });

    it("falls back to the source title when even the title failed", () => {
        const draft = buildTranslatedArticle(SOURCE, {}, { targetLang: "en" });
        expect(draft.title).toBe("Mein Artikel (EN)");
    });

    it("translates the body through the rebuild", () => {
        const draft = buildTranslatedArticle(SOURCE, translations, { targetLang: "en" });
        const out = JSON.parse(draft.content_json);
        expect(out.content[0].content[0].text).toBe("First sentence.");
        expect(out.content[1].content[0].text).toBe("Second sentence.");
    });

    it("leaves a body-less article's content untouched", () => {
        const draft = buildTranslatedArticle(
            { title: "T", content_json: null },
            { title: "T2" },
            { targetLang: "en" },
        );
        expect(draft.content_json).toBe("");
    });
});
