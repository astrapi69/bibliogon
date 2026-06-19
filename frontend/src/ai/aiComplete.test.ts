import { describe, it, expect, beforeEach, vi } from "vitest";

import { aiComplete, AiNotConfiguredError } from "./aiComplete";
import { aiChat, getAiConfig, isAiConfigured } from "./llmClient";
import { api } from "../api/client";

// The storage seam decides the dispatch path; flip `storage.mode` per test.
const storage = { mode: "dexie" as "dexie" | "api" };
vi.mock("../storage", () => ({ getStorage: () => storage }));

// Browser-direct client fully mocked: no real provider call.
vi.mock("./llmClient", () => ({
    aiChat: vi.fn(async () => ({
        content: "OFFLINE",
        model: "gemini-2.0-flash",
        usage: { total_tokens: 42 },
    })),
    getAiConfig: vi.fn(async () => ({
        provider: "google",
        base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        model: "gemini-2.0-flash",
        api_key: "user-key",
    })),
    isAiConfigured: vi.fn(() => true),
}));

// Backend AI route mocked: assert the flattened (prompt, system, bookId) shape.
vi.mock("../api/client", () => ({
    api: { ai: { generate: vi.fn(async () => ({ content: "ONLINE" })) } },
}));

const mockAiChat = vi.mocked(aiChat);
const mockIsConfigured = vi.mocked(isAiConfigured);
const mockGenerate = vi.mocked(api.ai.generate);

const MESSAGES = [
    { role: "system" as const, content: "Rewrite the passage." },
    { role: "user" as const, content: "Hello world." },
];

describe("aiComplete", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        storage.mode = "dexie";
        mockIsConfigured.mockReturnValue(true);
    });

    it("offline (dexie): calls the browser-direct provider with the user's key (Gemini)", async () => {
        const result = await aiComplete(MESSAGES, { bookId: "b1", maxTokens: 256 });
        expect(getAiConfig).toHaveBeenCalledOnce();
        expect(mockAiChat).toHaveBeenCalledOnce();
        const [config, messages, opts] = mockAiChat.mock.calls[0];
        expect(config.provider).toBe("google");
        expect(messages).toEqual(MESSAGES);
        expect(opts).toMatchObject({ maxTokens: 256 });
        expect(result).toEqual({ content: "OFFLINE", tokens: 42 });
        // No backend egress offline.
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("offline (dexie): throws AiNotConfiguredError when no usable config exists", async () => {
        mockIsConfigured.mockReturnValue(false);
        await expect(aiComplete(MESSAGES)).rejects.toBeInstanceOf(AiNotConfiguredError);
        expect(mockAiChat).not.toHaveBeenCalled();
    });

    it("online (api): flattens system + user into the backend generate call", async () => {
        storage.mode = "api";
        const result = await aiComplete(MESSAGES, { bookId: "b9" });
        expect(mockGenerate).toHaveBeenCalledWith("Hello world.", "Rewrite the passage.", "b9");
        expect(result).toEqual({ content: "ONLINE", tokens: 0 });
        // The browser-direct path is never used online.
        expect(mockAiChat).not.toHaveBeenCalled();
    });

    it("online (api): does not require an AI config (key lives server-side)", async () => {
        storage.mode = "api";
        mockIsConfigured.mockReturnValue(false);
        await expect(aiComplete(MESSAGES)).resolves.toEqual({ content: "ONLINE", tokens: 0 });
        expect(getAiConfig).not.toHaveBeenCalled();
    });
});
