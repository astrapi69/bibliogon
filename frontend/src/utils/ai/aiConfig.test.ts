import { describe, it, expect } from "vitest";
import {
    maskSecret,
    normalizeAiConfig,
    resolveActiveConfig,
    providerKeyStatus,
    keyRequiringProviderIds,
    buildAiPatch,
    modelForProvider,
} from "./aiConfig";
import { AI_PROVIDER_IDS } from "./aiProviders";
import { providerSupportsBrowserTest } from "../../ai/llmClient";

describe("maskSecret", () => {
    it("shows first 4 + last 4 characters for a long key", () => {
        expect(maskSecret("AIzaSyABCD1234efgh")).toBe("AIza...efgh");
    });
    it("collapses a short key to dots", () => {
        expect(maskSecret("short")).toBe("•••••");
    });
    it("returns an empty string for empty/whitespace/null", () => {
        expect(maskSecret("")).toBe("");
        expect(maskSecret("   ")).toBe("");
        expect(maskSecret(undefined)).toBe("");
        expect(maskSecret(null)).toBe("");
    });
});

describe("normalizeAiConfig migration", () => {
    it("(c) reads the canonical active_provider + keys + model_overrides shape", () => {
        const s = normalizeAiConfig({
            active_provider: "anthropic",
            keys: { google: "g-key", anthropic: "a-key" },
            model_overrides: { anthropic: "claude-sonnet-4-6" },
            enabled: true,
        });
        expect(s.active_provider).toBe("anthropic");
        expect(s.keys).toEqual({ google: "g-key", anthropic: "a-key" });
        expect(s.model_overrides.anthropic).toBe("claude-sonnet-4-6");
        expect(s.enabled).toBe(true);
    });

    it("(b) migrates the #459 provider_keys side-store", () => {
        const s = normalizeAiConfig({
            provider: "google",
            provider_keys: {
                google: { api_key: "g-key", model: "gemini-2.0-flash", base_url: "u" },
                anthropic: { api_key: "a-key", model: "claude-sonnet-4-6" },
            },
        });
        expect(s.keys.google).toBe("g-key");
        expect(s.keys.anthropic).toBe("a-key");
        expect(s.model_overrides.google).toBe("gemini-2.0-flash");
        expect(s.base_url_overrides.google).toBe("u");
        expect(s.active_provider).toBe("google");
    });

    it("(a) migrates a legacy single-key config", () => {
        const s = normalizeAiConfig({
            provider: "google",
            api_key: "legacy-key",
            model: "gemini-2.0-flash",
            base_url: "https://example/v1",
        });
        expect(s.keys.google).toBe("legacy-key");
        expect(s.model_overrides.google).toBe("gemini-2.0-flash");
        expect(s.base_url_overrides.google).toBe("https://example/v1");
        expect(s.active_provider).toBe("google");
    });

    it("canonical keys win over the legacy mirror for the same provider", () => {
        const s = normalizeAiConfig({
            active_provider: "google",
            keys: { google: "canonical" },
            provider: "google",
            api_key: "legacy",
        });
        expect(s.keys.google).toBe("canonical");
    });

    it("defaults to lmstudio when nothing is set", () => {
        expect(normalizeAiConfig({}).active_provider).toBe("lmstudio");
        expect(normalizeAiConfig(undefined).keys).toEqual({});
    });
});

describe("resolveActiveConfig", () => {
    it("resolves the active provider's key + model + preset base_url", () => {
        const s = normalizeAiConfig({
            active_provider: "google",
            keys: { google: "g-key" },
            model_overrides: { google: "gemini-2.0-flash" },
        });
        const active = resolveActiveConfig(s);
        expect(active.provider).toBe("google");
        expect(active.api_key).toBe("g-key");
        expect(active.model).toBe("gemini-2.0-flash");
        expect(active.base_url).toContain("generativelanguage");
    });

    it("the keystone: switching active_provider keeps both keys", () => {
        const s = normalizeAiConfig({
            active_provider: "google",
            keys: { google: "g-key", anthropic: "a-key" },
        });
        s.active_provider = "anthropic";
        const active = resolveActiveConfig(s);
        expect(active.api_key).toBe("a-key");
        expect(s.keys.google).toBe("g-key"); // google key untouched
    });

    it("falls back to the preset model when no override", () => {
        const s = normalizeAiConfig({ active_provider: "google", keys: { google: "g" } });
        expect(modelForProvider(s, "google")).toBe("gemini-2.0-flash");
    });
});

describe("providerKeyStatus", () => {
    const base = {
        offline: true,
        supportsBrowserTest: providerSupportsBrowserTest,
        secretsExternal: false,
    };

    it("empty when no key", () => {
        const s = normalizeAiConfig({ active_provider: "google", keys: {} });
        expect(providerKeyStatus("google", s, base)).toBe("empty");
    });
    it("active for a browser-testable provider with a key", () => {
        const s = normalizeAiConfig({ active_provider: "google", keys: { google: "k" } });
        expect(providerKeyStatus("google", s, base)).toBe("active");
    });
    it("active offline for OpenAI now that it is browser-capable (#467)", () => {
        // #467: OpenAI/Mistral are browser-capable, so providerSupportsBrowserTest
        // returns true and a stored key reads as `active` even offline.
        const s = normalizeAiConfig({ active_provider: "google", keys: { openai: "k" } });
        expect(providerKeyStatus("openai", s, base)).toBe("active");
    });
    it("desktop_only offline only when a provider is flagged not-browser-testable (dormant)", () => {
        // No shipped provider hits this now; the branch stays defensive infra.
        const s = normalizeAiConfig({ active_provider: "google", keys: { openai: "k" } });
        const neverTestable = { ...base, supportsBrowserTest: () => false };
        expect(providerKeyStatus("openai", s, neverTestable)).toBe("desktop_only");
    });
    it("external for the active provider when secrets are managed externally", () => {
        const s = normalizeAiConfig({ active_provider: "google", keys: {} });
        expect(providerKeyStatus("google", s, { ...base, secretsExternal: true })).toBe("external");
        expect(providerKeyStatus("openai", s, { ...base, secretsExternal: true })).toBe("empty");
    });
});

describe("keyRequiringProviderIds", () => {
    it("includes cloud providers, excludes local/custom", () => {
        const ids = keyRequiringProviderIds(AI_PROVIDER_IDS);
        expect(ids).toEqual(expect.arrayContaining(["google", "anthropic", "openai", "mistral"]));
        expect(ids).not.toContain("lmstudio");
        expect(ids).not.toContain("custom");
    });
});

describe("buildAiPatch", () => {
    it("emits the canonical shape + a derived top-level mirror + cleared provider_keys", () => {
        const s = normalizeAiConfig({
            active_provider: "google",
            keys: { google: "g-key", anthropic: "a-key" },
            model_overrides: { google: "gemini-2.0-flash" },
            enabled: true,
        });
        const { ai } = buildAiPatch(s);
        expect(ai.active_provider).toBe("google");
        expect(ai.keys).toEqual({ google: "g-key", anthropic: "a-key" });
        // mirror reflects the active provider for the backend / legacy readers
        expect(ai.provider).toBe("google");
        expect(ai.api_key).toBe("g-key");
        expect(ai.model).toBe("gemini-2.0-flash");
        expect(ai.base_url).toContain("generativelanguage");
        // #459 side-store superseded
        expect(ai.provider_keys).toEqual({});
    });
});
