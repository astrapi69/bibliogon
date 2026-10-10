import { afterEach, describe, expect, it, vi } from "vitest";

const aiCompleteMock = vi.hoisted(() => vi.fn());
const storageMock = vi.hoisted(() => ({
    articles: { create: vi.fn(), update: vi.fn() },
}));

vi.mock("../../ai/aiComplete", () => ({ aiComplete: aiCompleteMock }));
vi.mock("../../storage", () => ({ getStorage: () => storageMock }));

import { translateArticleWithAi } from "./translateArticleWithAi";
import type { Article } from "../../api/client";

const doc = (...texts: string[]) =>
    JSON.stringify({
        type: "doc",
        content: texts.map((text) => ({
            type: "paragraph",
            content: [{ type: "text", text }],
        })),
    });

const ARTICLE = {
    id: "a1",
    title: "Mein Artikel",
    subtitle: "Untertitel",
    author: "Asterios Raptis",
    language: "de",
    content_type: "blogpost",
    content_json: doc("Erster Satz.", "Zweiter Satz."),
    excerpt: null,
    seo_title: null,
    seo_description: null,
    tags: ["technik"],
    topic: "Technik",
    canonical_url: null,
    featured_image_url: null,
} as unknown as Article;

/** Reply with the input prefixed, so each call is identifiable. */
function echoTranslator(prefix = "EN: ") {
    return vi.fn(async (messages: { role: string; content: string }[]) => ({
        content: messages
            .filter((m) => m.role === "user")
            .map((m) =>
                m.content
                    .split("\n")
                    .map((line) => (line ? `${prefix}${line}` : line))
                    .join("\n"),
            )
            .join("\n"),
        tokens: 1,
    }));
}

afterEach(() => {
    vi.clearAllMocks();
});

describe("translateArticleWithAi", () => {
    it("translates each piece and writes one draft article", async () => {
        aiCompleteMock.mockImplementation(echoTranslator());
        storageMock.articles.create.mockResolvedValue({ id: "new-1" });
        storageMock.articles.update.mockResolvedValue({});

        const result = await translateArticleWithAi(ARTICLE, { targetLang: "en" });

        expect(result).toEqual({ articleId: "new-1", untranslatedPieces: 0 });
        // title + subtitle + body: the three non-empty pieces of this
        // fixture. Empty fields are not sent, so they cost nothing.
        expect(aiCompleteMock).toHaveBeenCalledTimes(3);
        expect(storageMock.articles.create).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "EN: Mein Artikel (EN)",
                language: "en",
                content_type: "blogpost",
            }),
        );
    });

    it("patches everything the create schema cannot carry", async () => {
        // The create schema takes five fields; the backend route sets a
        // dozen. Without the patch the two paths produce different rows -
        // the offline one with no body at all.
        aiCompleteMock.mockImplementation(echoTranslator());
        storageMock.articles.create.mockResolvedValue({ id: "new-1" });
        storageMock.articles.update.mockResolvedValue({});

        await translateArticleWithAi(ARTICLE, { targetLang: "en" });

        const [id, patch] = storageMock.articles.update.mock.calls[0];
        expect(id).toBe("new-1");
        expect(patch.status).toBe("draft");
        expect(patch.tags).toEqual(["technik"]);
        expect(patch.topic).toBe("Technik");
        const body = JSON.parse(patch.content_json);
        expect(body.content[0].content[0].text).toBe("EN: Erster Satz.");
        expect(body.content[1].content[0].text).toBe("EN: Zweiter Satz.");
    });

    it("sends the body as prose, never as TipTap JSON", async () => {
        // A provider handed raw JSON translates its keys.
        aiCompleteMock.mockImplementation(echoTranslator());
        storageMock.articles.create.mockResolvedValue({ id: "new-1" });
        storageMock.articles.update.mockResolvedValue({});

        await translateArticleWithAi(ARTICLE, { targetLang: "en" });

        for (const [messages] of aiCompleteMock.mock.calls) {
            for (const message of messages) {
                expect(message.content).not.toContain('"type": "doc"');
                expect(message.content).not.toContain('{"type"');
            }
        }
    });

    it("reports progress for every piece", async () => {
        aiCompleteMock.mockImplementation(echoTranslator());
        storageMock.articles.create.mockResolvedValue({ id: "new-1" });
        storageMock.articles.update.mockResolvedValue({});
        const seen: string[] = [];

        await translateArticleWithAi(ARTICLE, {
            targetLang: "en",
            onProgress: (p) => seen.push(`${p.done}/${p.total} ${p.key}`),
        });

        expect(seen).toEqual(["1/3 title", "2/3 subtitle", "3/3 body"]);
    });

    it("keeps the source value when one piece fails, and says how many", async () => {
        // A per-field failure should cost that field's translation, not
        // the article. An article with one German subtitle beats no
        // article at all.
        aiCompleteMock
            .mockImplementationOnce(echoTranslator())
            .mockRejectedValueOnce(new Error("provider hiccup"))
            .mockImplementationOnce(echoTranslator());
        storageMock.articles.create.mockResolvedValue({ id: "new-1" });
        storageMock.articles.update.mockResolvedValue({});

        const result = await translateArticleWithAi(ARTICLE, { targetLang: "en" });

        expect(result.untranslatedPieces).toBe(1);
        expect(storageMock.articles.create).toHaveBeenCalledWith(
            expect.objectContaining({ subtitle: "Untertitel" }),
        );
    });

    it("throws when the very first call fails", async () => {
        // No key, or the provider is down: continuing would make five
        // more doomed requests before showing the same error, and there
        // would be nothing worth creating at the end of them.
        aiCompleteMock.mockRejectedValue(new Error("AI is not configured"));
        storageMock.articles.create.mockResolvedValue({ id: "new-1" });

        await expect(
            translateArticleWithAi(ARTICLE, { targetLang: "en" }),
        ).rejects.toThrow("AI is not configured");
        expect(storageMock.articles.create).not.toHaveBeenCalled();
    });

    it("strips a fenced reply before it reaches the document", async () => {
        aiCompleteMock.mockResolvedValue({
            content: "```\nFenced title\n```",
            tokens: 1,
        });
        storageMock.articles.create.mockResolvedValue({ id: "new-1" });
        storageMock.articles.update.mockResolvedValue({});

        await translateArticleWithAi(ARTICLE, { targetLang: "en" });

        expect(storageMock.articles.create).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Fenced title (EN)" }),
        );
    });

    it("names the source language in the prompt", async () => {
        aiCompleteMock.mockImplementation(echoTranslator());
        storageMock.articles.create.mockResolvedValue({ id: "new-1" });
        storageMock.articles.update.mockResolvedValue({});

        await translateArticleWithAi(ARTICLE, { targetLang: "en" });

        const [messages] = aiCompleteMock.mock.calls[0];
        expect(messages[0].content).toContain("from German");
        expect(messages[0].content).toContain("into English");
    });
});
