/**
 * Canonical AI settings model (issue #460, adaptive-learner reference shape).
 *
 * The settings blob is stored as:
 *
 *   ai: {
 *     active_provider: "google",
 *     keys:            { google: "AIza...", anthropic: "sk-ant-..." },
 *     model_overrides: { google: "gemini-2.0-flash" },
 *     base_url_overrides: { custom: "http://localhost:11434/v1" },
 *     enabled, temperature, max_tokens,
 *     // derived MIRROR of the active provider (Bibliogon-specific: keeps the
 *     // backend AI service + every existing `ai.{provider,api_key,model,
 *     // base_url}` reader working unchanged):
 *     provider, api_key, model, base_url,
 *   }
 *
 * Keystone: switching the active provider only moves the `active_provider`
 * pointer; the per-provider `keys` stay. `base_url_overrides` is a Bibliogon
 * adaptation (the `custom` provider needs a user base_url; cloud providers fall
 * back to the `aiProviders.ts` preset).
 *
 * Pure functions (no React, no app singletons) — trivially testable, reused by
 * the Settings UI and by `getAiConfig()` in the browser-direct AI client.
 */

import { getProviderPreset } from "./aiProviders";

export interface AiSettings {
    active_provider: string;
    keys: Record<string, string>;
    model_overrides: Record<string, string>;
    base_url_overrides: Record<string, string>;
    enabled: boolean;
    temperature: number;
    max_tokens: number;
}

export type ProviderKeyStatus = "active" | "empty" | "desktop_only" | "external";

const DEFAULT_PROVIDER = "lmstudio";

/**
 * Mask a secret for display: first 4 + "..." + last 4 characters. Short keys
 * (<= 8 chars) collapse to a fixed run of dots.
 *
 * @example
 * maskSecret("AIzaSyABCD1234efgh") // "AIza...efgh"
 * maskSecret("short")              // "•••••"
 */
