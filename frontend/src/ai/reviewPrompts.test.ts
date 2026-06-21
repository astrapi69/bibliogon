import { describe, it, expect } from "vitest";

import { buildReviewMessages } from "./reviewPrompts";

describe("buildReviewMessages", () => {
    it("builds a system + user pair with the focus instruction and language", () => {
        const [system, user] = buildReviewMessages({
            focus: "style",
            chapterText: "The chapter body.",
            chapterTitle: "Chapter One",
            bookTitle: "My Book",
            genre: "Fantasy",
            language: "de",
        });
        expect(system.role).toBe("system");
        expect(system.content).toContain("German");
        expect(system.content.toLowerCase()).toContain("style");
        expect(user.role).toBe("user");
        expect(user.content).toContain("My Book");
        expect(user.content).toContain("Fantasy");
        expect(user.content).toContain("Chapter One");
        expect(user.content).toContain("The chapter body.");
    });

    it("varies the instruction per focus", () => {
        const style = buildReviewMessages({ focus: "style", chapterText: "x", language: "en" })[0]
            .content;
        const consistency = buildReviewMessages({
            focus: "consistency",
            chapterText: "x",
            language: "en",
        })[0].content;
        const beta = buildReviewMessages({
            focus: "beta_reader",
            chapterText: "x",
            language: "en",
        })[0].content;
        expect(style).not.toBe(consistency);
        expect(consistency).not.toBe(beta);
        expect(beta.toLowerCase()).toContain("beta reader");
    });

    it("omits optional context lines when not provided", () => {
        const [, user] = buildReviewMessages({
            focus: "style",
            chapterText: "Body only.",
            language: "en",
        });
        expect(user.content).not.toContain("Book:");
        expect(user.content).not.toContain("Genre:");
        expect(user.content).toContain("Body only.");
    });
});
