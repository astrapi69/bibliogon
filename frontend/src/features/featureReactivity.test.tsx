import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { useFeature } from "@astrapi69/feature-strategy-react";

import { AppFeatureProvider } from "./AppFeatureProvider";
import { FeatureTestProvider } from "./FeatureTestProvider";
import { FEATURES } from "./featureConfig";
import { AI_CONFIG_CHANGED_EVENT } from "./useHasAiKey";

// Force Dexie mode so the key-dependent + hidden buckets apply.
vi.mock("../storage/useStorageMode", () => ({
    useStorageMode: () => ({ mode: "dexie", online: false, offlineEnabled: true }),
}));

// Controllable AI-key source feeding useHasAiKey (reactive via the
// AI_CONFIG_CHANGED_EVENT window event).
let hasKey = false;
vi.mock("../ai/llmClient", () => ({
    getAiConfig: vi.fn(async () => ({
        provider: "openai",
        base_url: "https://api.openai.com/v1",
        model: "gpt-4o",
        api_key: hasKey ? "sk-test" : "",
    })),
    isAiConfigured: (config: { api_key: string }) => Boolean(config.api_key),
}));

function FeatureProbe({ id }: { id: string }) {
    const feature = useFeature(id);
    return <div data-testid="state">{feature.state}</div>;
}

beforeEach(() => {
    hasKey = false;
    vi.clearAllMocks();
});

describe("feature-strategy reactivity + fail-closed", () => {
    it("flips ai-generate disabled -> active when the key is set, without a reload", async () => {
        render(
            <AppFeatureProvider>
                <FeatureProbe id={FEATURES.AI_GENERATE} />
            </AppFeatureProvider>,
        );

        await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("disabled"));

        // Configure a key and fire the same event Settings dispatches on save.
        hasKey = true;
        act(() => {
            window.dispatchEvent(new Event(AI_CONFIG_CHANGED_EVENT));
        });

        // The feature goes active on the SAME mounted tree (no remount/reload).
        await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("active"));
    });

    it("fails closed: an unknown feature id resolves to hidden", () => {
        render(
            <FeatureTestProvider>
                <FeatureProbe id="does-not-exist" />
            </FeatureTestProvider>,
        );
        expect(screen.getByTestId("state").textContent).toBe("hidden");
    });
});
