import { describe, it, expect } from "vitest";

import { FEATURE, FEATURE_REASON, featureRegistry, type FeatureContext } from "./featureConfig";

const API: FeatureContext = { mode: "api", hasAiKey: false };
const DEXIE_NO_KEY: FeatureContext = { mode: "dexie", hasAiKey: false };
const DEXIE_WITH_KEY: FeatureContext = { mode: "dexie", hasAiKey: true };

describe("featureRegistry", () => {
    it("resolves dexie-hidden features to active online, hidden offline", () => {
        expect(featureRegistry.getState(FEATURE.GIT_SYNC, API)).toBe("active");
        expect(featureRegistry.getState(FEATURE.GIT_SYNC, DEXIE_NO_KEY)).toBe("hidden");
        expect(featureRegistry.getState(FEATURE.TTS, DEXIE_WITH_KEY)).toBe("hidden");
        expect(featureRegistry.getReason(FEATURE.GIT_SYNC, DEXIE_NO_KEY)).toBe(
            FEATURE_REASON.REQUIRES_DESKTOP_APP,
        );
    });

    it("disables key-dependent features offline only without a key", () => {
        expect(featureRegistry.getState(FEATURE.AI_GENERATE, API)).toBe("active");
        expect(featureRegistry.getState(FEATURE.AI_GENERATE, DEXIE_NO_KEY)).toBe("disabled");
        expect(featureRegistry.getState(FEATURE.AI_GENERATE, DEXIE_WITH_KEY)).toBe("active");
        expect(featureRegistry.getState(FEATURE.AI_FILL, DEXIE_NO_KEY)).toBe("disabled");
        expect(featureRegistry.getReason(FEATURE.AI_GENERATE, DEXIE_NO_KEY)).toBe(
            FEATURE_REASON.REQUIRES_AI_KEY,
        );
    });

    it("keeps always-active features active in both modes", () => {
        expect(featureRegistry.getState("export", API)).toBe("active");
        expect(featureRegistry.getState("export", DEXIE_NO_KEY)).toBe("active");
        expect(featureRegistry.getState("story-bible", DEXIE_NO_KEY)).toBe("active");
    });

    it("fails closed to hidden for unknown ids", () => {
        expect(featureRegistry.getState("does-not-exist", DEXIE_NO_KEY)).toBe("hidden");
        expect(featureRegistry.getState("does-not-exist", API)).toBe("hidden");
    });
});
