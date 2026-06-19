/**
 * Per-provider AI credential store helpers.
 *
 * The app keeps ONE active AI config in `config.ai.{provider,api_key,model,
 * base_url,...}` (every downstream consumer reads it unchanged). Alongside it,
 * `config.ai.provider_keys` is a side-store of saved credentials keyed by
 * provider id, so the Settings UI can show the user WHICH providers already
 * have a key without exposing the keys themselves.
 *
 * These are pure functions (no React, no app singletons) so they are trivially
 * testable and reusable.
 */

import { getProviderPreset } from "./aiProviders";

/** Saved credentials for a single provider. */
export interface AiProviderKeyEntry {
    api_key?: string;
    model?: string;
    base_url?: string;
}

/** Map of provider id -> saved credentials. */
export type AiProviderKeysMap = Record<string, AiProviderKeyEntry>;

/** Visible status of a provider row in the key-overview table. */
export type AiProviderStatus = "active" | "empty" | "desktop_only";

/**
 * Mask a secret for display: first 4 + "..." + last 4 characters, so the user
 * can confirm a key is stored without revealing it. Short keys (<= 8 chars)
 * collapse to a fixed run of dots.
 *
 * @example
 * maskKeyPreview("AIzaSyABCD1234efgh") // "AIza...efgh"
 * maskKeyPreview("short")              // "•••••"
 * maskKeyPreview("")                    // ""
 */
export function maskKeyPreview(key: string | undefined | null): string {
    const trimmed = (key ?? "").trim();
    if (!trimmed) return "";
    if (trimmed.length <= 8) return "•".repeat(trimmed.length);
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

/**
 * Read the per-provider key map out of an `ai` config section. Returns a fresh
 * object (never the stored reference) so callers can mutate the copy safely.
 */
export function readProviderKeys(aiConfig: Record<string, unknown> | undefined): AiProviderKeysMap {
    const raw = (aiConfig?.provider_keys ?? {}) as Record<string, unknown>;
    const out: AiProviderKeysMap = {};
    for (const [id, value] of Object.entries(raw)) {
        if (value && typeof value === "object") {
            const entry = value as Record<string, unknown>;
            out[id] = {
                api_key: typeof entry.api_key === "string" ? entry.api_key : "",
                model: typeof entry.model === "string" ? entry.model : "",
                base_url: typeof entry.base_url === "string" ? entry.base_url : "",
            };
        }
    }
    return out;
}

/** True when the saved entry for a provider carries a non-empty API key. */
export function providerHasKey(entry: AiProviderKeyEntry | undefined): boolean {
    return Boolean(entry?.api_key && entry.api_key.trim());
}

/**
 * The per-provider map, with the currently active provider's top-level
 * credentials folded in when `provider_keys` doesn't already carry them.
 *
 * Backward-compat: configs written before this feature only have
 * `ai.{provider,api_key,model}`. Without this fold-in the active provider's
 * existing key would show as "empty" in the table. Folding it in also means
 * the first save migrates the legacy key into `provider_keys`.
 */
export function effectiveProviderKeys(
    aiConfig: Record<string, unknown> | undefined,
): AiProviderKeysMap {
    const keys = readProviderKeys(aiConfig);
    const provider = typeof aiConfig?.provider === "string" ? aiConfig.provider : "";
    const apiKey = typeof aiConfig?.api_key === "string" ? aiConfig.api_key : "";
    if (
        provider &&
        getProviderPreset(provider)?.requires_api_key &&
        apiKey.trim() &&
        !providerHasKey(keys[provider])
    ) {
        keys[provider] = {
            api_key: apiKey,
            model: typeof aiConfig?.model === "string" ? aiConfig.model : "",
            base_url: typeof aiConfig?.base_url === "string" ? aiConfig.base_url : "",
        };
    }
    return keys;
}

/**
 * Resolve the table status for one provider.
 *
 * - `empty`         no saved key.
 * - `desktop_only`  a key is saved, but the provider cannot be reached
 *                   browser-direct in the offline PWA (CORS), so it only works
 *                   in the desktop app.
 * - `active`        a saved key usable in the current deployment.
 */
export function providerStatus(
    providerId: string,
    keys: AiProviderKeysMap,
    opts: { offline: boolean; supportsBrowserTest: (provider: string) => boolean },
): AiProviderStatus {
    if (!providerHasKey(keys[providerId])) return "empty";
    if (opts.offline && !opts.supportsBrowserTest(providerId)) return "desktop_only";
    return "active";
}

/**
 * The list of providers shown in the key-overview table: every preset that
 * requires an API key (local / custom providers have no key to surface).
 */
export function keyRequiringProviderIds(allIds: readonly string[]): string[] {
    return allIds.filter((id) => getProviderPreset(id)?.requires_api_key);
}
