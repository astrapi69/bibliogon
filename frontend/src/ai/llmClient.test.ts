/**
 * Browser LLM client tests (#34 P4 AI-via-user-key C1).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
    aiChat,
    AiClientError,
    classifyAiClientError,
    getAiConfig,
    isAiConfigured,
    isBrowserUnsupportedTestResult,
    listModels,
    providerSupportsBrowserTest,
    type AiConfig,
} from "./llmClient";

const getAppMock = vi.fn();
vi.mock("../storage", () => ({
    getStorage: () => ({ settings: { getApp: () => getAppMock() } }),
}));

const okJson = (body: unknown): Response => ({ ok: true, json: async () => body }) as Response;

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
            isAiConfigured({
                provider: "lmstudio",
                base_url: "http://localhost:1234/v1",
                model: "m",
                api_key: "",
            }),
        ).toBe(true);
    });
});

describe("aiChat — OpenAI-compatible", () => {
    it("POSTs /chat/completions with a Bearer key + returns the message content", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            okJson({
                model: "gpt-4o",
                choices: [{ message: { content: "Hello!" } }],
                usage: { total_tokens: 12 },
            }),
        );
        global.fetch = fetchMock;
        const result = await aiChat(
            {
                provider: "openai",
                base_url: "https://api.openai.com/v1",
                model: "gpt-4o",
                api_key: "sk-x",
            },
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

describe("aiChat — Mistral (OpenAI-compatible, browser-direct, #467)", () => {
    it("POSTs /chat/completions browser-direct + returns the message content", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            okJson({
                model: "mistral-large-latest",
                choices: [{ message: { content: "Bonjour!" } }],
                usage: { total_tokens: 9 },
            }),
        );
        global.fetch = fetchMock;
        const result = await aiChat(
            {
                provider: "mistral",
                base_url: "https://api.mistral.ai/v1",
                model: "mistral-large-latest",
                api_key: "m-key",
            },
            [{ role: "user", content: "hi" }],
        );
        expect(result.content).toBe("Bonjour!");
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.mistral.ai/v1/chat/completions");
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer m-key");
    });
});

describe("aiChat — Anthropic", () => {
    it("POSTs /messages with x-api-key + browser-access header, splits out system", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            okJson({
                model: "claude-3",
                content: [{ type: "text", text: "Hi there" }],
                usage: { input_tokens: 5, output_tokens: 7 },
            }),
        );
        global.fetch = fetchMock;
        const result = await aiChat(
            {
                provider: "anthropic",
                base_url: "https://api.anthropic.com/v1",
                model: "claude-3",
                api_key: "key",
            },
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
                {
                    provider: "openai",
                    base_url: "https://api.openai.com/v1",
                    model: "m",
                    api_key: "bad",
                },
                [{ role: "user", content: "x" }],
            ),
        ).rejects.toBeInstanceOf(AiClientError);
    });

    it("throws AiClientError on a network failure", async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
        await expect(
            aiChat(
                {
                    provider: "openai",
                    base_url: "https://api.openai.com/v1",
                    model: "m",
                    api_key: "k",
                },
                [{ role: "user", content: "x" }],
            ),
        ).rejects.toBeInstanceOf(AiClientError);
    });

    it("carries the HTTP status + body detail on a non-ok response", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            text: async () => '{"error":{"message":"models/x is not found"}}',
        } as Response);
        const err = (await aiChat(
            { provider: "google", base_url: "https://x/v1", model: "x", api_key: "k" },
            [{ role: "user", content: "x" }],
        ).catch((e) => e)) as AiClientError;
        expect(err).toBeInstanceOf(AiClientError);
        expect(err.status).toBe(404);
        expect(err.isNetwork).toBe(false);
        expect(err.detail).toContain("not found");
    });

    it("marks a transport/CORS failure as a network error (no status)", async () => {
        global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
        const err = (await aiChat(
            { provider: "openai", base_url: "https://api.openai.com/v1", model: "m", api_key: "k" },
            [{ role: "user", content: "x" }],
        ).catch((e) => e)) as AiClientError;
        expect(err.isNetwork).toBe(true);
        expect(err.status).toBeUndefined();
    });
});

describe("classifyAiClientError", () => {
    it("returns 'cors' for a transport/CORS failure (no HTTP status)", () => {
        expect(
            classifyAiClientError(new AiClientError("Failed to fetch", { isNetwork: true })),
        ).toBe("cors");
    });

    it.each([
        [401, "", "auth_error"],
        [403, "", "auth_error"],
        [429, "", "rate_limited"],
        [404, "models/x is not found", "model_not_found"],
        [400, "max_tokens too small", "invalid_request"],
        [500, "", "server_error"],
        [503, "", "server_error"],
        [418, "", "unknown"],
    ] as const)("maps HTTP %i -> %s", (status, detail, kind) => {
        expect(classifyAiClientError(new AiClientError("x", { status, detail }))).toBe(kind);
    });

    it("promotes a Gemini-style 400 API-key error to auth_error (#355 parity)", () => {
        const err = new AiClientError("x", {
            status: 400,
            detail: '{"error":{"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}',
        });
        expect(classifyAiClientError(err)).toBe("auth_error");
    });

    it("returns 'unknown' for a non-AiClientError", () => {
        expect(classifyAiClientError(new Error("boom"))).toBe("unknown");
        expect(classifyAiClientError("nope")).toBe("unknown");
    });
});

describe("listModels", () => {
    it("GETs {base}/models and returns the id list (OpenAI-compatible)", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(okJson({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }));
        global.fetch = fetchMock;
        const ids = await listModels({
            provider: "openai",
            base_url: "https://api.openai.com/v1",
            model: "",
            api_key: "sk-x",
        });
        expect(ids).toEqual(["gpt-4o", "gpt-4o-mini"]);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.openai.com/v1/models");
        expect(init.method).toBe("GET");
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-x");
    });

    it("GETs Mistral /models browser-direct as the connection test (#467)", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(okJson({ data: [{ id: "mistral-large-latest" }] }));
        global.fetch = fetchMock;
        const ids = await listModels({
            provider: "mistral",
            base_url: "https://api.mistral.ai/v1",
            model: "",
            api_key: "m-key",
        });
        expect(ids).toEqual(["mistral-large-latest"]);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.mistral.ai/v1/models");
        expect(init.method).toBe("GET");
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer m-key");
    });

    it("uses the Anthropic auth + browser-access headers", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(okJson({ data: [{ id: "claude-sonnet-4-6" }] }));
        global.fetch = fetchMock;
        const ids = await listModels({
            provider: "anthropic",
            base_url: "https://api.anthropic.com/v1",
            model: "",
            api_key: "key",
        });
        expect(ids).toEqual(["claude-sonnet-4-6"]);
        const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
        expect(headers["x-api-key"]).toBe("key");
        expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    });

    it("filters out non-string / empty ids", async () => {
        global.fetch = vi
            .fn()
            .mockResolvedValue(
                okJson({ data: [{ id: "gpt-4o" }, { id: "" }, { id: 42 }, {}, null] }),
            );
        const ids = await listModels({
            provider: "openai",
            base_url: "https://x/v1",
            model: "",
            api_key: "k",
        });
        expect(ids).toEqual(["gpt-4o"]);
    });

    it("throws AiClientError on a non-ok response (so callers can fall back)", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: async () => "unauthorized",
        } as Response);
        await expect(
            listModels({ provider: "openai", base_url: "https://x/v1", model: "", api_key: "bad" }),
        ).rejects.toBeInstanceOf(AiClientError);
    });
});

describe("providerSupportsBrowserTest", () => {
    // #467: the CORS-blocked set is empty (mirrors adaptive-learner) — every
    // provider is browser-capable. OpenAI/Mistral are no longer gated; the
    // earlier #450 exclusion was a misread account-specific 403.
    it.each([
        ["google", true],
        ["anthropic", true],
        ["lmstudio", true],
        ["custom", true],
        ["openai", true],
        ["mistral", true],
        ["unknown-provider", true],
    ] as const)("%s -> %s", (provider, supported) => {
        expect(providerSupportsBrowserTest(provider)).toBe(supported);
    });

    it("treats OpenAI and Mistral as browser-capable (verified browser-direct)", () => {
        expect(providerSupportsBrowserTest("openai")).toBe(true);
        expect(providerSupportsBrowserTest("mistral")).toBe(true);
    });
});

describe("isBrowserUnsupportedTestResult (#456)", () => {
    it("treats ANY failure as browser-unsupported when the caller marks the provider unreliable", () => {
        // When browserTestUnreliable=true (a hypothetical future CORS-locked
        // provider; no shipped provider hits this now), a 403/401 must NOT read
        // as a bad key — it's a browser limitation.
        const forbidden = new AiClientError("x", { status: 403, detail: "forbidden" });
        expect(isBrowserUnsupportedTestResult(forbidden, true)).toBe(true);
        const authErr = new AiClientError("x", { status: 401, detail: "bad key" });
        expect(isBrowserUnsupportedTestResult(authErr, true)).toBe(true);
    });

    it("keeps specific errors for browser-capable providers (not unreliable)", () => {
        // Gemini/Anthropic offline: browserTestUnreliable=false. A real 401/404
        // stays a specific, actionable error, not the browser-unsupported hint.
        const authErr = new AiClientError("x", { status: 401, detail: "bad key" });
        expect(isBrowserUnsupportedTestResult(authErr, false)).toBe(false);
        const modelErr = new AiClientError("x", { status: 404, detail: "no model" });
        expect(isBrowserUnsupportedTestResult(modelErr, false)).toBe(false);
    });

    it("treats a genuine transport/CORS failure as browser-unsupported for any provider", () => {
        const network = new AiClientError("Failed to fetch", { isNetwork: true });
        expect(isBrowserUnsupportedTestResult(network, false)).toBe(true);
        expect(isBrowserUnsupportedTestResult(network, true)).toBe(true);
    });
});
