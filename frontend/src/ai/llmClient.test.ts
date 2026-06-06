/**
 * Browser LLM client tests (#34 P4 AI-via-user-key C1).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  aiChat,
  AiClientError,
  getAiConfig,
  isAiConfigured,
  type AiConfig,
} from "./llmClient";

const getAppMock = vi.fn();
vi.mock("../storage", () => ({
  getStorage: () => ({ settings: { getApp: () => getAppMock() } }),
}));

const okJson = (body: unknown): Response =>
  ({ ok: true, json: async () => body }) as Response;

beforeEach(() => {
  getAppMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("getAiConfig", () => {
  it("reads provider/base_url/model/api_key from the settings seam", async () => {
    getAppMock.mockResolvedValue({
      ai: {
        provider: "openai",
        base_url: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        api_key: "sk-test",
      },
    });
    expect(await getAiConfig()).toEqual({
      provider: "openai",
      base_url: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      api_key: "sk-test",
    });
  });

  it("falls back to the provider's default base_url", async () => {
    getAppMock.mockResolvedValue({ ai: { provider: "anthropic", model: "claude" } });
    const cfg = await getAiConfig();
    expect(cfg.base_url).toBe("https://api.anthropic.com/v1");
  });
});

describe("isAiConfigured", () => {
  const base: AiConfig = {
    provider: "openai",
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o",
    api_key: "sk",
  };
  it("requires base_url + model always, key for non-local providers", () => {
    expect(isAiConfigured(base)).toBe(true);
    expect(isAiConfigured({ ...base, api_key: "" })).toBe(false);
    expect(isAiConfigured({ ...base, model: "" })).toBe(false);
    // lmstudio (local) needs no key.
    expect(
      isAiConfigured({ provider: "lmstudio", base_url: "http://localhost:1234/v1", model: "m", api_key: "" }),
    ).toBe(true);
  });
});

describe("aiChat — OpenAI-compatible", () => {
  it("POSTs /chat/completions with a Bearer key + returns the message content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({ model: "gpt-4o", choices: [{ message: { content: "Hello!" } }], usage: { total_tokens: 12 } }),
    );
    global.fetch = fetchMock;
    const result = await aiChat(
      { provider: "openai", base_url: "https://api.openai.com/v1", model: "gpt-4o", api_key: "sk-x" },
      [{ role: "user", content: "hi" }],
    );
    expect(result.content).toBe("Hello!");
    expect(result.usage.total_tokens).toBe(12);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-x");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("aiChat — Anthropic", () => {
  it("POSTs /messages with x-api-key + browser-access header, splits out system", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({ model: "claude-3", content: [{ type: "text", text: "Hi there" }], usage: { input_tokens: 5, output_tokens: 7 } }),
    );
    global.fetch = fetchMock;
    const result = await aiChat(
      { provider: "anthropic", base_url: "https://api.anthropic.com/v1", model: "claude-3", api_key: "key" },
      [
        { role: "system", content: "Be brief." },
        { role: "user", content: "hi" },
      ],
    );
    expect(result.content).toBe("Hi there");
    expect(result.usage.total_tokens).toBe(12);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("key");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("Be brief.");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("aiChat — errors", () => {
  it("throws AiClientError on a non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    } as Response);
    await expect(
      aiChat(
        { provider: "openai", base_url: "https://api.openai.com/v1", model: "m", api_key: "bad" },
        [{ role: "user", content: "x" }],
      ),
    ).rejects.toBeInstanceOf(AiClientError);
  });

  it("throws AiClientError on a network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      aiChat(
        { provider: "openai", base_url: "https://api.openai.com/v1", model: "m", api_key: "k" },
        [{ role: "user", content: "x" }],
      ),
    ).rejects.toBeInstanceOf(AiClientError);
  });
});
