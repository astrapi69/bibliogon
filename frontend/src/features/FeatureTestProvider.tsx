import type { ReactNode } from "react";

import { FeatureProvider } from "@astrapi69/feature-strategy-react";

import { featureRegistry, type FeatureContext } from "./featureConfig";

/**
 * Test-only wrapper that mounts the real {@link featureRegistry} with a fixed
 * evaluation context, so components using `useFeature` can be rendered in
 * isolation. Defaults to the online, fully-active context (`api` mode, key
 * present), which matches the assumptions of pre-migration component tests.
 */
export function FeatureTestProvider({
    children,
    mode = "api",
    hasAiKey = true,
}: {
    children: ReactNode;
} & Partial<FeatureContext>) {
    return (
        <FeatureProvider registry={featureRegistry} context={{ mode, hasAiKey }}>
            {children}
        </FeatureProvider>
    );
}
