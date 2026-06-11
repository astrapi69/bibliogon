import { useMemo, type ReactNode } from "react";

import { FeatureProvider } from "@astrapi69/feature-strategy-react";

import { useStorageMode } from "../storage/useStorageMode";
import { featureRegistry, type FeatureContext } from "./featureConfig";
import { useHasAiKey } from "./useHasAiKey";

/**
 * Mounts the {@link FeatureProvider} for the whole app, feeding it the live
 * `{ mode, hasAiKey }` context derived from the storage mode and the reactive
 * AI-key signal. The context object is memoized so consumers only re-evaluate
 * when `mode` or `hasAiKey` actually changes.
 */
export function AppFeatureProvider({ children }: { children: ReactNode }) {
    const { mode } = useStorageMode();
    const hasAiKey = useHasAiKey();
    const context = useMemo<FeatureContext>(() => ({ mode, hasAiKey }), [mode, hasAiKey]);
    return (
        <FeatureProvider registry={featureRegistry} context={context}>
            {children}
        </FeatureProvider>
    );
}
