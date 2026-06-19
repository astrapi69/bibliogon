import { describe, it, expect } from "vitest";

import { buildMetaMessages, parseMetaResponse } from "./metaPrompts";

describe("buildMetaMessages", () => {
    it("substitutes the language name and includes title + body", () => {
        const [system, user] = buildMetaMessages("seo_title", {
            title: "My Article",
            language: "de",
            bodyText: "Some body text.",
            topic: "Tech",
        });
        expect(system.role).toBe("system");
        expect(system.content).toContain("German");
        expect(system.content).not.toContain("{language}");
        expect(user.content).toContain("My Article");
        expect(user.content).toContain("Tech");
        expect(user.content).toContain("Some body text.");
    });

    it("asks for a JSON array for the tags field", () => {
        const [system] = buildMetaMessages("tags", {
            title: "T",
            language: "en",
            bodyText: "x",
        });
        expect(system.content).toContain("JSON array");
    });

    it("truncates an oversized body to the char budget", () => {
        const huge = "a".repeat(20000);
        const [, user] = buildMetaMessages("seo_description", {
            title: "T",
            language: "en",
            bodyText: huge,
        });
        // Body is capped well under the raw 20k input.
        expect(user.content.length).toBeLessThan(7000);
    });
});

describe("parseMetaResponse", () => {
    it("parses a JSON tag array", () => {
        const out = parseMetaResponse("tags", 'Sure! ["alpha", "beta", "gamma"]');
        expect(out.generated_tags).toEqual(["alpha", "beta", "gamma"]);
    });

    it("drops single-character and empty tags", () => {
        const out = parseMetaResponse("tags", '["ok", "x", " ", "fine"]');
        expect(out.generated_tags).toEqual(["ok", "fine"]);
    });

    it("returns an empty tag list on a non-array / malformed reply", () => {
        expect(parseMetaResponse("tags", "no array here").generated_tags).toEqual([]);
        expect(parseMetaResponse("tags", "{not: json}").generated_tags).toEqual([]);
    });

    it("strips wrapping quotes from a text field", () => {
        expect(parseMetaResponse("seo_title", '"A Great Title"').generated_text).toBe(
            "A Great Title",
        );
        expect(parseMetaResponse("seo_description", "  Plain text.  ").generated_text).toBe(
            "Plain text.",
        );
    });
});