export function maskSecret(secret: string | undefined | null): string {
    const trimmed = (secret ?? "").trim();
    if (!trimmed) return "";
    if (trimmed.length <= 8) return "•".repeat(trimmed.length);
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function readStringMap(value: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (value && typeof value === "object") {
        for (const [id, v] of Object.entries(value as Record<string, unknown>)) {
            if (typeof v === "string" && v) out[id] = v;
        }
    }
    return out;
}

/**
 * Normalize any historical `ai` config shape into {@link AiSettings}:
 *   (a) legacy single-key (`provider` + `api_key` + `model`),
 *   (b) the #459 `provider_keys: { id: { api_key, model, base_url } }` side-store,
 *   (c) the canonical `active_provider` + `keys` + `model_overrides` shape.
 *
 * This is the on-read migration; persistence happens on the next save
 * ({@link buildAiPatch}). Always returns fresh maps so callers can mutate.
 */
export function normalizeAiConfig(raw: Record<string, unknown> | undefined): AiSettings {
    const ai = raw ?? {};

    // (c) canonical
    const keys = readStringMap(ai.keys);
    const modelOverrides = readStringMap(ai.model_overrides);
    const baseUrlOverrides = readStringMap(ai.base_url_overrides);

    // (b) #459 provider_keys
    if (ai.provider_keys && typeof ai.provider_keys === "object") {
        for (const [id, v] of Object.entries(ai.provider_keys as Record<string, unknown>)) {
            if (v && typeof v === "object") {
                const entry = v as Record<string, unknown>;
                if (!keys[id] && typeof entry.api_key === "string" && entry.api_key.trim()) {
                    keys[id] = entry.api_key;
                }
                if (!modelOverrides[id] && typeof entry.model === "string" && entry.model) {
                    modelOverrides[id] = entry.model;
                }
                if (!baseUrlOverrides[id] && typeof entry.base_url === "string" && entry.base_url) {
                    baseUrlOverrides[id] = entry.base_url;
                }
            }
        }
    }

    // (a) legacy top-level single key
    const legacyProvider = typeof ai.provider === "string" ? ai.provider : "";
    const legacyKey = typeof ai.api_key === "string" ? ai.api_key : "";
    const legacyModel = typeof ai.model === "string" ? ai.model : "";
    const legacyBaseUrl = typeof ai.base_url === "string" ? ai.base_url : "";
    if (
        legacyProvider &&
        getProviderPreset(legacyProvider)?.requires_api_key &&
        legacyKey.trim() &&
        !keys[legacyProvider]
    ) {
        keys[legacyProvider] = legacyKey;
    }
    if (legacyProvider && legacyModel && !modelOverrides[legacyProvider]) {
        modelOverrides[legacyProvider] = legacyModel;
    }
    if (legacyProvider && legacyBaseUrl && !baseUrlOverrides[legacyProvider]) {
        baseUrlOverrides[legacyProvider] = legacyBaseUrl;
    }

    const active_provider =
        (typeof ai.active_provider === "string" && ai.active_provider) ||
        legacyProvider ||
        DEFAULT_PROVIDER;

    const temperature =
        typeof ai.temperature === "number"
            ? ai.temperature
            : parseFloat(String(ai.temperature ?? "0.7")) || 0.7;
    const max_tokens =
        typeof ai.max_tokens === "number"
            ? ai.max_tokens
            : parseInt(String(ai.max_tokens ?? "4096")) || 4096;

    return {
        active_provider,
        keys,
        model_overrides: modelOverrides,
        base_url_overrides: baseUrlOverrides,
        enabled: Boolean(ai.enabled),
        temperature,
        max_tokens,
    };
}

export interface ResolvedAiConfig {
    provider: string;
    base_url: string;
    model: string;
    api_key: string;
}

/** The base_url for a provider: a user override, else the preset default. */
export function baseUrlForProvider(settings: AiSettings, providerId: string): string {
    return settings.base_url_overrides[providerId] || getProviderPreset(providerId)?.base_url || "";
}

/** The model for a provider: a user override, else the preset default. */
export function modelForProvider(settings: AiSettings, providerId: string): string {
    return (
        settings.model_overrides[providerId] || getProviderPreset(providerId)?.default_model || ""
    );
}

/** Resolve the active provider's effective config (for the AI client + the
 *  persisted top-level mirror). */
export function resolveActiveConfig(settings: AiSettings): ResolvedAiConfig {
    const provider = settings.active_provider;
    return {
        provider,
        base_url: baseUrlForProvider(settings, provider),
        model: modelForProvider(settings, provider),
        api_key: settings.keys[provider] || "",
    };
}

/** True when the provider has a stored, non-empty key. */
export function providerHasKey(settings: AiSettings, providerId: string): boolean {
    return Boolean(settings.keys[providerId]?.trim());
}

/**
 * Status of a provider row:
 *   - `external`      secrets come from `secrets.yaml` / an env-var (the active
 *                     provider only; others read `empty`).
 *   - `empty`         no stored key.
 *   - `desktop_only`  a key is stored but the provider can't be reached
 *                     browser-direct offline (CORS) — desktop app only.
 *   - `active`        a usable stored key.
 */
export function providerKeyStatus(
    providerId: string,
    settings: AiSettings,
    opts: {
        offline: boolean;
        supportsBrowserTest: (provider: string) => boolean;
        secretsExternal: boolean;
    },
): ProviderKeyStatus {
    if (opts.secretsExternal) {
        return providerId === settings.active_provider ? "external" : "empty";
    }
    if (!providerHasKey(settings, providerId)) return "empty";
    if (opts.offline && !opts.supportsBrowserTest(providerId)) return "desktop_only";
    return "active";
}

/** The providers shown in the overview table: those that require an API key
 *  (local / custom providers have no key to surface). */
export function keyRequiringProviderIds(allIds: readonly string[]): string[] {
    return allIds.filter((id) => getProviderPreset(id)?.requires_api_key);
}

/**
 * Build the settings patch to persist: the canonical shape PLUS a derived
 * top-level mirror of the active provider (so the backend AI service + every
 * existing `ai.{provider,api_key,model,base_url}` reader keeps working), and an
 * empty `provider_keys` to supersede the #459 side-store.
 */
export function buildAiPatch(settings: AiSettings): { ai: Record<string, unknown> } {
    const active = resolveActiveConfig(settings);
    return {
        ai: {
            enabled: settings.enabled,
            active_provider: settings.active_provider,
            keys: settings.keys,
            model_overrides: settings.model_overrides,
            base_url_overrides: settings.base_url_overrides,
            temperature: settings.temperature,
            max_tokens: settings.max_tokens,
            provider: active.provider,
            api_key: active.api_key,
            model: active.model,
            base_url: active.base_url,
            provider_keys: {},
        },
    };
}
