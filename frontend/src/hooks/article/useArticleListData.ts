import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { ApiError, Article } from "../../api/client";
import { getStorage } from "../../storage";
import { notify } from "../../utils/platform/notify";

type ConfirmFn = (
    title: string,
    message: string,
    variant?: "default" | "danger" | "success" | "info",
    options?: { confirmLabel?: string },
) => Promise<boolean>;

type Translate = (key: string, fallback: string) => string;

interface SelectionApi {
    remove: (id: string) => void;
}

export interface UseArticleListData {
    articles: Article[];
    setArticles: Dispatch<SetStateAction<Article[]>>;
    trash: Article[];
    setTrash: Dispatch<SetStateAction<Article[]>>;
    loading: boolean;
    setLoading: Dispatch<SetStateAction<boolean>>;
    loadTrash: () => Promise<void>;
    refreshArticles: (showSpinner?: boolean) => Promise<void>;
    handleDelete: (article: Article) => Promise<void>;
    handleDeletePermanentFromList: (article: Article) => Promise<void>;
    handleRestore: (article: Article) => Promise<void>;
    handlePermanentDelete: (article: Article) => Promise<void>;
    handleEmptyTrash: () => Promise<void>;
}

/**
 * Data lifecycle for the article-list page: the active list + trash
 * state, their loaders, the mount + bfcache/visibility refresh effects,
 * and the single-item soft/permanent-delete + restore + empty-trash
 * handlers. Bulk operations stay on the page because they need the
 * filtered display order and the bulk-delete dialog state.
 *
 * @param offline - when true, the backend trash endpoint is skipped.
 * @param selection - bulk-selection api; handlers reconcile removed rows.
 * @param confirm - AppDialog confirm used by the destructive handlers.
 * @param t - i18n translate function.
 */
