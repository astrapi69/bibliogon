import { describe, it, expect } from "vitest";
import {
    maskKeyPreview,
    readProviderKeys,
    effectiveProviderKeys,
    providerHasKey,
    providerStatus,
    keyRequiringProviderIds,
} from "./aiProviderKeys";
import { AI_PROVIDER_IDS } from "./aiProviders";
import { providerSupportsBrowserTest } from "../ai/llmClient";

describe("maskKeyPreview", () => {
    it("shows first 4 + last 4 characters for a long key", () => {
        expect(maskKeyPreview("AIzaSyABCD1234efgh")).toBe("AIza...efgh");
    });

    it("collapses a short key to dots", () => {
        expect(maskKeyPreview("short")).toBe("•••••");
    });

    it("returns an empty string for an empty/whitespace key", () => {
        expect(maskKeyPreview("")).toBe("");
        expect(maskKeyPreview("   ")).toBe("");
        expect(maskKeyPreview(undefined)).toBe("");
        expect(maskKeyPreview(null)).toBe("");
    });
});

describe("readProviderKeys", () => {
    it("returns an empty map when no provider_keys present", () => {
        expect(readProviderKeys({})).toEqual({});
        expect(readProviderKeys(undefined)).toEqual({});
    });

    it("normalizes entries and ignores non-object values", () => {
        const keys = readProviderKeys({
            provider_keys: {
                google: { api_key: "k1", model: "gemini-2.0-flash", base_url: "u" },
                anthropic: { api_key: "k2" },
                broken: "not-an-object",
            },
        });
        expect(keys.google).toEqual({ api_key: "k1", model: "gemini-2.0-flash", base_url: "u" });
        expect(keys.anthropic).toEqual({ api_key: "k2", model: "", base_url: "" });
        expect(keys.broken).toBeUndefined();
    });

    it("returns a fresh copy (mutating it does not touch the source)", () => {
        const source = { provider_keys: { google: { api_key: "k1" } } };
        const keys = readProviderKeys(source);
        keys.google.api_key = "mutated";
        expect((source.provider_keys.google as { api_key: string }).api_key).toBe("k1");
    });
});

describe("effectiveProviderKeys", () => {
    it("folds the active provider's legacy top-level key into the map", () => {
        const keys = effectiveProviderKeys({
            provider: "google",
            api_key: "legacy-key",
            model: "gemini-2.0-flash",
            base_url: "u",
        });
        expect(keys.google).toEqual({
            api_key: "legacy-key",
            model: "gemini-2.0-flash",
            base_url: "u",
        });
    });

    it("does not override an existing provider_keys entry", () => {
        const keys = effectiveProviderKeys({
            provider: "google",
            api_key: "legacy-key",
            provider_keys: { google: { api_key: "stored", model: "m", base_url: "b" } },
        });
        expect(keys.google.api_key).toBe("stored");
    });

    it("ignores a no-key active provider (lmstudio)", () => {
        const keys = effectiveProviderKeys({ provider: "lmstudio", api_key: "" });
        expect(keys.lmstudio).toBeUndefined();
    });
});

describe("providerHasKey", () => {
    it("is true only for a non-empty key", () => {
        expect(providerHasKey({ api_key: "k" })).toBe(true);
        expect(providerHasKey({ api_key: "  " })).toBe(false);
        expect(providerHasKey({})).toBe(false);
        expect(providerHasKey(undefined)).toBe(false);
    });
});

describe("providerStatus", () => {
    const opts = { offline: true, supportsBrowserTest: providerSupportsBrowserTest };

    it("empty when no key is saved", () => {
        expect(providerStatus("google", {}, opts)).toBe("empty");
    });

    it("active for a browser-testable provider with a key", () => {
        expect(providerStatus("google", { google: { api_key: "k" } }, opts)).toBe("active");
    });

    it("desktop_only offline for a CORS-blocked provider with a key", () => {
        expect(providerStatus("openai", { openai: { api_key: "k" } }, opts)).toBe("desktop_only");
    });

    it("active online for a CORS-blocked provider with a key", () => {
        expect(
            providerStatus("openai", { openai: { api_key: "k" } }, { ...opts, offline: false }),
        ).toBe("active");
    });
});

describe("keyRequiringProviderIds", () => {
    it("includes the cloud providers and excludes local/custom", () => {
        const ids = keyRequiringProviderIds(AI_PROVIDER_IDS);
        expect(ids).toContain("google");
        expect(ids).toContain("anthropic");
        expect(ids).toContain("openai");
        expect(ids).toContain("mistral");
        expect(ids).not.toContain("lmstudio");
        expect(ids).not.toContain("custom");
    });
});
