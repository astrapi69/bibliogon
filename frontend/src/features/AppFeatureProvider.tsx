import { useMemo, type ReactNode } from "react";

import { FeatureProvider } from "@astrapi69/feature-strategy-react";

import { useStorageMode } from "../storage/useStorageMode";
import { featureRegistry, type FeatureContext } from "./featureConfig";
import { useHasAiKey, useAiProviderBrowserCapable } from "./useHasAiKey";
import { useNavigatorOnline } from "./useNavigatorOnline";

/**
 * Mounts the {@link FeatureProvider} for the whole app, feeding it the live
 * `{ mode, hasAiKey, online, aiProviderBrowserCapable }` context derived from
 * the storage mode, the reactive AI-key + provider signals, and browser
 * connectivity. The context object is memoized so consumers only re-evaluate
 * when one of those actually changes.
 */
export function AppFeatureProvider({ children }: { children: ReactNode }) {
    const { mode } = useStorageMode();
    const hasAiKey = useHasAiKey();
    const aiProviderBrowserCapable = useAiProviderBrowserCapable();
    const online = useNavigatorOnline();
    const context = useMemo<FeatureContext>(
        () => ({ mode, hasAiKey, online, aiProviderBrowserCapable }),
        [mode, hasAiKey, online, aiProviderBrowserCapable],
    );
    return (
        <FeatureProvider registry={featureRegistry} context={context}>
            {children}
        </FeatureProvider>
    );
}
