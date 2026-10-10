import { describe, expect, it } from "vitest";

import {
    cleanTranslationReply,
    languageName,
    translationPrompt,
} from "./translationPrompts";

describe("languageName", () => {
    it("names the eight languages the app ships", () => {
        expect(languageName("de")).toBe("German");
        expect(languageName("ja")).toBe("Japanese");
    });

    it("ignores a regional suffix", () => {
        expect(languageName("pt-BR")).toBe("Portuguese");
        expect(languageName("EN")).toBe("English");
    });

    it("falls back to the code rather than to nothing", () => {
        // An unnamed language still has to reach the model as something,
        // and "nl" translates better than an empty slot in the sentence.
        expect(languageName("nl")).toBe("nl");
        expect(languageName(null)).toBe("");
    });
});

describe("translationPrompt", () => {
    it("names the target language in words", () => {
        const { system, user } = translationPrompt("Ein Satz.", { targetLang: "en" });
        expect(system).toContain("into English");
        expect(user).toBe("Ein Satz.");
    });

    it("mentions the source language only when it is known", () => {
        expect(translationPrompt("x", { targetLang: "en", sourceLang: "de" }).system).toContain(
            "from German",
        );
        expect(translationPrompt("x", { targetLang: "en" }).system).not.toContain("from ");
    });

    it("constrains the line structure", () => {
        // Load-bearing: the rebuild maps lines onto text nodes by
        // position, so a model that merges two paragraphs destroys the
        // mapping and the body falls back to one flat paragraph.
        const { system } = translationPrompt("x", { targetLang: "en" });
        expect(system).toMatch(/same\s+number of lines/);
    });

    it("forbids commentary and fences", () => {
        // Without this the model's "Here is the translation:" lands in
        // the user's article.
        const { system } = translationPrompt("x", { targetLang: "en" });
        expect(system).toContain("No commentary");
        expect(system).toContain("markdown fences");
    });

    it("protects names, code and URLs", () => {
        const { system } = translationPrompt("x", { targetLang: "en" });
        expect(system).toMatch(/proper names, code, identifiers and URLs/);
    });
});

describe("cleanTranslationReply", () => {
    it("returns a plain reply untouched apart from trailing space", () => {
        expect(cleanTranslationReply("One sentence.\n")).toBe("One sentence.");
    });

    it("unwraps a fenced reply", () => {
        expect(cleanTranslationReply("```\nOne.\nTwo.\n```")).toBe("One.\nTwo.");
        expect(cleanTranslationReply("```text\nOne.\n```")).toBe("One.");
    });

    it("keeps interior blank lines, which carry the structure", () => {
        // The blank line between paragraphs is what the extractor emitted
        // and what the rebuild steps over; eating it would shift every
        // segment after it.
        expect(cleanTranslationReply("One.\n\nTwo.\n")).toBe("One.\n\nTwo.");
    });

    it("leaves a reply that merely contains backticks alone", () => {
        // A fence is an opening line and a closing line. Something that
        // only mentions `code` inline is prose, and stripping it would
        // eat real content.
        expect(cleanTranslationReply("Use the `id` field.")).toBe("Use the `id` field.");
    });

    it("leaves leading whitespace-only indentation of the first line out of it", () => {
        expect(cleanTranslationReply("   One.   ")).toBe("One.");
    });
});
