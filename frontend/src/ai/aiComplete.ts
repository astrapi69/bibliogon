/**
 * Storage-mode-aware single chat completion (offline AI, #450 / #34).
 *
 * The one place that decides HOW an AI completion is dispatched:
 *
 * - **Online (`mode === "api"`)** the backend AI route is authoritative (the
 *   key lives on the server). System + user messages are flattened into the
 *   `POST /api/ai/generate` shape (`prompt`, `system`, `book_id`).
 * - **Offline (`mode === "dexie"`)** there is no backend, so the configured
 *   provider is called DIRECTLY from the browser with the user's own key
 *   (read from IndexedDB via the settings seam) using {@link aiChat}.
 *
 * This generalises the per-feature dispatcher that previously lived inline in
 * `storyExtraction.ts`; the editor generate, the article SEO-meta generator and
 * the chapter review all route through here so a single call site governs the
 * offline/online split.
 *
 * @example
 * const { content } = await aiComplete(
 *   [
 *     { role: "system", content: "Rewrite the passage." },
 *     { role: "user", content: selection },
 *   ],
 *   { bookId, maxTokens: 800 },
 * );
 */

import { api } from "../api/client";
import { getStorage } from "../storage";
import { aiChat, getAiConfig, isAiConfigured, type AiChatMessage } from "./llmClient";

/** Thrown by {@link aiComplete} when offline and no usable AI config exists
 *  (no key for a key-requiring provider). Callers map it to the
 *  "configure your AI key" hint; the feature gates normally prevent reaching
 *  this, so it is a defensive guard rather than the expected path. */
export class AiNotConfiguredError extends Error {
    constructor(message = "AI is not configured") {
        super(message);
        this.name = "AiNotConfiguredError";
    }
}

export interface AiCompleteResult {
    content: string;
    /** Total tokens reported by the provider (0 for the backend path, which does
     *  not surface a usage count through `/api/ai/generate`). */
    tokens: number;
}

/** Run one completion through the active backend (offline: browser-direct;
 *  online: `/api/ai/generate`). Throws {@link AiNotConfiguredError} offline
 *  without a usable config; propagates {@link AiClientError} on a provider /
 *  transport failure offline, or {@link ApiError} on a backend failure online. */
export async function aiComplete(
    messages: AiChatMessage[],
    opts: { bookId?: string; maxTokens?: number; temperature?: number } = {},
): Promise<AiCompleteResult> {
    if (getStorage().mode === "dexie") {
        const config = await getAiConfig();
        if (!isAiConfigured(config)) {
            throw new AiNotConfiguredError();
        }
        const result = await aiChat(config, messages, {
            maxTokens: opts.maxTokens,
            temperature: opts.temperature,
        });
        return { content: result.content, tokens: result.usage.total_tokens };
    }
    const system = messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n\n");
    const user = messages
        .filter((message) => message.role !== "system")
        .map((message) => message.content)
        .join("\n\n");
    const result = await api.ai.generate(user, system, opts.bookId ?? "");
    return { content: result.content, tokens: 0 };
}
