/**
 * AR-01 Phase 1 article list.
 *
 * Standalone page at ``/articles`` that lists every article. Filter
 * by status (all / draft / published / archived). Click an article to
 * open the editor. "New Article" creates a draft via API and
 * redirects to the editor.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    BookOpen,
    ChevronDown,
    ChevronLeft,
    Download,
    FileText,
    HelpCircle,
    Menu,
    MoreVertical,
    Plus,
    Rocket,
    RotateCcw,
    Settings,
    Trash,
    Trash2,
    Upload,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { api, ApiError, Article, ArticleStatus, ArticleType, BookDetail } from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { useArticleTypes } from "../hooks/useArticleTypes";
import { ArticleTypeIcon } from "../utils/articleTypeIcon";
import SplitButton, { type SplitButtonDropdownItem } from "../components/SplitButton";
import { notify } from "../utils/notify";
import ViewToggle from "../components/ViewToggle";
import ArticleCard from "../components/articles/ArticleCard";
import ArticleTypeBadge from "../components/articles/ArticleTypeBadge";
import CommentsCountBadge from "../components/articles/CommentsCountBadge";
import ArticleBulkActionBar, {
    type BulkExportFormat,
    type BulkExportMode,
    BULK_LIMIT_HARD,
} from "../components/articles/ArticleBulkActionBar";
import { useArticleSelection } from "../components/articles/useArticleSelection";
import ConvertToBookWizard from "../components/articles/ConvertToBookWizard";
import TypeToConfirmDialog from "../components/dialogs/TypeToConfirmDialog";
import { formatActiveArticleFilters } from "../utils/formatActiveFilters";
import { formatLocaleDate } from "../utils/formatDate";
import CoverPlaceholder from "../components/CoverPlaceholder";
import FullscreenButton from "../components/FullscreenButton";
import ThemeToggle from "../components/ThemeToggle";
import TrashCard from "../components/trash/TrashCard";
import NewFromTemplateButton from "../components/NewFromTemplateButton";
import BulkTemplateImportDialog from "../components/BulkTemplateImportDialog";
import FieldClassDialog, {type FieldClassDialogResult} from "../components/FieldClassDialog";
import BulkAiFillConfirmDialog from "../components/BulkAiFillConfirmDialog";
import layout from "./ArticleList.module.css";
import { useTrashViewMode, useViewMode } from "../hooks/useViewMode";
import { usePagedList } from "../hooks/usePagedList";
import PageSizeSelector from "../components/PageSizeSelector";
import { useArticleFilters } from "../hooks/useArticleFilters";
import { useDialog } from "../components/AppDialog";
import { useHelp } from "../contexts/HelpContext";
import { Search } from "lucide-react";
import { ImportWizardModal } from "../components/import-wizard";
import { ArticleFilterBar } from "../components/articles/ArticleFilterBar";
import { EmptyState } from "../components/EmptyState";

export default function ArticleList() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const articleTypesSnapshot = useArticleTypes();
    const [articles, setArticles] = useState<Article[]>([]);
    const [trash, setTrash] = useState<Article[]>([]);
    const [showTrash, setShowTrash] = useState(false);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const { mode: viewMode, setMode: setViewMode } = useViewMode("articles");
    // Trash surface keeps an INDEPENDENT view-mode read from a separate
    // YAML key (``ui.dashboard.articles_trash_view``). In-trash toggles
    // are session-local (no YAML write); persistence is only via the
    // Settings UI. See ``useTrashViewMode`` for the rationale.
    const { mode: trashViewMode, setMode: setTrashViewMode } =
        useTrashViewMode("articles");
    const { confirm } = useDialog();
    const { openHelp } = useHelp();
    const filters = useArticleFilters(articles, t);
    const selection = useArticleSelection();
    // DASHBOARD-PAGINATION-LOAD-MORE-01 C6: paged display of the
    // active (non-trash) article list. Slices ``filters.filteredArticles``
    // to ``paged.limit`` for render; "Load more" grows the limit;
    // PageSizeSelector persists the user's preference. Filter changes
    // reset the limit (effect below).
    const paged = usePagedList("articles");
    const [importWizardOpen, setImportWizardOpen] = useState(false);

    /** Article-to-book conversion wizard. Snapshot the user's selected
     *  Article[] when opening so the wizard's working copy is stable
     *  even if the parent selection changes (it shouldn't, the page
     *  freezes interactions behind the dialog, but the snapshot
     *  decouples the two state machines). */
    const [convertToBookArticles, setConvertToBookArticles] = useState<
        Article[] | null
    >(null);

    const handleOpenConvertToBook = () => {
        const ids = new Set(selection.selectedIds);
        const snapshot = filters.filteredArticles.filter((a) => ids.has(a.id));
        if (snapshot.length === 0) return;
        setConvertToBookArticles(snapshot);
    };

    const handleBookCreated = (book: BookDetail) => {
        // Page-level cleanup after a successful conversion. Runs
        // unconditionally so the dashboard is in a clean state
        // regardless of whether the user follows the toast CTA.
        // Navigation lives on ``handleViewBook`` (toast action),
        // not here.
        void book;
        selection.clear();
        setConvertToBookArticles(null);
    };

    const handleViewBook = (book: BookDetail) => {
        navigate(`/book/${book.id}`);
    };

    /** Bulk export. Reads the current filtered list in display
     *  order, restricts to the selected IDs, then POSTs them to the
     *  backend bulk endpoint. The backend preserves the input order
     *  in the response (combined sections / ZIP iteration), so the
     *  user sees exactly what they selected, in the order they saw
     *  it on screen. Toasts on failure with the server message
     *  (which includes the offending article title for fail-loud
     *  pandoc errors). */
    const handleBulkExport = async (format: BulkExportFormat, mode: BulkExportMode) => {
        const ordered = filters.filteredArticles
            .map((a) => a.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length === 0) return;
        if (ordered.length > BULK_LIMIT_HARD) return; // bar already disables, double-guard.
        try {
            const { blob, filename } = await api.articles.bulkExport(ordered, format, mode);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            selection.clear();
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t("ui.articles.bulk.export_failed", "Bulk export failed");
            notify.error(message, err);
        }
    };

    // UNIVERSAL-AI-TEMPLATE-02: bulk AI-template ZIP export.
    // Cap of 50 enforced by the bar's disabled state; the
    // server-side 422 surfaces via toast if the gate is
    // somehow bypassed.
    const handleBulkArticleAiTemplateExport = async () => {
        const ordered = filters.filteredArticles
            .map((a) => a.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length === 0) return;
        try {
            const { blob, filename } = await api.articles.bulkAiTemplate.export(ordered);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            notify.success(
                t(
                    "ui.ai_template.bulk.export_success",
                    "{count} template(s) exported as {filename}",
                )
                    .replace("{count}", String(ordered.length))
                    .replace("{filename}", filename),
            );
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.ai_template.bulk.export_failed",
                          "Bulk template export failed",
                      );
            notify.error(message, err);
        }
    };

    const [bulkArticleAiImportOpen, setBulkArticleAiImportOpen] = useState(false);

    // UNIVERSAL-AI-TEMPLATE-02 commit 8: bulk AI-fill flow state.
    const [bulkArticleAiFillFieldsOpen, setBulkArticleAiFillFieldsOpen] = useState(false);
    const [bulkArticleAiFillConfirm, setBulkArticleAiFillConfirm] = useState<{
        ids: string[];
        fieldClasses: string[];
        force: boolean;
        inlineImageCount?: number | null;
    } | null>(null);

    // Bulk-delete state. The permanent-path dialog opens with a
    // captured count + ID list so the user typing happens against a
    // snapshot, not the live selection (which they can't change while
    // the modal is open, but pinning is still cleaner).
    const [bulkDeleteDialog, setBulkDeleteDialog] = useState<{
        ids: string[];
        count: number;
    } | null>(null);

    const handleBulkDelete = async (permanent: false) => {
        const ordered = filters.filteredArticles
            .map((a) => a.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length < 2 || ordered.length > BULK_LIMIT_HARD) return;
        try {
            const result = await api.articles.bulkDelete(ordered, permanent);
            // Optimistic refresh: drop the deleted IDs from the
            // visible list right away rather than re-fetching the
            // whole collection.
            setArticles((prev) =>
                prev.filter((a) => !ordered.includes(a.id) || result.failed.some((f) => f.id === a.id)),
            );
            void loadTrash();
            selection.clear();
            const message = t(
                "ui.bulk_delete.toast_trashed",
                "{count} in den Papierkorb verschoben",
            ).replace("{count}", String(result.deleted_count));
            // Undo restores every successfully-trashed row via the
            // bulk-restore endpoint (BULK-RESTORE-PARITY-01). One
            // round-trip vs Promise.all(N) — serializes the work
            // into one DB transaction and surfaces per-id failures
            // via the response shape instead of swallowing them in
            // Promise.all's "first rejection wins" semantics.
            notify.bulkAction(
                message,
                async () => {
                    try {
                        const undone = ordered.filter(
                            (id) => !result.skipped_already_trashed.includes(id)
                                && !result.failed.some((f) => f.id === id),
                        );
                        if (undone.length === 0) {
                            notify.info(
                                t("ui.bulk_delete.toast_undone", "Wiederhergestellt"),
                            );
                            return;
                        }
                        const undoResult = await api.articles.bulkRestore(undone);
                        const fresh = await api.articles.list();
                        setArticles(fresh);
                        void loadTrash();
                        if (undoResult.failed.length > 0) {
                            notify.warning(
                                t(
                                    "ui.bulk_delete.toast_undone_partial",
                                    "{restored} wiederhergestellt, {failed} fehlgeschlagen",
                                )
                                    .replace("{restored}", String(undoResult.restored_count))
                                    .replace("{failed}", String(undoResult.failed.length)),
                            );
                        } else {
                            notify.info(
                                t("ui.bulk_delete.toast_undone", "Wiederhergestellt"),
                            );
                        }
                    } catch (undoErr) {
                        notify.error(
                            t("ui.bulk_delete.toast_undo_failed", "Wiederherstellen fehlgeschlagen"),
                            undoErr,
                        );
                    }
                },
                t("ui.bulk_delete.undo_label", "Rückgängig"),
            );
        } catch (err) {
            notify.error(
                t("ui.bulk_delete.toast_failed", "Bulk-Löschen fehlgeschlagen"),
                err,
            );
        }
    };

    const handleBulkDeletePermanentRequest = () => {
        const ordered = filters.filteredArticles
            .map((a) => a.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length < 2 || ordered.length > BULK_LIMIT_HARD) return;
        setBulkDeleteDialog({ ids: ordered, count: ordered.length });
    };

    const handleBulkDeletePermanentConfirmed = async () => {
        if (!bulkDeleteDialog) return;
        const { ids } = bulkDeleteDialog;
        setBulkDeleteDialog(null);
        try {
            const result = await api.articles.bulkDelete(ids, true);
            setArticles((prev) => prev.filter((a) => !ids.includes(a.id)));
            selection.clear();
            notify.success(
                t(
                    "ui.bulk_delete.toast_deleted_permanent",
                    "{count} endgültig gelöscht",
                ).replace("{count}", String(result.deleted_count)),
            );
        } catch (err) {
            notify.error(
                t("ui.bulk_delete.toast_failed", "Bulk-Löschen fehlgeschlagen"),
                err,
            );
        }
    };

    /** Filter changes invalidate selection because a previously-
     *  selected article may now be hidden by the new filter; keeping
     *  it selected is confusing. Clear whenever any filter facet
     *  changes. ``selection.clear`` is wrapped in ``useCallback`` so
     *  its identity is stable across renders; depending on the
     *  callback rather than the whole ``selection`` object avoids
     *  an infinite-render loop. */
    const clearSelection = selection.clear;
    const resetPagination = paged.reset;
    useEffect(() => {
        clearSelection();
        // C6: snap display limit back to PAGE_SIZE on filter change
        // so the user always sees the first page of the new filter
        // result, not a mid-page slice carried over.
        resetPagination();
    }, [
        filters.searchQuery,
        filters.topic,
        filters.language,
        filters.status,
        filters.series,
        filters.tag,
        clearSelection,
        resetPagination,
    ]);

    /** Project-wide backup export. Same handler as Dashboard.tsx
     *  surfaces; the .bgb is project-scoped (currently books-only,
     *  articles join when the backup pipeline supports them - tracked
     *  separately). Articles dashboard exposes the action so users
     *  do not have to navigate to the books dashboard to trigger it. */
    const handleBackupExport = () => {
        window.open(api.backup.exportUrl(), "_blank");
    };

    const loadTrash = async () => {
        try {
            const rows = await api.articles.listTrash();
            setTrash(rows);
        } catch (err) {
            if (err instanceof ApiError) {
                console.error("Failed to load article trash:", err);
            }
        }
    };

    useEffect(() => {
        void loadTrash();
    }, []);

    /** Soft-delete: moves the article to the trash. Mirrors books'
     *  ``handleDelete`` - no confirm dialog, matching the
     *  Dashboard pattern; the Trash panel is the safety net. */
    async function handleDelete(article: Article): Promise<void> {
        try {
            await api.articles.delete(article.id);
            setArticles((prev) => prev.filter((a) => a.id !== article.id));
            // Reconcile bulk-selection state: the row that just
            // disappeared must not stay in the BulkActionBar count.
            selection.remove(article.id);
            void loadTrash();
            notify.info(
                t("ui.articles.moved_to_trash", "In den Papierkorb verschoben"),
            );
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t("ui.articles.delete_failed", "Löschen fehlgeschlagen."),
                    err,
                );
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
            await api.articles.delete(article.id);
            try {
                await api.articles.permanentDelete(article.id);
            } catch {
                /* already in trash or already gone */
            }
            setArticles((prev) => prev.filter((a) => a.id !== article.id));
            // Reconcile bulk-selection state: the row that just
            // disappeared must not stay in the BulkActionBar count.
            selection.remove(article.id);
            void loadTrash();
            notify.success(
                t("ui.articles.deleted_permanently", "Artikel endgültig gelöscht."),
            );
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t("ui.articles.delete_failed", "Löschen fehlgeschlagen."),
                    err,
                );
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
            const restored = await api.articles.restore(article.id);
            setArticles((prev) => {
                // Defensive: if the article was already in articles
                // (extremely rare race), do not duplicate it.
                if (prev.some((a) => a.id === restored.id)) return prev;
                return [restored, ...prev];
            });
            notify.success(
                t("ui.articles.restored", "Artikel wiederhergestellt."),
            );
        } catch (err) {
            // Revert the optimistic trash removal so the user
            // does not lose visibility of the row that failed to
            // restore.
            setTrash((prev) => {
                if (prev.some((a) => a.id === article.id)) return prev;
                return [article, ...prev];
            });
            notify.error(
                t("ui.articles.restore_failed", "Wiederherstellen fehlgeschlagen."),
                err,
            );
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
            await api.articles.permanentDelete(article.id);
            setTrash((prev) => prev.filter((a) => a.id !== article.id));
            // Defensive: if the row was soft-deleted in another tab and
            // its id was still in the live-list selection here, drop it
            // now so the BulkActionBar count never references an
            // article that no longer exists anywhere.
            selection.remove(article.id);
            notify.success(
                t("ui.articles.deleted_permanently", "Artikel endgültig gelöscht."),
            );
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t("ui.articles.delete_failed", "Löschen fehlgeschlagen."),
                    err,
                );
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
            await api.articles.emptyTrash();
            setTrash([]);
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t("ui.articles.delete_failed", "Löschen fehlgeschlagen."),
                    err,
                );
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
        return api.articles
            .list()
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
        api.articles
            .list()
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

    async function handleCreate(articleType?: ArticleType): Promise<void> {
        setCreating(true);
        try {
            // Default author from app settings - mirrors CreateBookModal.
            // Failure is silent: blank-author article is fine, the user
            // can fill it in the editor sidebar.
            let defaultAuthor: string | null = null;
            try {
                const config = await api.settings.getApp();
                const authorConfig = (config.author || {}) as Record<
                    string,
                    unknown
                >;
                const realName = (authorConfig.name as string) || "";
                if (realName) defaultAuthor = realName;
            } catch {
                // ignore; create with empty author
            }
            // ARTICLE-TYPES-SSOT-01 C5: optional content_type wired
            // from the split-button selection. When omitted, the
            // backend's column default ("blogpost") applies.
            const fresh = await api.articles.create({
                title: t("ui.articles.default_title", "Neuer Artikel"),
                language: "de",
                author: defaultAuthor,
                ...(articleType ? {content_type: articleType} : {}),
            });
            navigate(`/articles/${fresh.id}`);
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t(
                        "ui.articles.create_error",
                        "Konnte Artikel nicht erstellen.",
                    ),
                    err,
                );
            }
        } finally {
            setCreating(false);
        }
    }

    return (
        <div data-testid="article-list-page" className={layout.page}>
            <header className={layout.appHeader}>
                <div className={layout.appHeaderInner}>
                    <div
                        className={layout.logo}
                        onClick={() => navigate("/")}
                        role="button"
                        title={t("ui.articles.back_to_dashboard_tooltip", "Zum Dashboard")}
                        data-testid="article-list-dashboard"
                    >
                        <BookOpen size={28} strokeWidth={1.5} />
                        <h1 className={layout.logoText}>Bibliogon</h1>
                    </div>
                    <div className={layout.headerActions}>
                        {/* ARTICLE-TYPES-SSOT-01 C5 (2026-05-29):
                         *  shared SplitButton primitive (extracted in
                         *  C4) replaces the plain "Neuer Artikel"
                         *  button. Default action creates a blogpost
                         *  (the registry's ``default: true`` type);
                         *  chevron exposes the other 4 types.
                         *  Mirrors the Book Dashboard split-button
                         *  shape exactly. Testid pattern follows the
                         *  ``new-book-menu-item-*`` convention from
                         *  the Book Dashboard side. */}
                        <SplitButton
                            buttonClass="btn btn-primary"
                            variant="primary"
                            disabled={creating}
                            primaryContent={
                                <>
                                    <Plus size={16} />
                                    <span className="hide-mobile">
                                        {t("ui.articles.new", "Neuer Artikel")}
                                    </span>
                                </>
                            }
                            onPrimaryClick={() => void handleCreate()}
                            chevronTooltip={t(
                                "ui.articles.new_more_tooltip",
                                "Weitere Artikel-Arten",
                            )}
                            dropdownItems={articleTypesSnapshot.ordered
                                .filter(
                                    (at) =>
                                        at.id !== articleTypesSnapshot.defaultId,
                                )
                                .map(
                                    (at): SplitButtonDropdownItem => ({
                                        id: at.id,
                                        content: (
                                            <>
                                                <ArticleTypeIcon
                                                    iconName={at.icon}
                                                    size={14}
                                                />
                                                <span
                                                    style={{ marginLeft: 6 }}
                                                >
                                                    {t(at.label_key, at.id)}
                                                </span>
                                            </>
                                        ),
                                        onSelect: () =>
                                            void handleCreate(
                                                at.id as ArticleType,
                                            ),
                                    }),
                                )}
                            groupTestId="new-article-group"
                            primaryTestId="article-list-new"
                            chevronTestId="new-article-chevron"
                            itemTestIdPrefix="new-article-menu-item"
                        />
                        <NewFromTemplateButton
                            kind="article"
                            defaultLanguage="de"
                            triggerClassName="btn btn-secondary btn-sm hide-mobile"
                            triggerTestId="article-list-new-from-template"
                            onCreated={(created) => navigate(`/articles/${created.id}`)}
                        />
                        {/* Symmetric cross-nav to Books dashboard.
                            Mirrors the ``articles-nav-btn`` button in
                            Dashboard.tsx (text-only, hide-mobile,
                            secondary). */}
                        <button
                            className="btn btn-secondary btn-sm hide-mobile"
                            data-testid="books-nav-btn"
                            onClick={() => navigate("/")}
                            title={t("ui.dashboard.books_nav_tooltip", "Bücher verwalten")}
                        >
                            {t("ui.dashboard.books_nav", "Bücher")}
                        </button>

                        {/* Desktop chrome: every icon button + ThemeToggle.
                            Hidden under 768px; the hamburger menu below
                            takes over on mobile. Structure mirrors
                            Dashboard.tsx so the top-nav layout doesn't
                            jump when switching between the two
                            dashboards. */}
                        <div
                            className="hide-mobile"
                            style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                            {/* Symmetric separator before the action
                                cluster — Book Dashboard ships the same
                                separator at the same position. */}
                            <div className={layout.headerSeparator} />
                            <button
                                className="btn btn-secondary btn-sm"
                                data-testid="article-backup-export-btn"
                                onClick={handleBackupExport}
                                disabled={articles.length === 0}
                                title={t("ui.dashboard.backup", "Backup")}
                            >
                                <Download size={14} /> {t("ui.dashboard.backup", "Backup")}
                            </button>
                            {/* Import-Group split-button: the primary
                                ``Importieren`` button keeps the existing
                                article-import-wizard flow; the chevron
                                exposes the article-specific
                                ``Aus Medium importieren`` flow so it
                                doesn't widen the top nav with a third
                                button. Mirrors the
                                ``newBookGroup`` split-button on
                                Dashboard.tsx. */}
                            <div className={layout.importGroup} data-testid="article-import-group">
                                <button
                                    className="btn btn-secondary btn-sm"
                                    data-testid="article-import-wizard-btn"
                                    onClick={() => setImportWizardOpen(true)}
                                    title={t("ui.dashboard.import", "Importieren")}
                                >
                                    <Upload size={14} /> {t("ui.dashboard.import", "Importieren")}
                                </button>
                                <DropdownMenu.Root>
                                    <DropdownMenu.Trigger asChild>
                                        <button
                                            type="button"
                                            className={`btn btn-secondary btn-sm ${layout.importChevron}`}
                                            data-testid="article-import-chevron"
                                            title={t(
                                                "ui.articles.import_more_tooltip",
                                                "Weitere Import-Quellen",
                                            )}
                                            aria-label={t(
                                                "ui.articles.import_more_tooltip",
                                                "Weitere Import-Quellen",
                                            )}
                                        >
                                            <ChevronDown size={14} />
                                        </button>
                                    </DropdownMenu.Trigger>
                                    <DropdownMenu.Portal>
                                        <DropdownMenu.Content
                                            className="hamburger-menu-content"
                                            align="end"
                                            sideOffset={4}
                                        >
                                            <DropdownMenu.Item
                                                className="hamburger-menu-item"
                                                data-testid="article-medium-import-btn"
                                                onSelect={() => navigate("/articles/import/medium")}
                                            >
                                                <Upload size={14} />
                                                <span style={{ marginLeft: 6 }}>
                                                    {t("ui.medium_import.nav_label", "Aus Medium importieren")}
                                                </span>
                                            </DropdownMenu.Item>
                                        </DropdownMenu.Content>
                                    </DropdownMenu.Portal>
                                </DropdownMenu.Root>
                            </div>
                            <div className={layout.headerSeparator} />
                            <button
                                className="btn-icon"
                                onClick={() => navigate("/get-started")}
                                title={t("ui.get_started.title", "Erste Schritte")}
                                data-testid="article-list-get-started"
                            >
                                <Rocket size={18} />
                            </button>
                            <button
                                className="btn-icon"
                                onClick={() => openHelp()}
                                title={t("ui.dashboard.help", "Hilfe")}
                                data-testid="article-list-help"
                            >
                                <HelpCircle size={18} />
                            </button>
                            <button
                                className="btn-icon"
                                onClick={() => navigate("/settings")}
                                title={t("ui.settings.title", "Einstellungen")}
                                data-testid="article-list-settings"
                            >
                                <Settings size={18} />
                            </button>
                            <button
                                className="btn-icon"
                                data-testid="article-list-trash-toggle"
                                onClick={() => setShowTrash(!showTrash)}
                                style={
                                    showTrash
                                        ? { color: "var(--accent)", position: "relative" }
                                        : { position: "relative" }
                                }
                                title={t("ui.articles.trash_title", "Papierkorb")}
                                aria-pressed={showTrash}
                            >
                                <Trash size={18} />
                                {trash.length > 0 && (
                                    <span
                                        className={layout.trashBadge}
                                        data-testid="article-trash-badge"
                                    >
                                        {trash.length}
                                    </span>
                                )}
                            </button>
                            <FullscreenButton testidPrefix="article-list" />
                            <ThemeToggle />
                        </div>

                        {/* Mobile: hamburger menu collapses every desktop
                            icon button into one Radix DropdownMenu so the
                            Articles header degrades like the Dashboard
                            does at <=768px. */}
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button
                                    className="btn-icon show-mobile-only"
                                    data-testid="article-list-mobile-menu"
                                    aria-label={t("ui.dashboard.menu", "Menü")}
                                >
                                    <Menu size={20} />
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                    className="hamburger-menu-content"
                                    align="end"
                                    sideOffset={4}
                                >
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        data-testid="article-list-mobile-menu-books"
                                        onSelect={() => navigate("/")}
                                    >
                                        <BookOpen size={16} /> {t("ui.dashboard.books_nav", "Bücher")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator className="hamburger-menu-separator" />
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        onSelect={handleBackupExport}
                                    >
                                        <Download size={16} /> {t("ui.dashboard.backup", "Backup")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        onSelect={() => setImportWizardOpen(true)}
                                    >
                                        <Upload size={16} /> {t("ui.dashboard.import", "Importieren")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator className="hamburger-menu-separator" />
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        onSelect={() => setShowTrash(!showTrash)}
                                    >
                                        <Trash size={16} /> {t("ui.articles.trash_title", "Papierkorb")}
                                        {trash.length > 0 ? ` (${trash.length})` : ""}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator className="hamburger-menu-separator" />
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        onSelect={() => navigate("/get-started")}
                                    >
                                        <Rocket size={16} /> {t("ui.get_started.title", "Erste Schritte")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        onSelect={() => openHelp()}
                                    >
                                        <HelpCircle size={16} /> {t("ui.dashboard.help", "Hilfe")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        onSelect={() => navigate("/settings")}
                                    >
                                        <Settings size={16} /> {t("ui.settings.title", "Einstellungen")}
                                    </DropdownMenu.Item>
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                    </div>
                </div>
            </header>
            <main id="main-content" className={layout.main}>
            {/* Page title row mirrors the books-dashboard ``mainHeader``
                shape: heading + count + ViewToggle inline. Hidden in
                trash mode; TrashPanel renders its own header that
                matches the books-trash chrome (chevron + icon + title
                + count + empty-trash + ViewToggle). */}
            {!showTrash && (
                <div className={layout.mainHeader}>
                    <h2 className={layout.heading}>
                        <FileText size={18} style={{ verticalAlign: -3, marginRight: 8 }} />
                        {t("ui.articles.list_heading", "Artikel")}
                    </h2>
                    <span className={layout.articleCount}>
                        {articles.length}{" "}
                        {articles.length === 1
                            ? t("ui.articles.count_singular", "Artikel")
                            : t("ui.articles.count_plural", "Artikel")}
                    </span>
                    <ViewToggle mode={viewMode} onChange={setViewMode} />
                </div>
            )}

            {showTrash ? (
                <TrashPanel
                    trash={trash}
                    viewMode={trashViewMode}
                    setViewMode={setTrashViewMode}
                    onBack={() => setShowTrash(false)}
                    onRestore={(a) => void handleRestore(a)}
                    onPermanentDelete={(a) => void handlePermanentDelete(a)}
                    onEmptyTrash={() => void handleEmptyTrash()}
                />
            ) : null}

            {!showTrash ? <ArticleFilterBar filters={filters} /> : null}
            {!showTrash && selection.count > 0 ? (
                <ArticleBulkActionBar
                    count={selection.count}
                    onExport={(fmt, mode) => void handleBulkExport(fmt, mode)}
                    onBulkAiTemplateExport={() => void handleBulkArticleAiTemplateExport()}
                    onBulkAiTemplateImport={() => setBulkArticleAiImportOpen(true)}
                    onBulkAiFill={() => setBulkArticleAiFillFieldsOpen(true)}
                    onBulkDelete={() => void handleBulkDelete(false)}
                    onBulkDeletePermanent={handleBulkDeletePermanentRequest}
                    onConvertToBook={handleOpenConvertToBook}
                    onClear={selection.clear}
                    t={t}
                />
            ) : null}
            {!showTrash && filters.filteredArticles.length > 0 ? (
                <div className={layout.bulkSelectAll}>
                    <label>
                        <input
                            type="checkbox"
                            data-testid="article-bulk-select-all"
                            checked={
                                selection.count > 0 &&
                                selection.count === filters.filteredArticles.length
                            }
                            ref={(el) => {
                                if (el)
                                    el.indeterminate =
                                        selection.count > 0 &&
                                        selection.count < filters.filteredArticles.length;
                            }}
                            onChange={(e) => {
                                if (e.target.checked) {
                                    selection.selectAll(
                                        filters.filteredArticles.map((a) => a.id),
                                    );
                                } else {
                                    selection.clear();
                                }
                            }}
                        />
                        {" "}
                        {t("ui.articles.bulk.select_all", "Select all")}
                    </label>
                </div>
            ) : null}

            {showTrash ? null : loading ? (
                <p
                    data-testid="article-list-loading"
                    style={{ padding: 16, color: "var(--text-muted)" }}
                >
                    {t("ui.common.loading", "Laedt...")}
                </p>
            ) : articles.length === 0 ? (
                <ArticleListEmptyState onCreate={() => void handleCreate()} />
            ) : filters.filteredArticles.length === 0 ? (
                <EmptyState
                    testId="article-list-filter-empty"
                    icon={<Search size={32} className="muted" />}
                    body={t(
                        "ui.articles.empty_filtered",
                        "Keine Artikel passen zu den aktuellen Filtern.",
                    )}
                    actions={
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={filters.resetFilters}
                            data-testid="article-list-filter-reset"
                        >
                            {t("ui.articles.reset_filters", "Filter zurücksetzen")}
                        </button>
                    }
                />
            ) : (() => {
                // C6: slice to ``paged.limit`` for render. Selection
                // semantics unchanged — select-all still operates on
                // the full filtered set, not just the visible page.
                const visibleArticles = filters.filteredArticles.slice(
                    0,
                    paged.limit,
                );
                const hasMore =
                    filters.filteredArticles.length > visibleArticles.length;
                return (
                    <>
                        {viewMode === "grid" ? (
                            <div className={layout.grid} data-testid="article-list">
                                {visibleArticles.map((a) => (
                                    <div
                                        key={a.id}
                                        className={`${layout.tileWrapper}${selection.isSelected(a.id) ? ` ${layout.tileSelected}` : ""}`}
                                    >
                                        <input
                                            type="checkbox"
                                            className={layout.tileCheckbox}
                                            data-testid={`article-bulk-check-${a.id}`}
                                            checked={selection.isSelected(a.id)}
                                            onChange={() => selection.toggle(a.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            aria-label={t(
                                                "ui.articles.bulk.select_all",
                                                "Select",
                                            )}
                                        />
                                        <ArticleCard
                                            article={a}
                                            onClick={() => navigate(`/articles/${a.id}`)}
                                            onDelete={() => void handleDelete(a)}
                                            onDeletePermanent={() => void handleDeletePermanentFromList(a)}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <ul className={layout.list} data-testid="article-list">
                                {visibleArticles.map((a) => (
                                    <ArticleRow
                                        key={a.id}
                                        article={a}
                                        onOpen={() => navigate(`/articles/${a.id}`)}
                                        onDelete={() => void handleDelete(a)}
                                        onDeletePermanent={() => void handleDeletePermanentFromList(a)}
                                        isSelected={selection.isSelected(a.id)}
                                        onToggleSelect={() => selection.toggle(a.id)}
                                    />
                                ))}
                            </ul>
                        )}
                        {filters.filteredArticles.length > 0 && (
                            <div
                                data-testid="article-list-pagination"
                                style={{
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    gap: 16,
                                    marginTop: 16,
                                    paddingBottom: 8,
                                    flexWrap: "wrap",
                                }}
                            >
                                {hasMore && (
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        data-testid="article-list-load-more"
                                        onClick={paged.loadMore}
                                    >
                                        {t(
                                            "ui.dashboard.load_more",
                                            "Mehr laden",
                                        )}
                                        {" "}
                                        ({visibleArticles.length} /{" "}
                                        {filters.filteredArticles.length})
                                    </button>
                                )}
                                <PageSizeSelector
                                    value={paged.pageSize}
                                    onChange={paged.setPageSize}
                                    data-testid="article-list-page-size"
                                />
                            </div>
                        )}
                    </>
                );
            })()}
            </main>
            <ImportWizardModal
                open={importWizardOpen}
                onClose={() => setImportWizardOpen(false)}
                onImported={() => {
                    // .bgb imports may carry articles + their trash
                    // siblings (deleted_at preserved). Refresh both
                    // lists so the live grid AND the trash badge
                    // surface freshly-imported rows immediately.
                    void refreshArticles();
                    void loadTrash();
                }}
            />
            {convertToBookArticles && (
                <ConvertToBookWizard
                    open
                    articles={convertToBookArticles}
                    onClose={() => setConvertToBookArticles(null)}
                    onConverted={handleBookCreated}
                    onViewBook={handleViewBook}
                />
            )}
            {bulkDeleteDialog && (
                <TypeToConfirmDialog
                    open
                    count={bulkDeleteDialog.count}
                    filterDescription={formatActiveArticleFilters(filters, t)}
                    itemNoun={t("ui.bulk_delete.items_articles", "Artikel")}
                    onConfirm={() => void handleBulkDeletePermanentConfirmed()}
                    onCancel={() => setBulkDeleteDialog(null)}
                />
            )}
            <BulkTemplateImportDialog
                open={bulkArticleAiImportOpen}
                kind="article"
                onClose={() => setBulkArticleAiImportOpen(false)}
                onApplied={() => {
                    selection.clear();
                    void api.articles
                        .list()
                        .then(setArticles)
                        .catch(() => {});
                }}
            />
            <FieldClassDialog
                open={bulkArticleAiFillFieldsOpen}
                kind="article"
                onClose={() => setBulkArticleAiFillFieldsOpen(false)}
                onSubmit={(req: FieldClassDialogResult) => {
                    const ids = filters.filteredArticles
                        .map((a) => a.id)
                        .filter((id) => selection.isSelected(id));
                    if (ids.length === 0) {
                        setBulkArticleAiFillFieldsOpen(false);
                        return;
                    }
                    setBulkArticleAiFillFieldsOpen(false);
                    setBulkArticleAiFillConfirm({
                        ids,
                        fieldClasses: req.field_classes,
                        force: req.force,
                        inlineImageCount: req.inline_image_count,
                    });
                }}
                title={t("ui.bulk_ai_fill.field_class_dialog_title", "Bulk AI fill: pick field-classes")}
                submitLabel={t("ui.bulk_ai_fill.field_class_dialog_submit", "Continue to estimate")}
            />
            {bulkArticleAiFillConfirm && (
                <BulkAiFillConfirmDialog
                    open
                    onClose={() => setBulkArticleAiFillConfirm(null)}
                    kind="article"
                    ids={bulkArticleAiFillConfirm.ids}
                    fieldClasses={bulkArticleAiFillConfirm.fieldClasses}
                    force={bulkArticleAiFillConfirm.force}
                    inlineImageCount={bulkArticleAiFillConfirm.inlineImageCount}
                />
            )}
        </div>
    );
}

function TrashPanel({
    trash,
    viewMode,
    setViewMode,
    onBack,
    onRestore,
    onPermanentDelete,
    onEmptyTrash,
}: {
    trash: Article[];
    viewMode: "grid" | "list";
    setViewMode: (mode: "grid" | "list") => void;
    onBack: () => void;
    onRestore: (a: Article) => void;
    onPermanentDelete: (a: Article) => void;
    onEmptyTrash: () => void;
}) {
    const { t } = useI18n();

    /** Header chrome shared between empty + populated trash. Mirrors
     *  Dashboard.tsx ``trash-view`` mainHeader: ChevronLeft + Trash2
     *  icon + h2 title + count span + spacer + (optional) empty
     *  action + ViewToggle. */
    const trashHeader = (
        <div className={layout.mainHeader}>
            <button
                type="button"
                className="btn-icon"
                onClick={onBack}
                data-testid="article-trash-back"
                title={t("ui.dashboard.back", "Zurück")}
            >
                <ChevronLeft size={18} />
            </button>
            <Trash2 size={20} className="muted" />
            <h2 className={layout.heading}>
                {t("ui.articles.trash_title", "Papierkorb")}
            </h2>
            <span className={layout.articleCount}>
                {trash.length}{" "}
                {trash.length === 1
                    ? t("ui.articles.count_singular", "Artikel")
                    : t("ui.articles.count_plural", "Artikel")}
            </span>
            <div style={{ flex: 1 }} />
            {trash.length > 0 && (
                <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={onEmptyTrash}
                    data-testid="article-trash-empty-all"
                >
                    <Trash2 size={14} />
                    {t("ui.articles.empty_trash", "Papierkorb leeren")}
                </button>
            )}
            <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
    );

    if (trash.length === 0) {
        return (
            <div data-testid="article-trash-panel" style={{ marginBottom: 16 }}>
                {trashHeader}
                <div
                    data-testid="article-trash-empty"
                    className={layout.empty}
                    style={{ marginBottom: 16 }}
                >
                    <Trash size={28} className="muted" />
                    <p style={{ color: "var(--text-muted)", margin: 0 }}>
                        {t("ui.articles.trash_empty", "Keine gelöschten Artikel.")}
                    </p>
                </div>
            </div>
        );
    }
    return (
        <div data-testid="article-trash-panel" style={{ marginBottom: 16 }}>
            {trashHeader}
            {viewMode === "grid" ? (
                <div className={layout.grid} data-testid="article-trash-grid">
                    {trash.map((a) => (
                        <TrashCard
                            key={a.id}
                            title={a.title}
                            subtitle={a.author}
                            meta={
                                a.deleted_at
                                    ? `${t("ui.articles.trashed_at", "Gelöscht")}: ${new Date(a.deleted_at).toLocaleString()}`
                                    : null
                            }
                            onRestore={() => onRestore(a)}
                            onPermanentDelete={() => onPermanentDelete(a)}
                            restoreLabel={t("ui.articles.restore", "Wiederherstellen")}
                            deletePermanentLabel={t("ui.articles.delete_permanent", "Endgültig löschen")}
                            cardTestId={`article-trash-card-${a.id}`}
                            restoreTestId={`article-trash-restore-${a.id}`}
                            permanentTestId={`article-trash-permanent-${a.id}`}
                        />
                    ))}
                </div>
            ) : (
                <ul className={layout.list} data-testid="article-trash-list">
                    {trash.map((a) => (
                        <li
                            key={a.id}
                            data-testid={`article-trash-row-${a.id}`}
                            className={layout.row}
                            style={{ position: "relative" }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className={layout.rowTitle}>{a.title}</div>
                                <div className={layout.rowMeta}>
                                    {a.deleted_at ? (
                                        <span>
                                            {t("ui.articles.trashed_at", "Gelöscht")}:{" "}
                                            {new Date(a.deleted_at).toLocaleString()}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                onClick={() => onRestore(a)}
                                data-testid={`article-trash-restore-${a.id}`}
                                title={t("ui.articles.restore", "Wiederherstellen")}
                            >
                                <RotateCcw size={14} />
                                {t("ui.articles.restore", "Wiederherstellen")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                onClick={() => onPermanentDelete(a)}
                                data-testid={`article-trash-permanent-${a.id}`}
                                title={t("ui.articles.delete_permanent", "Endgültig löschen")}
                                style={{ color: "var(--danger)" }}
                            >
                                <Trash2 size={14} />
                                {t("ui.articles.delete_permanent", "Endgültig löschen")}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function ArticleListEmptyState({ onCreate }: { onCreate: () => void }) {
    const { t } = useI18n();
    const navigate = useNavigate();
    return (
        <EmptyState
            testId="article-list-empty"
            icon={<FileText size={32} className="muted" />}
            title={t("ui.articles.empty_heading", "Noch keine Artikel")}
            body={t(
                "ui.articles.empty_subtitle",
                "Erstelle deinen ersten Artikel, um lange Beiträge separat von Büchern zu verfassen.",
            )}
            actions={
                <>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={onCreate}
                        data-testid="article-list-empty-cta"
                    >
                        <Plus size={14} />
                        {t("ui.articles.new", "Neuer Artikel")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate("/get-started")}
                        data-testid="article-list-empty-get-started"
                    >
                        <Rocket size={14} />
                        {t("ui.get_started.title", "Erste Schritte")}
                    </button>
                </>
            }
        />
    );
}

function ArticleRow({
    article,
    onOpen,
    onDelete,
    onDeletePermanent,
    isSelected,
    onToggleSelect,
}: {
    article: Article;
    onOpen: () => void;
    onDelete?: () => void;
    onDeletePermanent?: () => void;
    isSelected?: boolean;
    onToggleSelect?: () => void;
}) {
    const { t, lang } = useI18n();
    const [menuOpen, setMenuOpen] = useState(false);
    // Prefer original_published_at (computed server-side as the
    // earliest Publication.published_at) over updated_at so imported
    // articles show their canonical Medium publish date instead of
    // the import timestamp. Native articles with no publications
    // fall back to updated_at unchanged.
    const displayDateRaw = article.original_published_at ?? article.updated_at;
    const updated = useMemo(
        () => formatLocaleDate(displayDateRaw, lang),
        [displayDateRaw, lang],
    );

    return (
        <li
            data-testid={`article-list-row-${article.id}`}
            // View-agnostic id attribute — paired with the
            // ``data-article-id`` on ArticleCard so E2E specs can
            // target an article without knowing whether grid or
            // list view is active. See
            // VIEW-MODE-TESTID-PARITY-01.
            data-article-id={article.id}
            className={[
                layout.gridRow,
                onToggleSelect ? layout.gridRowSelectable : "",
                isSelected ? layout.rowSelected : "",
            ]
                .filter(Boolean)
                .join(" ")}
            onClick={() => {
                if (!menuOpen) onOpen();
            }}
        >
            {onToggleSelect ? (
                <div className={layout.gridCellCheckbox}>
                    <input
                        type="checkbox"
                        data-testid={`article-bulk-check-${article.id}`}
                        checked={!!isSelected}
                        onChange={onToggleSelect}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Select article"
                    />
                </div>
            ) : null}
            <div className={layout.gridCellCover}>
                <div className={layout.coverThumb}>
                    {article.featured_image_url ? (
                        <img
                            src={article.featured_image_url}
                            alt={`${article.title} cover`}
                            className={layout.coverThumbImg}
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                            }}
                        />
                    ) : (
                        <CoverPlaceholder title={article.title} compact />
                    )}
                </div>
            </div>
            <div className={layout.gridCellMain}>
                <div className={layout.titleCell}>
                    <div className={layout.titleRow}>
                        <span className={layout.title}>{article.title}</span>
                        {/* LIST-VIEW-COMMENTS-COUNT-PARITY-01:
                            badge integrated into the title row
                            rather than added as a 10th grid column.
                            The 720px fixed-column budget + the
                            ~768px tablet breakpoint left no room
                            for another fixed column without
                            crushing the 1fr title column. Putting
                            the badge inside the 1fr main cell uses
                            space that's already there. */}
                        <CommentsCountBadge
                            count={article.comments_count}
                            testId={`article-list-row-comments-count-${article.id}`}
                            className={layout.commentsBadgeInline}
                        />
                    </div>
                    {article.subtitle ? (
                        <span className={layout.subtitle}>{article.subtitle}</span>
                    ) : null}
                </div>
            </div>
            <div className={layout.gridCellAuthor}>
                {article.author?.trim()
                    ? article.author
                    : t("ui.articles.no_author", "—")}
            </div>
            <div className={layout.gridCellTopic}>
                {article.topic ?? "—"}
            </div>
            <div className={layout.gridCellStatus}>
                {/* ARTICLE-TYPES-SSOT-01 C7 (2026-05-29): badge
                 *  surfaces the article's content_type alongside
                 *  the publication status. Same visual weight as
                 *  the status badge so users see "tutorial / draft"
                 *  rather than just "draft" in the list view. */}
                <ArticleTypeBadge
                    contentType={article.content_type}
                    testId={`article-list-row-type-${article.id}`}
                    className={layout.statusBadge}
                    style={{marginRight: 6}}
                />
                <span
                    data-testid={`article-list-row-status-${article.id}`}
                    className={layout.statusBadge}
                    style={{
                        background: badgeBg(article.status),
                        color: badgeFg(article.status),
                    }}
                >
                    {t(`ui.articles.status_${article.status}`, article.status)}
                </span>
            </div>
            <div className={layout.gridCellLang}>
                {(article.language || "??").toUpperCase()}
            </div>
            <div className={layout.gridCellDate}>{updated}</div>
            <div className={layout.gridCellActions}>
                {onDelete ? (
                    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
                        <DropdownMenu.Trigger asChild>
                            <button
                                type="button"
                                className="btn-icon"
                                data-testid={`article-list-row-menu-${article.id}`}
                                aria-label={t("ui.articles.actions_menu", "Aktionen")}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <MoreVertical size={16} />
                            </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content
                                className="hamburger-menu-content"
                                align="end"
                                sideOffset={4}
                            >
                                <DropdownMenu.Item
                                    className="hamburger-menu-item"
                                    data-testid={`article-list-row-menu-delete-${article.id}`}
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        onDelete();
                                    }}
                                >
                                    <Trash2 size={14} />{" "}
                                    {t("ui.articles.move_to_trash", "In den Papierkorb")}
                                </DropdownMenu.Item>
                                {onDeletePermanent ? (
                                    <>
                                        <DropdownMenu.Separator className="hamburger-menu-separator" />
                                        <DropdownMenu.Item
                                            className="hamburger-menu-item"
                                            data-testid={`article-list-row-menu-delete-permanent-${article.id}`}
                                            onSelect={(e) => {
                                                e.preventDefault();
                                                onDeletePermanent();
                                            }}
                                            style={{ color: "var(--danger)" }}
                                        >
                                            <AlertTriangle size={14} />{" "}
                                            {t(
                                                "ui.articles.delete_permanent",
                                                "Endgültig löschen",
                                            )}
                                        </DropdownMenu.Item>
                                    </>
                                ) : null}
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                ) : null}
            </div>
        </li>
    );
}

function badgeBg(status: ArticleStatus): string {
    switch (status) {
        case "published":
            return "var(--success-light, #dcfce7)";
        case "archived":
            return "var(--bg-card)";
        default:
            return "var(--bg-card)";
    }
}

function badgeFg(status: ArticleStatus): string {
    switch (status) {
        case "published":
            return "var(--success, #166534)";
        case "archived":
            return "var(--text-muted)";
        default:
            return "var(--text-secondary)";
    }
}
