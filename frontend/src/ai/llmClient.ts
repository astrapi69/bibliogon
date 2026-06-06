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

/** Read the AI config from the settings seam (offline: IndexedDB, where the
 *  api_key is present; online the backend strips it, but online uses the
 *  backend AI path, not this client). */
export async function getAiConfig(): Promise<AiConfig> {
  const app = await getStorage().settings.getApp();
  const ai = (app.ai ?? {}) as Record<string, unknown>;
  const provider = (ai.provider as string) || "lmstudio";
  return {
    provider,
    base_url: (ai.base_url as string) || PROVIDER_BASE_URL[provider] || "",
    model: (ai.model as string) || "",
    api_key: (ai.api_key as string) || "",
  };
}

/** Whether a usable AI config exists (a non-local provider needs a key). */
export function isAiConfigured(config: AiConfig): boolean {
  if (!config.base_url || !config.model) return false;
  if (config.provider === "lmstudio") return true;
  return !!config.api_key;
}

export class AiClientError extends Error {}

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
    throw new AiClientError(
      err instanceof Error ? err.message : "Network request failed",
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AiClientError(
      `Provider responded ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
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
