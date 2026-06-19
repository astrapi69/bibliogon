import { useEffect, useState } from "react";

import { getAiConfig, isAiConfigured, providerSupportsBrowserTest } from "../ai/llmClient";

/**
 * Window event fired after the AI configuration is saved in Settings, so the
 * key-awareness of {@link useHasAiKey} is reactive: entering or removing a key
 * flips AI features without a reload. Matches the existing `bibliogon:*`
 * window-event convention.
 */
export const AI_CONFIG_CHANGED_EVENT = "bibliogon:ai-config-changed";

/**
 * Reactive AI-key signal feeding the {@link FeatureContext}.
 *
 * Reads the AI config from the storage seam on mount and re-reads it whenever
 * {@link AI_CONFIG_CHANGED_EVENT} fires. Returns `true` when a usable AI config
 * exists (a configured key, or a local provider that needs none).
 */
export function useHasAiKey(): boolean {
    const [hasKey, setHasKey] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const recheck = (): void => {
            void getAiConfig()
                .then((config) => {
                    if (!cancelled) setHasKey(isAiConfigured(config));
                })
                .catch(() => {
                    if (!cancelled) setHasKey(false);
                });
        };
        recheck();
        window.addEventListener(AI_CONFIG_CHANGED_EVENT, recheck);
        return () => {
            cancelled = true;
            window.removeEventListener(AI_CONFIG_CHANGED_EVENT, recheck);
        };
    }, []);

    return hasKey;
}

/**
 * Reactive provider-browser-capability signal feeding the
 * {@link FeatureContext}.
 *
 * Reads the configured AI provider from the storage seam on mount and on every
 * {@link AI_CONFIG_CHANGED_EVENT}, returning whether that provider can be
 * reached browser-direct (CORS). Only consequential in Dexie mode; online the
 * backend makes the call, so the gates ignore it. Defaults to `true` until the
 * first read resolves so AI features are not transiently gated on load.
 */
export function useAiProviderBrowserCapable(): boolean {
    const [capable, setCapable] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const recheck = (): void => {
            void getAiConfig()
                .then((config) => {
                    if (!cancelled) setCapable(providerSupportsBrowserTest(config.provider));
                })
                .catch(() => {
                    if (!cancelled) setCapable(true);
                });
        };
        recheck();
        window.addEventListener(AI_CONFIG_CHANGED_EVENT, recheck);
        return () => {
            cancelled = true;
            window.removeEventListener(AI_CONFIG_CHANGED_EVENT, recheck);
        };
    }, []);

    return capable;
}
