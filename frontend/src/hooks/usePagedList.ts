/**
 * DASHBOARD-PAGINATION-LOAD-MORE-01 C3: "Load more" pagination hook.
 *
 * Manages two pieces of state for a paginated list view:
 *
 *   - ``pageSize`` (10 / 25 / 50 / 100): persistent, server-backed
 *     via ``ui.dashboard.{books,articles}_page_size``. Loaded on
 *     mount; written back on change. Reset to a fallback of 25 when
 *     the server has no preference set.
 *   - ``limit``: ephemeral, local-only. Starts at ``pageSize``,
 *     grows by ``pageSize`` on ``loadMore()``, snaps back to
 *     ``pageSize`` on ``reset()`` or ``setPageSize()``.
 *
 * The consumer decides whether to use ``limit`` to slice a
 * client-filtered list for render (Dashboard / ArticleList: filters
 * live client-side, so slicing happens after filtering) or to pass
 * to a server-paginated endpoint (the CommentsAdmin pattern — RCU
 * candidate when the next consumer migrates).
 *
 * Hook is scope-aware so a single Dashboard render can hold two
 * independent instances (one for books, one for articles) without
 * the page sizes colliding.
 */
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { getStorage } from "../storage";

export type PageSize = 10 | 25 | 50 | 100;

export const ALLOWED_PAGE_SIZES: readonly PageSize[] = [10, 25, 50, 100];

export const DEFAULT_PAGE_SIZE: PageSize = 25;

export type PagedListScope = "books" | "articles";

function settingsKey(scope: PagedListScope): string {
    return scope === "books" ? "books_page_size" : "articles_page_size";
}

function isPageSize(value: unknown): value is PageSize {
    return value === 10 || value === 25 || value === 50 || value === 100;
}

export interface UsePagedListResult {
    /** Current page size; controls the increment on loadMore + the
     *  reset target on filter change. */
    pageSize: PageSize;
    /** Display cap. Consumers slice their list to this many rows. */
    limit: number;
    /** True while the initial settings fetch is in flight. */
    loading: boolean;
    /** Change the page size. Persists to ``getStorage().settings.updateApp``
     *  in the background and snaps ``limit`` back to the new size. */
    setPageSize: (next: PageSize) => void;
    /** Grow ``limit`` by ``pageSize``. */
    loadMore: () => void;
    /** Snap ``limit`` back to ``pageSize``. Wire this into a
     *  ``useEffect`` that fires on filter-state changes. */
    reset: () => void;
}

export function usePagedList(scope: PagedListScope): UsePagedListResult {
    const [pageSize, setPageSizeLocal] = useState<PageSize>(DEFAULT_PAGE_SIZE);
    const [limit, setLimit] = useState<number>(DEFAULT_PAGE_SIZE);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        let cancelled = false;
        api.settings
            .getApp()
            .then((config) => {
                if (cancelled) return;
                const ui = (config.ui as Record<string, unknown> | undefined) ?? {};
                const dashboard =
                    (ui.dashboard as Record<string, unknown> | undefined) ?? {};
                const stored = dashboard[settingsKey(scope)];
                if (isPageSize(stored)) {
                    setPageSizeLocal(stored);
                    setLimit(stored);
                }
            })
            .catch(() => {
                // Silent fallback to DEFAULT_PAGE_SIZE so the
                // dashboard stays usable when settings is unreachable.
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [scope]);

    const setPageSize = useCallback(
        (next: PageSize) => {
            setPageSizeLocal(next);
            // Always snap limit back to the new size — keeps the
            // "page-size change = fresh first page" mental model.
            setLimit(next);
            // Read-merge-write so a sibling key (the other scope's
            // page size, books_view, etc.) is not clobbered. Mirrors
            // the useViewMode write-through pattern in this same
            // module family.
            api.settings
                .getApp()
                .then((config) => {
                    const ui =
                        (config.ui as Record<string, unknown> | undefined) ?? {};
                    const dashboard =
                        (ui.dashboard as Record<string, unknown> | undefined) ?? {};
                    return getStorage().settings.updateApp({
                        ui: {
                            ...ui,
                            dashboard: {
                                ...dashboard,
                                [settingsKey(scope)]: next,
                            },
                        },
                    });
                })
                .catch((err) => {
                    // ApiError means the persist failed; the local
                    // state stays so the user's current session
                    // honours their pick. Their next reload reverts
                    // to whatever's actually on the server.
                    if (err instanceof ApiError) {
                        // No-op: ephemeral preference is acceptable
                        // here. Future enhancement: surface a toast.
                    }
                });
        },
        [scope],
    );

    const loadMore = useCallback(() => {
        setLimit((prev) => prev + pageSize);
    }, [pageSize]);

    const reset = useCallback(() => {
        setLimit(pageSize);
    }, [pageSize]);

    return { pageSize, limit, loading, setPageSize, loadMore, reset };
}
