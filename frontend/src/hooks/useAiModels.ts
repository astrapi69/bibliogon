import { useCallback, useEffect, useRef, useState } from "react";
import {
    listModels as listModelsDirect,
    providerSupportsBrowserTest,
    type AiConfig,
} from "../ai/llmClient";
import { getProviderPreset } from "../utils/aiProviders";

/** Where the current model list came from: a live provider call (`"live"`) or
 *  the offline preset suggestions (`"fallback"`). */
export type AiModelsSource = "live" | "fallback";

export interface UseAiModelsResult {
    /** Model ids to show. Always non-empty when a preset exists: a live list
     *  when the provider call succeeded, the preset suggestions otherwise. */
    models: string[];
    /** A request is in flight. */
    loading: boolean;
    /** Provenance of {@link models}. */
    source: AiModelsSource;
    /** Force a refresh, bypassing the cache. */
    reload: () => void;
}

const TTL_MS = 60 * 60 * 1000;
const CACHE_PREFIX = "bibliogon.ai_models:";

/** Cache key per (provider, baseUrl, key-fingerprint). The full key is never
 *  stored — only its length + first 6 chars — so a key change busts the cache
 *  without persisting the secret. */
function cacheKey(provider: string, baseUrl: string, apiKey: string): string {
    const fp = apiKey ? `${apiKey.slice(0, 6)}.${apiKey.length}` : "nokey";
    return `${CACHE_PREFIX}${provider}:${baseUrl}:${fp}`;
}

function readCache(key: string): string[] | null {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const entry = JSON.parse(raw) as { models?: unknown; ts?: unknown };
        if (typeof entry.ts !== "number" || Date.now() - entry.ts > TTL_MS) return null;
        return Array.isArray(entry.models) ? (entry.models as string[]) : null;
    } catch {
        return null;
    }
}

function writeCache(key: string, models: string[]): void {
    try {
        sessionStorage.setItem(key, JSON.stringify({ models, ts: Date.now() }));
    } catch {
        // sessionStorage may be unavailable/full; caching is best-effort.
    }
}

/**
 * Load the available models for the configured AI provider, with a preset
 * fallback and a 1h sessionStorage cache.
 *
 * The list is loaded browser-direct (same path online + offline) only for
 * providers whose `/models` endpoint serves CORS headers
 * ({@link providerSupportsBrowserTest}: Gemini / Anthropic / LM Studio /
 * custom). OpenAI / Mistral (CORS-blocked from a browser) and any failure fall
 * back to the provider's preset `model_suggestions` — never the only option,
 * since the model field stays free-text. Changing the provider, base URL, or
 * key resets to the fallback and reloads (busting the cache).
 *
 * @example
 * const { models, loading, source, reload } = useAiModels({
 *   provider, baseUrl, apiKey, enabled,
 * });
 */
export function useAiModels(params: {
    provider: string;
    baseUrl: string;
    apiKey: string;
    enabled?: boolean;
}): UseAiModelsResult {
    const { provider, baseUrl, apiKey, enabled = true } = params;
    const fallback = getProviderPreset(provider)?.model_suggestions ?? [];
    const requiresKey = getProviderPreset(provider)?.requires_api_key ?? false;

    const [models, setModels] = useState<string[]>(fallback);
    const [loading, setLoading] = useState(false);
    const [source, setSource] = useState<AiModelsSource>("fallback");
    const reqId = useRef(0);

    const load = useCallback(
        async (force: boolean) => {
            const presetSuggestions = getProviderPreset(provider)?.model_suggestions ?? [];
            const key = cacheKey(provider, baseUrl, apiKey);

            if (!force) {
                const cached = readCache(key);
                if (cached && cached.length) {
                    setModels(cached);
                    setSource("live");
                    return;
                }
            }

            // Providers whose /models is CORS-blocked from a browser stay on the
            // preset list; only attempt a live call where it can succeed.
            if (!providerSupportsBrowserTest(provider) || (requiresKey && !apiKey.trim())) {
                setModels(presetSuggestions);
                setSource("fallback");
                return;
            }

            const id = ++reqId.current;
            setLoading(true);
            try {
                const cfg: AiConfig = {
                    provider,
                    base_url: baseUrl,
                    model: "",
                    api_key: apiKey,
                };
                const ids = await listModelsDirect(cfg);
                if (id !== reqId.current) return;
                if (ids.length) {
                    setModels(ids);
                    setSource("live");
                    writeCache(key, ids);
                } else {
                    setModels(presetSuggestions);
                    setSource("fallback");
                }
            } catch {
                if (id !== reqId.current) return;
                setModels(presetSuggestions);
                setSource("fallback");
            } finally {
                if (id === reqId.current) setLoading(false);
            }
        },
        [provider, baseUrl, apiKey, requiresKey],
    );

    useEffect(() => {
        setModels(getProviderPreset(provider)?.model_suggestions ?? []);
        setSource("fallback");
        reqId.current += 1;
        if (!enabled) return;
        void load(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider, baseUrl, apiKey, enabled]);

    return { models, loading, source, reload: () => void load(true) };
}
