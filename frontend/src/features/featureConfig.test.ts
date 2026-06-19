import { describe, it, expect } from "vitest";

import { FEATURES, FEATURE_REASON, featureRegistry, type FeatureContext } from "./featureConfig";

const API: FeatureContext = { mode: "api", hasAiKey: false };
const DEXIE_NO_KEY: FeatureContext = { mode: "dexie", hasAiKey: false };
const DEXIE_WITH_KEY: FeatureContext = { mode: "dexie", hasAiKey: true };

describe("featureRegistry", () => {
    it("resolves desktop-only features to active online, disabled offline", () => {
        expect(featureRegistry.getState(FEATURES.GIT_SYNC, API)).toBe("active");
        expect(featureRegistry.getState(FEATURES.GIT_SYNC, DEXIE_NO_KEY)).toBe("disabled");
        // Desktop-only features stay disabled offline even with an AI key.
        expect(featureRegistry.getState(FEATURES.TTS, DEXIE_WITH_KEY)).toBe("disabled");
        expect(featureRegistry.getReason(FEATURES.GIT_SYNC, DEXIE_NO_KEY)).toBe(
            FEATURE_REASON.REQUIRES_DESKTOP_APP,
        );
    });

    it("disables key-dependent features offline only without a key", () => {
        expect(featureRegistry.getState(FEATURES.AI_GENERATE, API)).toBe("active");
        expect(featureRegistry.getState(FEATURES.AI_GENERATE, DEXIE_NO_KEY)).toBe("disabled");
        expect(featureRegistry.getState(FEATURES.AI_GENERATE, DEXIE_WITH_KEY)).toBe("active");
        expect(featureRegistry.getState(FEATURES.AI_FILL, DEXIE_NO_KEY)).toBe("disabled");
        expect(featureRegistry.getReason(FEATURES.AI_GENERATE, DEXIE_NO_KEY)).toBe(
            FEATURE_REASON.REQUIRES_AI_KEY,
        );
    });

    it("gates key-dependent AI features on provider browser-capability offline (#450)", () => {
        const dexieGemini: FeatureContext = {
            mode: "dexie",
            hasAiKey: true,
            aiProviderBrowserCapable: true,
        };
        const dexieOpenAi: FeatureContext = {
            mode: "dexie",
            hasAiKey: true,
            aiProviderBrowserCapable: false,
        };
        for (const id of [FEATURES.AI_GENERATE, FEATURES.AI_FILL]) {
            // Browser-capable provider (Gemini/Anthropic/LM Studio): active.
            expect(featureRegistry.getState(id, dexieGemini)).toBe("active");
            // CORS-blocked provider (OpenAI/Mistral): disabled with the honest
            // provider-CORS reason, not a runtime failure on first call.
            expect(featureRegistry.getState(id, dexieOpenAi)).toBe("disabled");
            expect(featureRegistry.getReason(id, dexieOpenAi)).toBe(
                FEATURE_REASON.PROVIDER_CORS_BLOCKED,
            );
        }
        // Online the provider capability is irrelevant (the backend makes the
        // call), so a CORS-blocked provider stays active.
        expect(
            featureRegistry.getState(FEATURES.AI_GENERATE, {
                mode: "api",
                hasAiKey: true,
                aiProviderBrowserCapable: false,
            }),
        ).toBe("active");
        // Missing key still wins over provider capability (configure first).
        expect(
            featureRegistry.getReason(FEATURES.AI_GENERATE, {
                mode: "dexie",
                hasAiKey: false,
                aiProviderBrowserCapable: false,
            }),
        ).toBe(FEATURE_REASON.REQUIRES_AI_KEY);
    });

    it("gates AI story extraction on provider capability AND network offline (#450)", () => {
        const base = { mode: "dexie" as const, hasAiKey: true, online: true };
        // Online + key + CORS-blocked provider -> disabled, provider reason.
        expect(
            featureRegistry.getState(FEATURES.AI_STORY_EXTRACTION, {
                ...base,
                aiProviderBrowserCapable: false,
            }),
        ).toBe("disabled");
        expect(
            featureRegistry.getReason(FEATURES.AI_STORY_EXTRACTION, {
                ...base,
                aiProviderBrowserCapable: false,
            }),
        ).toBe(FEATURE_REASON.PROVIDER_CORS_BLOCKED);
        // A genuine offline state takes priority over the provider reason.
        expect(
            featureRegistry.getReason(FEATURES.AI_STORY_EXTRACTION, {
                ...base,
                online: false,
                aiProviderBrowserCapable: false,
            }),
        ).toBe(FEATURE_REASON.REQUIRES_NETWORK);
        // Browser-capable provider + online + key -> active.
        expect(
            featureRegistry.getState(FEATURES.AI_STORY_EXTRACTION, {
                ...base,
                aiProviderBrowserCapable: true,
            }),
        ).toBe("active");
    });

    it("disables ai-template-file-io offline (backend-only, key-independent)", () => {
        expect(featureRegistry.getState(FEATURES.AI_TEMPLATE_FILE_IO, API)).toBe("active");
        expect(featureRegistry.getState(FEATURES.AI_TEMPLATE_FILE_IO, DEXIE_NO_KEY)).toBe(
            "disabled",
        );
        expect(featureRegistry.getState(FEATURES.AI_TEMPLATE_FILE_IO, DEXIE_WITH_KEY)).toBe(
            "disabled",
        );
        expect(featureRegistry.getReason(FEATURES.AI_TEMPLATE_FILE_IO, DEXIE_NO_KEY)).toBe(
            FEATURE_REASON.REQUIRES_DESKTOP_APP,
        );
    });

    it("keeps always-active features active in both modes", () => {
        expect(featureRegistry.getState("export", API)).toBe("active");
        expect(featureRegistry.getState("export", DEXIE_NO_KEY)).toBe("active");
        expect(featureRegistry.getState("story-bible", DEXIE_NO_KEY)).toBe("active");
        expect(featureRegistry.getState(FEATURES.BACKUP_EXPORT, DEXIE_NO_KEY)).toBe("active");
        expect(featureRegistry.getState(FEATURES.BACKUP_IMPORT, DEXIE_NO_KEY)).toBe("active");
        expect(featureRegistry.getState(FEATURES.SELECTIVE_EXPORT, DEXIE_NO_KEY)).toBe("active");
        // .bgb import is client-side now (#99), so it is active offline too.
        expect(featureRegistry.getState(FEATURES.BGB_IMPORT, DEXIE_NO_KEY)).toBe("active");
        // The Daten tab is purely client-side (#338): active in both modes.
        expect(featureRegistry.getState(FEATURES.DATA_MANAGEMENT, API)).toBe("active");
        expect(featureRegistry.getState(FEATURES.DATA_MANAGEMENT, DEXIE_NO_KEY)).toBe("active");
    });

    it("gates network-dependent import features on connectivity, not storage mode", () => {
        const apiOnline: FeatureContext = { mode: "api", hasAiKey: false, online: true };
        const dexieOnline: FeatureContext = { mode: "dexie", hasAiKey: false, online: true };
        const dexieOffline: FeatureContext = { mode: "dexie", hasAiKey: false, online: false };
        const apiOffline: FeatureContext = { mode: "api", hasAiKey: false, online: false };
        for (const id of [FEATURES.GITHUB_IMPORT, FEATURES.URL_IMPORT]) {
            expect(featureRegistry.getState(id, apiOnline)).toBe("active");
            expect(featureRegistry.getState(id, dexieOnline)).toBe("active");
            expect(featureRegistry.getState(id, dexieOffline)).toBe("disabled");
            expect(featureRegistry.getState(id, apiOffline)).toBe("disabled");
            expect(featureRegistry.getReason(id, dexieOffline)).toBe(
                FEATURE_REASON.REQUIRES_NETWORK,
            );
        }
        // Legacy fixtures without an `online` flag are treated as online.
        expect(featureRegistry.getState(FEATURES.GITHUB_IMPORT, DEXIE_NO_KEY)).toBe("active");
        expect(featureRegistry.getState(FEATURES.URL_IMPORT, API)).toBe("active");
    });

    it("never hides a registered product feature in any mode (policy #78)", () => {
        for (const id of Object.values(FEATURES)) {
            for (const ctx of [API, DEXIE_NO_KEY, DEXIE_WITH_KEY]) {
                expect(
                    featureRegistry.getState(id, ctx),
                    `${id} must be active or disabled, never hidden`,
                ).not.toBe("hidden");
            }
        }
    });

    it("fails closed to hidden for unknown ids (library safety net, not UI policy)", () => {
        expect(featureRegistry.getState("does-not-exist", DEXIE_NO_KEY)).toBe("hidden");
        expect(featureRegistry.getState("does-not-exist", API)).toBe("hidden");
    });

    it("keeps network-import features disabled (never hidden) when offline in both modes", () => {
        const offline: FeatureContext[] = [
            { mode: "api", hasAiKey: false, online: false },
            { mode: "dexie", hasAiKey: false, online: false },
        ];
        for (const ctx of offline) {
            for (const id of [FEATURES.GITHUB_IMPORT, FEATURES.URL_IMPORT]) {
                expect(featureRegistry.getState(id, ctx)).toBe("disabled");
            }
        }
    });
});
