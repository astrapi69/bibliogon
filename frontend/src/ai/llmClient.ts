/**
 * Browser-direct LLM client (offline AI via the user's own key, #34 P4).
 *
 * The backendless build calls the AI provider DIRECTLY from the browser using
 * the key the user stored in Settings (persisted in IndexedDB via the settings
 * seam; never sent anywhere but the provider). Supports the OpenAI-compatible
 * chat API (openai / google-gemini / mistral / lmstudio) and Anthropic's
 * native messages API.
 *
 * CORS: OpenAI, Google and a local LM Studio accept browser calls; Anthropic
 * requires the explicit `anthropic-dangerous-direct-browser-access` header
 * (the user is knowingly exposing their own key in their own browser). The key
 * is the user's and stays on their device — this is local-first, not a hosted
 * proxy.
 */

import { getStorage } from "../storage";
import { normalizeAiConfig, resolveActiveConfig } from "../utils/aiConfig";

export interface AiConfig {
    provider: string;
    base_url: string;
    model: string;
    api_key: string;
}

export interface AiChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface AiChatResult {
    content: string;
    model: string;
    usage: { total_tokens: number };
}

/** Default base URLs per provider (fallback when the user left base_url blank;
 *  mirrors backend/app/ai/providers.py). */
const PROVIDER_BASE_URL: Record<string, string> = {
    anthropic: "https://api.anthropic.com/v1",
    openai: "https://api.openai.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta/openai",
    mistral: "https://api.mistral.ai/v1",
    lmstudio: "http://localhost:1234/v1",
};

