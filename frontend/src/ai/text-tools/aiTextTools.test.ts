import { describe, it, expect, beforeEach, vi } from "vitest";

import { aiCorrectGrammar, aiTranslate } from "./aiTextTools";
import { aiChat, getAiConfig, isAiConfigured, AiClientError } from "../llmClient";

// Browser-direct client fully mocked: no real provider call. AiClientError is a
// real subclass so `instanceof` checks in callers keep working.
vi.mock("../llmClient", () => {
    class AiClientError extends Error {}
    return {
        AiClientError,
        aiChat: vi.fn(async () => ({
            content: "RESULT",
            model: "gemini-2.0-flash",
            usage: { total_tokens: 17 },
        })),
        getAiConfig: vi.fn(async () => ({
            provider: "google",
            base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
            model: "gemini-2.0-flash",
            api_key: "user-key",
        })),
        isAiConfigured: vi.fn(() => true),
    };
});

const mockAiChat = vi.mocked(aiChat);
const mockGetConfig = vi.mocked(getAiConfig);
const mockIsConfigured = vi.mocked(isAiConfigured);

beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockResolvedValue({
        provider: "google",
        base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        model: "gemini-2.0-flash",
        api_key: "user-key",
    });
    mockIsConfigured.mockReturnValue(true);
    mockAiChat.mockResolvedValue({
        content: "RESULT",
        model: "gemini-2.0-flash",
        usage: { total_tokens: 17 },
    });
});

describe("aiCorrectGrammar", () => {
    it("throws AiClientError when no usable AI config exists", async () => {
        mockIsConfigured.mockReturnValue(false);
        await expect(aiCorrectGrammar("i has went")).rejects.toBeInstanceOf(AiClientError);
        expect(mockAiChat).not.toHaveBeenCalled();
    });

    it("sends a proofread instruction with the text and returns the trimmed result", async () => {
        mockAiChat.mockResolvedValue({
            content: "  I have gone.  ",
            model: "m",
            usage: { total_tokens: 9 },
        });
        const result = await aiCorrectGrammar("i has went");
        expect(result.text).toBe("I have gone.");
        expect(result.tokens).toBe(9);
        const [, messages] = mockAiChat.mock.calls[0];
        expect(messages[0].role).toBe("system");
        expect(messages[0].content.toLowerCase()).toContain("proofread");
        expect(messages[1].content).toContain("i has went");
        // The grammar prompt must NOT translate: it keeps the original language.
        expect(messages[1].content.toLowerCase()).toContain("keep the original language");
    });

    it("strips a Markdown code fence the model may wrap the answer in", async () => {
        mockAiChat.mockResolvedValue({
            content: "```\nCorrected sentence.\n```",
            model: "m",
            usage: { total_tokens: 4 },
        });
        const result = await aiCorrectGrammar("corected sentance");
        expect(result.text).toBe("Corrected sentence.");
    });

    it("uses a low temperature so the model corrects rather than paraphrases", async () => {
        await aiCorrectGrammar("text");
        const [, , opts] = mockAiChat.mock.calls[0];
        expect(opts?.temperature).toBeLessThanOrEqual(0.3);
    });
});

describe("aiTranslate", () => {
    it("throws AiClientError when no usable AI config exists", async () => {
        mockIsConfigured.mockReturnValue(false);
        await expect(aiTranslate("Hallo", "English")).rejects.toBeInstanceOf(AiClientError);
        expect(mockAiChat).not.toHaveBeenCalled();
    });

    it("names the target language and auto-detects the source by default", async () => {
        mockAiChat.mockResolvedValue({
            content: "Good morning",
            model: "m",
            usage: { total_tokens: 6 },
        });
        const result = await aiTranslate("Guten Morgen", "English");
        expect(result.text).toBe("Good morning");
        const [, messages] = mockAiChat.mock.calls[0];
        expect(messages[1].content).toContain("into English");
        expect(messages[1].content).toContain("Guten Morgen");
        // No source language given -> no "from X" clause.
        expect(messages[1].content).not.toContain("from ");
    });

    it("includes the source language clause when provided", async () => {
        await aiTranslate("Guten Morgen", "English", "Deutsch");
        const [, messages] = mockAiChat.mock.calls[0];
        expect(messages[1].content).toContain("from Deutsch into English");
    });
});