export function useArticleListData(
    offline: boolean,
    selection: SelectionApi,
    confirm: ConfirmFn,
    t: Translate,
): UseArticleListData {
    const [articles, setArticles] = useState<Article[]>([]);
    const [trash, setTrash] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);

    const loadTrash = async () => {
        if (offline) return;
        try {
            const rows = await getStorage().articles.listTrash();
            setTrash(rows);
        } catch (err) {
            if (err instanceof ApiError) {
                console.error("Failed to load article trash:", err);
            }
        }
    };

    useEffect(() => {
        void loadTrash();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Soft-delete: moves the article to the trash. Mirrors books'
     *  ``handleDelete`` - no confirm dialog, matching the
     *  Dashboard pattern; the Trash panel is the safety net. */
    async function handleDelete(article: Article): Promise<void> {
        try {
            await getStorage().articles.delete(article.id);
            setArticles((prev) => prev.filter((a) => a.id !== article.id));
            // Reconcile bulk-selection state: the row that just
            // disappeared must not stay in the BulkActionBar count.
            selection.remove(article.id);
            void loadTrash();
            notify.info(t("ui.articles.moved_to_trash", "In den Papierkorb verschoben"));
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(t("ui.articles.delete_failed", "Löschen fehlgeschlagen."), err);
            }
        }
    }

    /** Permanent-delete shortcut from the live list (T-10/L-6). Mirrors
     *  Dashboard.handleDeletePermanent: confirm → soft-delete → permanent-
     *  delete from trash → drop from state. The double call is intentional;
     *  it matches the books behaviour and keeps the trash auto-purge code
     *  path (cascade + on-disk asset cleanup) as the single source of
     *  truth for hard delete. */
    async function handleDeletePermanentFromList(article: Article): Promise<void> {
        const ok = await confirm(
            t("ui.articles.delete_permanent_title", "Endgültig löschen"),
            t(
                "ui.articles.delete_permanent_warning",
                "Artikel endgültig löschen? Alle Publikationen und hochgeladenen Bilder gehen verloren. Dies kann nicht rückgängig gemacht werden.",
            ),
            "danger",
        );
        if (!ok) return;
        try {
            await getStorage().articles.delete(article.id);
            try {
                await getStorage().articles.permanentDelete(article.id);
            } catch {
                /* already in trash or already gone */
            }
            setArticles((prev) => prev.filter((a) => a.id !== article.id));
            // Reconcile bulk-selection state: the row that just
            // disappeared must not stay in the BulkActionBar count.
            selection.remove(article.id);
            void loadTrash();
            notify.success(t("ui.articles.deleted_permanently", "Artikel endgültig gelöscht."));
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(t("ui.articles.delete_failed", "Löschen fehlgeschlagen."), err);
            }
        }
    }

    async function handleRestore(article: Article): Promise<void> {
        // Optimistic update: drop the trash row immediately so the
        // user sees the restore land before the network roundtrip
        // completes. The POST returns the restored entity which we
        // splice into the live list without a separate /articles
        // refetch — chained roundtrips inside one click handler
        // were the source of the 419ms perception-lag the
        // 2026-05-14 user report surfaced.
        setTrash((prev) => prev.filter((a) => a.id !== article.id));
        try {
            const restored = await getStorage().articles.restore(article.id);
            setArticles((prev) => {
                // Defensive: if the article was already in articles
                // (extremely rare race), do not duplicate it.
                if (prev.some((a) => a.id === restored.id)) return prev;
                return [restored, ...prev];
            });
            notify.success(t("ui.articles.restored", "Artikel wiederhergestellt."));
        } catch (err) {
            // Revert the optimistic trash removal so the user
            // does not lose visibility of the row that failed to
            // restore.
            setTrash((prev) => {
                if (prev.some((a) => a.id === article.id)) return prev;
                return [article, ...prev];
            });
            notify.error(t("ui.articles.restore_failed", "Wiederherstellen fehlgeschlagen."), err);
        }
    }

    async function handlePermanentDelete(article: Article): Promise<void> {
        const ok = await confirm(
            t("ui.articles.delete_permanent_title", "Endgültig löschen"),
            t(
                "ui.articles.delete_permanent_warning",
                "Artikel endgültig löschen? Alle Publikationen und hochgeladenen Bilder gehen verloren. Dies kann nicht rückgängig gemacht werden.",
            ),
            "danger",
        );
        if (!ok) return;
        try {
            await getStorage().articles.permanentDelete(article.id);
            setTrash((prev) => prev.filter((a) => a.id !== article.id));
            // Defensive: if the row was soft-deleted in another tab and
            // its id was still in the live-list selection here, drop it
            // now so the BulkActionBar count never references an
            // article that no longer exists anywhere.
            selection.remove(article.id);
            notify.success(t("ui.articles.deleted_permanently", "Artikel endgültig gelöscht."));
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(t("ui.articles.delete_failed", "Löschen fehlgeschlagen."), err);
            }
        }
    }

    async function handleEmptyTrash(): Promise<void> {
        const ok = await confirm(
            t("ui.articles.empty_trash_title", "Papierkorb leeren"),
            t(
                "ui.articles.empty_trash_warning",
                "Alle Artikel im Papierkorb werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
            ),
            "danger",
        );
        if (!ok) return;
        try {
            await getStorage().articles.emptyTrash();
            setTrash([]);
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(t("ui.articles.delete_failed", "Löschen fehlgeschlagen."), err);
            }
        }
    }

    // Centralized refresh used by mount + visibility/pageshow listeners.
    // Wrapping it in useCallback would change identity per render only
    // if dependencies change; here the deps are state setters
    // (setArticles, setLoading) which are stable, so the function is
    // effectively stable.
    const refreshArticles = (showSpinner = false) => {
        if (showSpinner) setLoading(true);
        return getStorage()
            .articles.list()
            .then((rows) => {
                setArticles(rows);
            })
            .catch((err) => {
                if (err instanceof ApiError) {
                    notify.error("Konnte Artikelliste nicht laden.", err);
                }
            })
            .finally(() => {
                if (showSpinner) setLoading(false);
            });
    };

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        // Server-side status filter retired - useArticleFilters now
        // owns every facet (status / topic / language / search / sort)
        // client-side, matching the books pattern via useBookFilters.
        getStorage()
            .articles.list()
            .then((rows) => {
                if (!cancelled) setArticles(rows);
            })
            .catch((err) => {
                if (err instanceof ApiError) {
                    notify.error("Konnte Artikelliste nicht laden.", err);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Re-fetch when the page becomes visible again. Catches the
    // browser bfcache restore path (back-button after import) and
    // the tab-focus case so a freshly-imported article never stays
    // hidden until the user hits F5.
    useEffect(() => {
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) {
                void refreshArticles();
                void loadTrash();
            }
        };
        const onVisibility = () => {
            if (document.visibilityState === "visible") {
                void refreshArticles();
                void loadTrash();
            }
        };
        window.addEventListener("pageshow", onPageShow);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("pageshow", onPageShow);
            document.removeEventListener("visibilitychange", onVisibility);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        articles,
        setArticles,
        trash,
        setTrash,
        loading,
        setLoading,
        loadTrash,
        refreshArticles,
        handleDelete,
        handleDeletePermanentFromList,
        handleRestore,
        handlePermanentDelete,
        handleEmptyTrash,
    };
}
