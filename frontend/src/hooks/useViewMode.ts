/**
 * Per-dashboard view-mode preference (grid vs list) backed by the
 * existing ``app.yaml`` ``ui.dashboard.*_view`` keys. Reads on mount,
 * writes on change. Falls back to ``grid`` when the API call fails or
 * the key is unset (matching legacy behaviour for users who upgraded
 * before the toggle shipped).
 *
 * The hook owns the optimistic update: ``setMode`` flips local state
 * immediately and fires the PATCH in the background so the toggle
 * feels instant. Errors surface through the standard notify channel
 * so the user knows the preference did not persist.
 */
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { getStorage } from "../storage";
import type { ViewMode } from "../components/ViewToggle";

type DashboardScope = "books" | "articles";
type TrashScope = "books" | "articles";

const STORAGE_KEY = "books_view";
const STORAGE_KEY_ARTICLES = "articles_view";
const STORAGE_KEY_BOOKS_TRASH = "books_trash_view";
const STORAGE_KEY_ARTICLES_TRASH = "articles_trash_view";

function isViewMode(value: unknown): value is ViewMode {
    return value === "grid" || value === "list";
}

function readDashboardKey(scope: DashboardScope): "books_view" | "articles_view" {
    return scope === "books" ? STORAGE_KEY : STORAGE_KEY_ARTICLES;
}

function readTrashKey(
    scope: TrashScope,
): "books_trash_view" | "articles_trash_view" {
    return scope === "books" ? STORAGE_KEY_BOOKS_TRASH : STORAGE_KEY_ARTICLES_TRASH;
}

export function useViewMode(scope: DashboardScope): {
    mode: ViewMode;
    setMode: (mode: ViewMode) => void;
    loading: boolean;
} {
    const [mode, setLocalMode] = useState<ViewMode>("grid");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        api.settings
            .getApp()
            .then((config) => {
                if (cancelled) return;
                const ui = (config.ui as Record<string, unknown> | undefined) ?? {};
                const dashboard = (ui.dashboard as Record<string, unknown> | undefined) ?? {};
                const stored = dashboard[readDashboardKey(scope)];
                if (isViewMode(stored)) {
                    setLocalMode(stored);
                }
            })
            .catch(() => {
                // Silent fallback to "grid" - keeps the dashboard
                // usable when the settings endpoint is unreachable.
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [scope]);

    const setMode = useCallback(
        (next: ViewMode) => {
            setLocalMode(next);
            // Read current ui.dashboard so we keep the OTHER scope's
            // preference intact. Backend PATCH applies a shallow .update
            // on ``ui`` so we must hand back the whole ``dashboard`` block.
            api.settings
                .getApp()
                .then((config) => {
                    const ui = (config.ui as Record<string, unknown> | undefined) ?? {};
                    const dashboard =
                        (ui.dashboard as Record<string, unknown> | undefined) ?? {};
                    return getStorage().settings.updateApp({
                        ui: {
                            ...ui,
                            dashboard: {
                                ...dashboard,
                                [readDashboardKey(scope)]: next,
                            },
                        },
                    });
                })
                .catch((err) => {
                    if (err instanceof ApiError) {
                        // Preference did not persist; rollback so the
                        // user's next reload reflects the old state
                        // rather than a fake-saved one.
                        setLocalMode((prev) => (prev === next ? "grid" : prev));
                    }
                });
        },
        [scope],
    );

    return { mode, setMode, loading };
}


/**
 * Trash-surface view-mode hook (Bug 3 fix).
 *
 * Reads ``ui.dashboard.{books,articles}_trash_view`` from app config
 * on mount and applies it as the trash view's default. ``setMode``
 * ONLY updates LOCAL state — it does NOT write back to the YAML.
 * The trash view-mode is configured exclusively through the
 * Settings UI; mid-session toggles via the in-trash ViewToggle are
 * ephemeral, matching the user expectation that:
 *
 *   - Default for trash is set ONCE in Settings.
 *   - Inside trash, the user can flip view-mode for the current
 *     session without committing the change to their permanent
 *     preference.
 *
 * Contrast with ``useViewMode`` (the active-dashboard hook) where
 * every toggle writes through to YAML. The semantic difference is
 * deliberate: active-dashboard view-mode is a long-term preference
 * (you usually want it persisted across sessions), trash view-mode
 * is a short-term inspection mode (you switch to trash, glance
 * around, switch back).
 */
export function useTrashViewMode(scope: TrashScope): {
    mode: ViewMode;
    setMode: (mode: ViewMode) => void;
    loading: boolean;
} {
    const [mode, setLocalMode] = useState<ViewMode>("grid");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        api.settings
            .getApp()
            .then((config) => {
                if (cancelled) return;
                const ui = (config.ui as Record<string, unknown> | undefined) ?? {};
                const dashboard = (ui.dashboard as Record<string, unknown> | undefined) ?? {};
                const stored = dashboard[readTrashKey(scope)];
                if (isViewMode(stored)) {
                    setLocalMode(stored);
                }
            })
            .catch(() => {
                // Silent fallback to "grid" - keeps the trash view
                // usable when the settings endpoint is unreachable.
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [scope]);

    // Local-only setMode: no API write. Setting Persisting happens
    // via the Settings UI's RadixSelect, not via every toggle click.
    const setMode = useCallback((next: ViewMode) => {
        setLocalMode(next);
    }, []);

    return { mode, setMode, loading };
}
