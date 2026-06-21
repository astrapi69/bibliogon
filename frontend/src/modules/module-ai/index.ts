/**
 * module-ai — browser-side counterpart of the backend AI routes (`/api/ai/*`).
 *
 * Offline parity layer (Maximal Offline, #34 / #450). In the backendless
 * GitHub-Pages PWA there is no server to hold the AI key or proxy the provider,
 * so AI runs DIRECTLY from the browser against the user's own provider key
 * (stored in IndexedDB via the settings seam, never sent anywhere but the
 * provider). The same call sites that use the backend AI route online
 * (`api.ai.generate`) route through {@link aiComplete} so a single dispatcher
 * governs the offline/online split.
 *
 * CORS reality: every shipped provider serves browser CORS headers and runs
 * offline — Google (Gemini, OpenAI-compat endpoint), OpenAI, Mistral, Anthropic
 * (via its `anthropic-dangerous-direct-browser-access` opt-in header), a local
 * LM Studio, and a user-controlled `custom` endpoint (verified 2026-06-19; the
 * earlier OpenAI / Mistral gate from #450 was a misread 403, now removed). So AI
 * features are active for every provider in Dexie mode given a key
 * (feature-strategy, policy #78). {@link providerSupportsBrowserTest} stays the
 * single source of truth for that capability (currently true for all).
 *
 * Implementations live in `src/ai/*` (app-coupled via the storage seam); this
 * barrel is the stable plugin-parity seam under `modules/`.
 *
 * @example
 * import { aiComplete } from "@/modules/module-ai";
 * const { content } = await aiComplete([
 *   { role: "system", content: "Rewrite the passage." },
 *   { role: "user", content: selection },
 * ]);
 */

export { aiComplete, AiNotConfiguredError, type AiCompleteResult } from "../../ai/aiComplete";
export {
    aiChat,
    getAiConfig,
    isAiConfigured,
    classifyAiClientError,
    providerSupportsBrowserTest,
    AiClientError,
    type AiConfig,
    type AiChatMessage,
    type AiChatResult,
    type AiErrorKind,
} from "../../ai/llmClient";
export { buildReviewMessages, type ReviewFocus } from "../../ai/reviewPrompts";
export { buildMetaMessages, parseMetaResponse, type AiMetaField } from "../../ai/metaPrompts";
export { buildMarketingMessages } from "../../ai/marketingPrompts";
