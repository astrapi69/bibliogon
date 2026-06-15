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
});