const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Providers whose API serves CORS headers for direct browser calls, so the
 * offline (PWA / Dexie) connection test can actually run. Google's
 * OpenAI-compat endpoint and a local LM Studio allow it; Anthropic opts in via
 * the `anthropic-dangerous-direct-browser-access` header; `custom` is assumed
 * to be a user-controlled OpenAI-compatible endpoint (Ollama / vLLM / gateway)
 * that the user can configure for CORS.
 *
 * OpenAI and Mistral may NOT send `access-control-allow-origin` for browser
 * calls, so a browser test for them can fail on the network layer regardless
 * of the key. This drives an ADVISORY note in the UI ("test may not work in
 * the browser; the key is checked on the first AI call") — it does NOT disable
 * the test, because the actual runtime result is authoritative: a real HTTP
 * error (401 bad key, 404 bad model) is classified honestly via
 * {@link classifyAiClientError}, and only a genuine transport/CORS failure
 * (no HTTP status) is reported as a browser limitation.
 */
const BROWSER_TESTABLE_PROVIDERS = new Set(["anthropic", "google", "lmstudio", "custom"]);

/** Whether `provider` can be connection-tested directly from the browser. */
export function providerSupportsBrowserTest(provider: string): boolean {
    return BROWSER_TESTABLE_PROVIDERS.has(provider);
}

/** Structured error category for an offline AI call, mirroring the backend's
 *  `LLMClient._classify_response` so the offline path shows the same honest
 *  messages as the desktop path. */
export type AiErrorKind =
    | "cors"
    | "auth_error"
    | "rate_limited"
    | "model_not_found"
    | "invalid_request"
    | "server_error"
    | "unknown";

/** Heuristic mirroring the backend (`_looks_like_api_key_error`): some providers
 *  (Gemini) report a bad/typo'd key as HTTP 400 `INVALID_ARGUMENT` rather than
 *  401/403 (see #355). Detect the key wording so it classifies as `auth_error`,
 *  not `invalid_request`. */
function looksLikeApiKeyError(text: string): boolean {
    const lowered = text.toLowerCase();
    return lowered.includes("api key") || lowered.includes("api_key_invalid");
}

/**
 * Map a thrown {@link AiClientError} to an {@link AiErrorKind}. A network/CORS
 * failure (a browser-blocked provider, an unreachable host) yields `"cors"`;
 * HTTP failures map by status, with a 400/422 carrying API-key wording promoted
 * to `auth_error` to match the backend classifier.
 *
 * @example
 * try { await aiChat(cfg, msgs); } catch (e) {
 *   if (classifyAiClientError(e) === "auth_error") notifyBadKey();
 * }
 */
export function classifyAiClientError(err: unknown): AiErrorKind {
    if (!(err instanceof AiClientError)) return "unknown";
    if (err.isNetwork) return "cors";
    const status = err.status;
    if (status === 401 || status === 403) return "auth_error";
    if (status === 429) return "rate_limited";
    if (status === 404) return "model_not_found";
    if (status === 400 || status === 422) {
        return looksLikeApiKeyError(err.detail) ? "auth_error" : "invalid_request";
    }
    if (status !== undefined && status >= 500) return "server_error";
    return "unknown";
}

/**
 * Whether an offline connection-test failure should be surfaced as a browser
 * limitation (an informational "can't reach this provider from the browser -
 * use the desktop app or choose Gemini" hint) rather than a specific hard
 * error.
 *
 * True when the provider can't be reached browser-direct at all in this context
 * (`browserTestUnreliable`: OpenAI / Mistral, whose APIs serve no browser CORS
 * and answer 403/blocked) - for them a 401/403/404 is NOT an actionable
 * key/model error, it is "this provider does not work in a browser". Also true
 * for a genuine transport/CORS failure on any provider. For browser-capable
 * providers (Gemini / Anthropic / LM Studio / custom) a real HTTP error keeps
 * its specific, actionable message.
 *
 * @example
 * if (isBrowserUnsupportedTestResult(err, browserTestUnreliable)) showAdvisory();
 * else showError(classifyAiClientError(err));
 */
export function isBrowserUnsupportedTestResult(
    err: unknown,
    browserTestUnreliable: boolean,
): boolean {
    return browserTestUnreliable || classifyAiClientError(err) === "cors";
}

/** Read the AI config from the settings seam (offline: IndexedDB, where the
 *  api_key is present; online the backend strips it, but online uses the
 *  backend AI path, not this client). Resolves the active provider from the
 *  canonical `active_provider` + `keys` shape (any legacy/intermediate shape is
 *  normalized first). */
export async function getAiConfig(): Promise<AiConfig> {
    const app = await getStorage().settings.getApp();
    const settings = normalizeAiConfig(app.ai as Record<string, unknown> | undefined);
    const active = resolveActiveConfig(settings);
    return {
        provider: active.provider,
        base_url: active.base_url || PROVIDER_BASE_URL[active.provider] || "",
        model: active.model,
        api_key: active.api_key,
    };
}

/** Whether a usable AI config exists (a non-local provider needs a key). */
export function isAiConfigured(config: AiConfig): boolean {
    if (!config.base_url || !config.model) return false;
    if (config.provider === "lmstudio") return true;
    return !!config.api_key;
}

export class AiClientError extends Error {
    /** HTTP status when the provider responded with a non-2xx (undefined for a
     *  transport/CORS failure). */
    readonly status?: number;
    /** True when the request never got an HTTP response (network down, or CORS
     *  blocked the browser-direct call). */
    readonly isNetwork: boolean;
    /** Raw provider response body (or transport message), used to detect
     *  API-key wording for classification. */
    readonly detail: string;

    constructor(
        message: string,
        opts: { status?: number; isNetwork?: boolean; detail?: string } = {},
    ) {
        super(message);
        this.name = "AiClientError";
        this.status = opts.status;
        this.isNetwork = opts.isNetwork ?? false;
        this.detail = opts.detail ?? message;
    }
}

/** Call the configured provider with a chat completion. Throws AiClientError
 *  on a transport / provider error. */
export async function aiChat(
    config: AiConfig,
    messages: AiChatMessage[],
    opts: { maxTokens?: number; temperature?: number } = {},
): Promise<AiChatResult> {
    const maxTokens = opts.maxTokens ?? 1024;
    const temperature = opts.temperature ?? 0.7;
    const base = config.base_url.replace(/\/+$/, "");
    if (config.provider === "anthropic") {
        return anthropicChat(config, base, messages, maxTokens, temperature);
    }
    return openAiCompatChat(config, base, messages, maxTokens, temperature);
}

/**
 * List the model ids the provider exposes via `GET {base}/models`, browser-direct
 * with the user's key. OpenAI-compatible providers (OpenAI / Gemini / Mistral /
 * LM Studio / custom) return `{ data: [{ id }] }`; Anthropic exposes the same
 * shape at `/v1/models` and accepts the browser-access header.
 *
 * Throws {@link AiClientError} on a transport/CORS failure or a non-2xx response,
 * so callers can fall back to the preset suggestions.
 *
 * @example
 * const ids = await listModels(config); // ["gpt-4o", "gpt-4o-mini", ...]
 */
export async function listModels(config: AiConfig): Promise<string[]> {
    const base = config.base_url.replace(/\/+$/, "");
    const headers: Record<string, string> =
        config.provider === "anthropic"
            ? {
                  "x-api-key": config.api_key,
                  "anthropic-version": ANTHROPIC_VERSION,
                  "anthropic-dangerous-direct-browser-access": "true",
              }
            : config.api_key
              ? { Authorization: `Bearer ${config.api_key}` }
              : {};
    const res = await safeFetch(`${base}/models`, { method: "GET", headers });
    const data = await parseJson(res);
    const rows: unknown = data?.data;
    if (!Array.isArray(rows)) return [];
    return rows
        .map((row) => (row && typeof row === "object" ? (row as { id?: unknown }).id : undefined))
        .filter((id): id is string => typeof id === "string" && id.length > 0);
}

async function openAiCompatChat(
    config: AiConfig,
    base: string,
    messages: AiChatMessage[],
    maxTokens: number,
    temperature: number,
): Promise<AiChatResult> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.api_key) headers.Authorization = `Bearer ${config.api_key}`;
    const res = await safeFetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model: config.model,
            messages,
            temperature,
            max_tokens: maxTokens,
        }),
    });
    const data = await parseJson(res);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
        throw new AiClientError("Provider returned no message content");
    }
    return {
        content,
        model: typeof data.model === "string" ? data.model : config.model,
        usage: { total_tokens: Number(data?.usage?.total_tokens ?? 0) },
    };
}

