/**
 * AR-01 Phase 1 article list.
 *
 * Standalone page at ``/articles`` that lists every article. Filter
 * by status (all / draft / published / archived). Click an article to
 * open the editor. "New Article" creates a draft via API and
 * redirects to the editor.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";

import { api, ApiError, Article, BookDetail } from "../api/client";
import { getStorage } from "../storage";
import { useI18n } from "../hooks/useI18n";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../features/featureConfig";
import { useContentTypes, contentTypeDefaultTitleKey } from "../hooks/useContentTypes";
import { notify } from "../utils/platform/notify";
import { downloadBlob } from "../shared/utils/downloadBlob";
import ViewToggle from "../components/ViewToggle";
import ArticleCard from "../components/articles/ArticleCard";
import ArticleBulkActionBar, {
    type BulkExportFormat,
    type BulkExportMode,
    BULK_LIMIT_HARD,
} from "../components/articles/ArticleBulkActionBar";
import { useArticleSelection } from "../components/articles/useArticleSelection";
import ConvertToBookWizard from "../components/articles/ConvertToBookWizard";
import TypeToConfirmDialog from "../components/dialogs/TypeToConfirmDialog";
import { formatActiveArticleFilters } from "../utils/format/formatActiveFilters";
import BulkTemplateImportDialog from "../components/book/BulkTemplateImportDialog";
import FieldClassDialog, { type FieldClassDialogResult } from "../components/FieldClassDialog";
import BulkAiFillConfirmDialog from "../components/articles/BulkAiFillConfirmDialog";
import layout from "./ArticleList.module.css";
import { useTrashViewMode, useViewMode } from "../hooks/content/useViewMode";
import { usePagedList } from "../hooks/usePagedList";
import { useArticleFilters } from "../hooks/article/useArticleFilters";
import { useArticleListData } from "../hooks/article/useArticleListData";
import { useDialog } from "../components/shared/AppDialog";
import { useHelp } from "../contexts/HelpContext";
import { Search } from "lucide-react";
import { ImportWizardModal } from "../components/import-wizard";
import OfflineImportDialog from "../components/import/OfflineImportDialog";
import DropZone from "../lib/components/DropZone";
import RecentDocuments from "../components/RecentDocuments";
import { useStorageMode } from "../storage/useStorageMode";
import { ArticleFilterBar } from "../components/articles/ArticleFilterBar";
import ArticleFilterSheet from "../components/articles/ArticleFilterSheet";
import ResponsiveFilterControls from "../components/ResponsiveFilterControls";
import TileSelectCheckbox from "../components/TileSelectCheckbox";
import ArticleRow from "../components/articles/ArticleRow";
import ArticleListEmptyState from "../components/articles/ArticleListEmptyState";
import ArticleListHeader from "../components/articles/ArticleListHeader";
import ArticleTrashPanel from "../components/articles/ArticleTrashPanel";
import BulkSelectAllCheckbox from "../components/dashboard/BulkSelectAllCheckbox";
import ListPaginationControls from "../components/ListPaginationControls";
import { EmptyState } from "../lib/components/EmptyState";

export default function ArticleList() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const bgbImport = useFeature(FEATURES.BGB_IMPORT);
    // The .bgb backup-export remains desktop-only. Policy #78: visible +
    // disabled with a reason offline, never hidden. `offline` gates only the
    // backup-export controls; import itself works offline via the
    // OfflineImportDialog (see the storage-mode routing below).
    const offline = !bgbImport.isActive;
    const offlineHint = t(
        bgbImport.reason ?? "ui.feature.requires_desktop_app",
        "This feature requires the Bibliogon desktop app",
    );
    // Import works in both modes: API mode opens the backend ImportWizardModal,
    // Dexie mode opens the client-side OfflineImportDialog (markdown/text/html/
    // JSON backup/Medium ZIP all client-side; .bgb shows the desktop hint).
    const { mode } = useStorageMode();
    const isDexie = mode === "dexie";
    const articleTypesSnapshot = useContentTypes();
    const [showTrash, setShowTrash] = useState(false);
    // CONFIGURABLE-DEFAULT-CONTENT-BOOK-TYPE-01: workspace default
    // content-type (ui.defaults.content_type). The SplitButton primary
    // "Neuer Artikel" creates this type (CreateArticlePage applies it);
    // its label reflects the default's registry default_title_key.
    const [defaultContentType, setDefaultContentType] = useState("blogpost");
    const {
        mode: viewMode,
        setMode: setViewMode,
        loading: viewModeLoading,
    } = useViewMode("articles");
    // Trash surface keeps an INDEPENDENT view-mode read from a separate
    // YAML key (``ui.dashboard.articles_trash_view``). In-trash toggles
    // are session-local (no YAML write); persistence is only via the
    // Settings UI. See ``useTrashViewMode`` for the rationale.
    const { mode: trashViewMode, setMode: setTrashViewMode } = useTrashViewMode("articles");
    const { confirm } = useDialog();
    const { openHelp } = useHelp();
    const selection = useArticleSelection();
    const {
        articles,
        setArticles,
        trash,
        loading,
        loadTrash,
        refreshArticles,
        handleDelete,
        handleDeletePermanentFromList,
        handleRestore,
        handlePermanentDelete,
        handleEmptyTrash,
    } = useArticleListData(offline, selection, confirm, t);
    const filters = useArticleFilters(articles, t);
    // SplitButton primary label ALWAYS reflects the configured default
    // content-type's ``default_title_key``, mirroring the Book Dashboard's
    // ``newBookLabel`` (which shows the default book-type's title even for
    // the registry default). Falls back to the generic "Neuer Artikel"
    // only when the default is unset/unknown or omits the key. (Issue
    // #122: previously the label fell back to generic whenever the default
    // equalled the registry default (blogpost), so a blogpost-default
    // workspace wrongly showed "Neuer Artikel" instead of "Neuer Blogpost".)
    const registryDefaultContentType = articleTypesSnapshot.defaultId;
    const newArticleFallbackLabel = t("ui.articles.new", "Neuer Artikel");
    const newArticleTitleKey = defaultContentType
        ? contentTypeDefaultTitleKey(articleTypesSnapshot, defaultContentType)
        : null;
    const newArticleLabel = newArticleTitleKey
        ? t(newArticleTitleKey, newArticleFallbackLabel)
        : newArticleFallbackLabel;
    // The primary deep-links a SPECIFIC (non-registry-default) type so
    // CreateArticlePage renders the type-specific heading. The registry
    // default (blogpost) and the unconfigured case use the bare
    // /articles/new, where CreateArticlePage applies the configured
    // default generically.
    const hasSpecificDefaultContentType =
        !!defaultContentType &&
        defaultContentType !== registryDefaultContentType &&
        !!articleTypesSnapshot.types[defaultContentType];
    const newArticleHref = hasSpecificDefaultContentType
        ? `/articles/new?type=${defaultContentType}`
        : "/articles/new";
    // DASHBOARD-PAGINATION-LOAD-MORE-01 C6: paged display of the
    // active (non-trash) article list. Slices ``filters.filteredArticles``
    // to ``paged.limit`` for render; "Load more" grows the limit;
    // PageSizeSelector persists the user's preference. Filter changes
    // reset the limit (effect below).
    const paged = usePagedList("articles");
    const [importWizardOpen, setImportWizardOpen] = useState(false);
    // Drag-and-drop import (#312): a dropped file opens the import dialog
    // pre-loaded (dexie auto-detects via initialFile; API mode opens the wizard).
    const [droppedFile, setDroppedFile] = useState<File | null>(null);
    const handleFileDrop = (files: File[]) => {
        const file = files[0];
        if (!file) return;
        setDroppedFile(file);
        setImportWizardOpen(true);
    };

    /** Article-to-book conversion wizard. Snapshot the user's selected
     *  Article[] when opening so the wizard's working copy is stable
     *  even if the parent selection changes (it shouldn't, the page
     *  freezes interactions behind the dialog, but the snapshot
     *  decouples the two state machines). */
    const [convertToBookArticles, setConvertToBookArticles] = useState<Article[] | null>(null);

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
            downloadBlob(blob, filename);
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
            downloadBlob(blob, filename);
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
                    : t("ui.ai_template.bulk.export_failed", "Bulk template export failed");
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
        if (ordered.length < 2) return;
        try {
            const result = await getStorage().articles.bulkDelete(ordered, permanent);
            // Optimistic refresh: drop the deleted IDs from the
            // visible list right away rather than re-fetching the
            // whole collection.
            setArticles((prev) =>
                prev.filter(
                    (a) => !ordered.includes(a.id) || result.failed.some((f) => f.id === a.id),
                ),
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
                            (id) =>
                                !result.skipped_already_trashed.includes(id) &&
                                !result.failed.some((f) => f.id === id),
                        );
                        if (undone.length === 0) {
                            notify.info(t("ui.bulk_delete.toast_undone", "Wiederhergestellt"));
                            return;
                        }
                        const undoResult = await getStorage().articles.bulkRestore(undone);
                        const fresh = await getStorage().articles.list();
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
                            notify.info(t("ui.bulk_delete.toast_undone", "Wiederhergestellt"));
                        }
                    } catch (undoErr) {
                        notify.error(
                            t(
                                "ui.bulk_delete.toast_undo_failed",
                                "Wiederherstellen fehlgeschlagen",
                            ),
                            undoErr,
                        );
                    }
                },
                t("ui.bulk_delete.undo_label", "Rückgängig"),
            );
        } catch (err) {
            notify.error(t("ui.bulk_delete.toast_failed", "Bulk-Löschen fehlgeschlagen"), err);
        }
    };

    const handleBulkDeletePermanentRequest = () => {
        const ordered = filters.filteredArticles
            .map((a) => a.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length < 2) return;
        setBulkDeleteDialog({ ids: ordered, count: ordered.length });
    };

    const handleBulkDeletePermanentConfirmed = async () => {
        if (!bulkDeleteDialog) return;
        const { ids } = bulkDeleteDialog;
        setBulkDeleteDialog(null);
        try {
            const result = await getStorage().articles.bulkDelete(ids, true);
            setArticles((prev) => prev.filter((a) => !ids.includes(a.id)));
            selection.clear();
            notify.success(
                t("ui.bulk_delete.toast_deleted_permanent", "{count} endgültig gelöscht").replace(
                    "{count}",
                    String(result.deleted_count),
                ),
            );
        } catch (err) {
            notify.error(t("ui.bulk_delete.toast_failed", "Bulk-Löschen fehlgeschlagen"), err);
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
        if (offline) return;
        window.open(api.backup.exportUrl(), "_blank");
    };

    // Fetch the configured default content-type for the SplitButton
    // primary label. No cache on getApp(), and this runs on every
    // mount, so the label updates as soon as the user returns from
    // Settings after changing the default. Silent fail: keep "blogpost".
    useEffect(() => {
        let cancelled = false;
        getStorage()
            .settings.getApp()
            .then((config) => {
                if (cancelled) return;
                const uiConfig = (config.ui || {}) as Record<string, unknown>;
                const uiDefaults = (uiConfig.defaults || {}) as Record<string, unknown>;
                const ct = uiDefaults.content_type;
                if (typeof ct === "string") setDefaultContentType(ct);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <DropZone
            testId="article-list-page"
            className={layout.page}
            onDrop={handleFileDrop}
            accept={[".bgb", ".md", ".markdown", ".txt", ".html", ".htm", ".json", ".zip"]}
            overlayLabel={t("ui.offline_import.drop_hint", "Datei hier ablegen zum Importieren")}
        >
            <ArticleListHeader
                layout={layout}
                navigate={navigate}
                t={t}
                newArticleLabel={newArticleLabel}
                newArticleHref={newArticleHref}
                articleTypesSnapshot={articleTypesSnapshot}
                onOpenImportWizard={() => setImportWizardOpen(true)}
                offline={offline}
                offlineHint={offlineHint}
                articles={articles}
                onBackupExport={handleBackupExport}
                onOpenHelp={openHelp}
                showTrash={showTrash}
                onToggleTrash={() => setShowTrash(!showTrash)}
                trash={trash}
            />
            <main id="main-content" className={layout.main}>
                {!showTrash && <RecentDocuments kind="articles" reloadKey={articles} />}
                {/* Page title row mirrors the books-dashboard ``mainHeader``
                shape: heading + count + ViewToggle inline. Hidden in
                trash mode; TrashPanel renders its own header that
                matches the books-trash chrome (chevron + icon + title
                + count + empty-trash + ViewToggle). */}
                {!showTrash && (
                    <div className={layout.mainHeader} data-testid="article-list-main-header">
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
                        <div style={{ flex: 1 }} />
                        <ViewToggle mode={viewMode} onChange={setViewMode} />
                    </div>
                )}

                {showTrash ? (
                    <ArticleTrashPanel
                        trash={trash}
                        viewMode={trashViewMode}
                        setViewMode={setTrashViewMode}
                        onBack={() => setShowTrash(false)}
                        onRestore={(a) => void handleRestore(a)}
                        onPermanentDelete={(a) => void handlePermanentDelete(a)}
                        onEmptyTrash={() => void handleEmptyTrash()}
                    />
                ) : null}

                {!showTrash ? (
                    <ResponsiveFilterControls
                        triggerLabel={t("ui.articles.filters", "Filter")}
                        bar={<ArticleFilterBar filters={filters} />}
                        sheet={<ArticleFilterSheet filters={filters} />}
                    />
                ) : null}
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
                    <BulkSelectAllCheckbox
                        className={layout.bulkSelectAll}
                        testId="article-bulk-select-all"
                        count={selection.count}
                        total={filters.filteredArticles.length}
                        onSelectAll={() =>
                            selection.selectAll(filters.filteredArticles.map((a) => a.id))
                        }
                        onClear={selection.clear}
                        label={t("ui.articles.bulk.select_all", "Select all")}
                    />
                ) : null}

                {showTrash ? null : loading || viewModeLoading ? (
                    <p
                        data-testid="article-list-loading"
                        style={{ padding: 16, color: "var(--text-muted)" }}
                    >
                        {t("ui.common.loading", "Laedt...")}
                    </p>
                ) : articles.length === 0 ? (
                    <ArticleListEmptyState onCreate={() => navigate("/articles/new")} />
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
                ) : (
                    (() => {
                        // C6: slice to ``paged.limit`` for render. Selection
                        // semantics unchanged — select-all still operates on
                        // the full filtered set, not just the visible page.
                        const visibleArticles = filters.filteredArticles.slice(0, paged.limit);
                        const hasMore = filters.filteredArticles.length > visibleArticles.length;
                        return (
                            <>
                                {viewMode === "grid" ? (
                                    <div className={layout.grid} data-testid="article-list">
                                        {visibleArticles.map((a) => (
                                            <div
                                                key={a.id}
                                                className={`${layout.tileWrapper}${selection.isSelected(a.id) ? ` ${layout.tileSelected}` : ""}`}
                                            >
                                                <TileSelectCheckbox
                                                    checked={selection.isSelected(a.id)}
                                                    onToggle={() => selection.toggle(a.id)}
                                                    testId={`article-bulk-check-${a.id}`}
                                                    ariaLabel="Select article"
                                                />
                                                <ArticleCard
                                                    article={a}
                                                    onClick={() => navigate(`/articles/${a.id}`)}
                                                    onDelete={() => void handleDelete(a)}
                                                    onDeletePermanent={() =>
                                                        void handleDeletePermanentFromList(a)
                                                    }
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <ul
                                            className={`${layout.list} min-w-[820px] menu:min-w-0`}
                                            data-testid="article-list"
                                        >
                                            {visibleArticles.map((a) => (
                                                <ArticleRow
                                                    key={a.id}
                                                    article={a}
                                                    onOpen={() => navigate(`/articles/${a.id}`)}
                                                    onDelete={() => void handleDelete(a)}
                                                    onDeletePermanent={() =>
                                                        void handleDeletePermanentFromList(a)
                                                    }
                                                    isSelected={selection.isSelected(a.id)}
                                                    onToggleSelect={() => selection.toggle(a.id)}
                                                />
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {filters.filteredArticles.length > 0 && (
                                    <ListPaginationControls
                                        visibleCount={visibleArticles.length}
                                        totalCount={filters.filteredArticles.length}
                                        hasMore={hasMore}
                                        onLoadMore={paged.loadMore}
                                        pageSize={paged.pageSize}
                                        onPageSizeChange={paged.setPageSize}
                                        t={t}
                                        paginationTestId="article-list-pagination"
                                        loadMoreTestId="article-list-load-more"
                                        pageSizeTestId="article-list-page-size"
                                    />
                                )}
                            </>
                        );
                    })()
                )}
            </main>
            {isDexie ? (
                <OfflineImportDialog
                    open={importWizardOpen}
                    initialFile={droppedFile}
                    onClose={() => {
                        setImportWizardOpen(false);
                        setDroppedFile(null);
                    }}
                    onImported={() => {
                        void refreshArticles();
                        void loadTrash();
                    }}
                />
            ) : (
                <ImportWizardModal
                    open={importWizardOpen}
                    onClose={() => {
                        setImportWizardOpen(false);
                        setDroppedFile(null);
                    }}
                    onImported={() => {
                        void refreshArticles();
                        void loadTrash();
                    }}
                />
            )}
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
                    void getStorage()
                        .articles.list()
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
                title={t(
                    "ui.bulk_ai_fill.field_class_dialog_title",
                    "Bulk AI fill: pick field-classes",
                )}
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
        </DropZone>
    );
}