async function anthropicChat(
    config: AiConfig,
    base: string,
    messages: AiChatMessage[],
    maxTokens: number,
    temperature: number,
): Promise<AiChatResult> {
    // Anthropic carries `system` as a top-level param, not a message role.
    const system = messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");
    const turns = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));
    const res = await safeFetch(`${base}/messages`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": config.api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
            model: config.model,
            max_tokens: maxTokens,
            temperature,
            ...(system ? { system } : {}),
            messages: turns,
        }),
    });
    const data = await parseJson(res);
    const content = data?.content?.[0]?.text;
    if (typeof content !== "string") {
        throw new AiClientError("Provider returned no message content");
    }
    const usage = data?.usage ?? {};
    return {
        content,
        model: typeof data.model === "string" ? data.model : config.model,
        usage: {
            total_tokens: Number(usage.input_tokens ?? 0) + Number(usage.output_tokens ?? 0),
        },
    };
}

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
        res = await fetch(url, init);
    } catch (err) {
        throw new AiClientError(err instanceof Error ? err.message : "Network request failed", {
            isNetwork: true,
        });
    }
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new AiClientError(
            `Provider responded ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
            { status: res.status, detail },
        );
    }
    return res;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseJson(res: Response): Promise<any> {
    try {
        return await res.json();
    } catch {
        throw new AiClientError("Provider returned invalid JSON");
    }
}
