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

import { api, ApiError, Article, ArticleStatus } from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/notify";
import ViewToggle from "../components/ViewToggle";
import ArticleCard from "../components/articles/ArticleCard";
import CoverPlaceholder from "../components/CoverPlaceholder";
import ThemeToggle from "../components/ThemeToggle";
import TrashCard from "../components/trash/TrashCard";
import layout from "./ArticleList.module.css";
import { useViewMode } from "../hooks/useViewMode";
import { useArticleFilters } from "../hooks/useArticleFilters";
import { useDialog } from "../components/AppDialog";
import { useHelp } from "../contexts/HelpContext";
import { Search, X as XIcon, ArrowUp, ArrowDown } from "lucide-react";
import { ImportWizardModal } from "../components/import-wizard";

const STATUS_FILTERS: (ArticleStatus | "all")[] = [
    "all",
    "draft",
    "published",
    "archived",
];

export default function ArticleList() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const [articles, setArticles] = useState<Article[]>([]);
    const [trash, setTrash] = useState<Article[]>([]);
    const [showTrash, setShowTrash] = useState(false);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const { mode: viewMode, setMode: setViewMode } = useViewMode("articles");
    const { confirm } = useDialog();
    const { openHelp } = useHelp();
    const filters = useArticleFilters(articles, t);
    const [importWizardOpen, setImportWizardOpen] = useState(false);

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
        try {
            await api.articles.restore(article.id);
            setTrash((prev) => prev.filter((a) => a.id !== article.id));
            // Reload the live list so the restored article appears
            // immediately. useArticleFilters re-derives from
            // ``articles`` so filters keep applying without a refetch.
            const fresh = await api.articles.list();
            setArticles(fresh);
            notify.success(
                t("ui.articles.restored", "Artikel wiederhergestellt."),
            );
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t("ui.articles.restore_failed", "Wiederherstellen fehlgeschlagen."),
                    err,
                );
            }
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

    async function handleCreate(): Promise<void> {
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
            const fresh = await api.articles.create({
                title: t("ui.articles.default_title", "Neuer Artikel"),
                language: "de",
                author: defaultAuthor,
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
                        <button
                            className="btn btn-primary"
                            onClick={() => void handleCreate()}
                            disabled={creating}
                            data-testid="article-list-new"
                        >
                            <Plus size={16} />
                            <span className="hide-mobile">
                                {t("ui.articles.new", "Neuer Artikel")}
                            </span>
                        </button>
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
                            takes over on mobile. */}
                        <div
                            className="hide-mobile"
                            style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                            <button
                                className="btn btn-secondary btn-sm"
                                data-testid="article-backup-export-btn"
                                onClick={handleBackupExport}
                                disabled={articles.length === 0}
                                title={t("ui.dashboard.backup", "Backup")}
                            >
                                <Download size={14} /> {t("ui.dashboard.backup", "Backup")}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                data-testid="article-import-wizard-btn"
                                onClick={() => setImportWizardOpen(true)}
                                title={t("ui.dashboard.import", "Importieren")}
                            >
                                <Upload size={14} /> {t("ui.dashboard.import", "Importieren")}
                            </button>
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
            <main className={layout.main}>
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
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    onBack={() => setShowTrash(false)}
                    onRestore={(a) => void handleRestore(a)}
                    onPermanentDelete={(a) => void handlePermanentDelete(a)}
                    onEmptyTrash={() => void handleEmptyTrash()}
                />
            ) : null}

            {!showTrash ? <ArticleFilterBar filters={filters} /> : null}

            {showTrash ? null : loading ? (
                <p
                    data-testid="article-list-loading"
                    style={{ padding: 16, color: "var(--text-muted)" }}
                >
                    {t("ui.common.loading", "Laedt...")}
                </p>
            ) : articles.length === 0 ? (
                <EmptyState onCreate={() => void handleCreate()} />
            ) : filters.filteredArticles.length === 0 ? (
                <div data-testid="article-list-filter-empty" className={layout.empty}>
                    <Search size={32} className="muted" />
                    <p style={{ color: "var(--text-muted)", margin: 0 }}>
                        {t(
                            "ui.articles.empty_filtered",
                            "Keine Artikel passen zu den aktuellen Filtern.",
                        )}
                    </p>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={filters.resetFilters}
                        data-testid="article-list-filter-reset"
                    >
                        {t("ui.articles.reset_filters", "Filter zurücksetzen")}
                    </button>
                </div>
            ) : viewMode === "grid" ? (
                <div className={layout.grid} data-testid="article-list">
                    {filters.filteredArticles.map((a) => (
                        <ArticleCard
                            key={a.id}
                            article={a}
                            onClick={() => navigate(`/articles/${a.id}`)}
                            onDelete={() => void handleDelete(a)}
                            onDeletePermanent={() => void handleDeletePermanentFromList(a)}
                        />
                    ))}
                </div>
            ) : (
                <ul className={layout.list} data-testid="article-list">
                    {filters.filteredArticles.map((a) => (
                        <ArticleRow
                            key={a.id}
                            article={a}
                            onOpen={() => navigate(`/articles/${a.id}`)}
                            onDelete={() => void handleDelete(a)}
                            onDeletePermanent={() => void handleDeletePermanentFromList(a)}
                        />
                    ))}
                </ul>
            )}
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

function ArticleFilterBar({ filters }: { filters: ReturnType<typeof useArticleFilters> }) {
    const { t } = useI18n();

    return (
        <div data-testid="article-list-filter" className={layout.filterBar}>
            <div className={layout.searchInputWrapper}>
                <Search size={14} className={layout.searchIcon} aria-hidden />
                <input
                    type="search"
                    value={filters.searchQuery}
                    onChange={(e) => filters.setSearchQuery(e.target.value)}
                    placeholder={t("ui.articles.search_placeholder", "Suche...")}
                    data-testid="article-list-search"
                    className={layout.searchInput}
                />
                {filters.searchQuery ? (
                    <button
                        type="button"
                        className={`btn-icon ${layout.searchClear}`}
                        aria-label={t("ui.common.clear", "Löschen")}
                        onClick={() => filters.setSearchQuery("")}
                    >
                        <XIcon size={12} />
                    </button>
                ) : null}
            </div>

            {/* Status: button row, mirrors the previous quick filter so
                the existing testid contract for ``filter_${s}`` keeps
                working in smoke specs. */}
            {STATUS_FILTERS.map((s) => (
                <button
                    key={s}
                    type="button"
                    className={`btn btn-sm ${
                        s === filters.status ? "btn-primary" : "btn-ghost"
                    }`}
                    onClick={() => filters.setStatus(s)}
                    data-testid={`article-list-filter-${s}`}
                >
                    {t(
                        `ui.articles.filter_${s}`,
                        s === "all"
                            ? "Alle"
                            : s.charAt(0).toUpperCase() + s.slice(1),
                    )}
                </button>
            ))}

            {filters.availableTopics.length > 0 ? (
                <select
                    value={filters.topic}
                    onChange={(e) => filters.setTopic(e.target.value)}
                    data-testid="article-list-filter-topic"
                    className={layout.filterSelect}
                    aria-label={t("ui.articles.filter_topic", "Thema")}
                >
                    <option value="">
                        {t("ui.articles.filter_topic_any", "Alle Themen")}
                    </option>
                    {filters.availableTopics.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            ) : null}

            {filters.availableLanguages.length > 1 ? (
                <select
                    value={filters.language}
                    onChange={(e) => filters.setLanguage(e.target.value)}
                    data-testid="article-list-filter-language"
                    className={layout.filterSelect}
                    aria-label={t("ui.articles.filter_language", "Sprache")}
                >
                    <option value="">
                        {t("ui.articles.filter_language_any", "Alle Sprachen")}
                    </option>
                    {filters.availableLanguages.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            ) : null}

            <select
                value={filters.sortBy}
                onChange={(e) =>
                    filters.setSortBy(e.target.value as "date" | "title" | "author")
                }
                data-testid="article-list-sort-by"
                className={layout.filterSelect}
                aria-label={t("ui.articles.sort_by", "Sortieren nach")}
            >
                <option value="date">{t("ui.articles.sort_date", "Datum")}</option>
                <option value="title">{t("ui.articles.sort_title", "Titel")}</option>
                <option value="author">{t("ui.articles.sort_author", "Autor")}</option>
            </select>
            <button
                type="button"
                className="btn-icon"
                onClick={filters.toggleSortOrder}
                data-testid="article-list-sort-order"
                aria-label={t("ui.articles.sort_order", "Sortierreihenfolge")}
                title={t("ui.articles.sort_order", "Sortierreihenfolge")}
            >
                {filters.sortOrder === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            </button>

            {filters.hasActiveFilters ? (
                <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={filters.resetFilters}
                    data-testid="article-list-filter-clear"
                >
                    {t("ui.articles.reset_filters", "Filter zurücksetzen")}
                </button>
            ) : null}
        </div>
    );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
    const { t } = useI18n();
    const navigate = useNavigate();
    return (
        <div data-testid="article-list-empty" className={layout.empty}>
            <FileText size={32} className="muted" />
            <h3 style={{ margin: 0 }}>
                {t("ui.articles.empty_heading", "Noch keine Artikel")}
            </h3>
            <p
                style={{
                    margin: 0,
                    fontSize: "0.875rem",
                    color: "var(--text-muted)",
                }}
            >
                {t(
                    "ui.articles.empty_subtitle",
                    "Erstelle deinen ersten Artikel, um lange Beiträge separat von Büchern zu verfassen.",
                )}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
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
            </div>
        </div>
    );
}

function ArticleRow({
    article,
    onOpen,
    onDelete,
    onDeletePermanent,
}: {
    article: Article;
    onOpen: () => void;
    onDelete?: () => void;
    onDeletePermanent?: () => void;
}) {
    const { t } = useI18n();
    const [menuOpen, setMenuOpen] = useState(false);
    const updated = useMemo(() => {
        try {
            return new Date(article.updated_at).toLocaleDateString("de-DE", {
                day: "numeric",
                month: "short",
                year: "numeric",
            });
        } catch {
            return article.updated_at;
        }
    }, [article.updated_at]);

    return (
        <li
            data-testid={`article-list-row-${article.id}`}
            className={layout.gridRow}
            onClick={() => {
                if (!menuOpen) onOpen();
            }}
        >
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
                    <span className={layout.title}>{article.title}</span>
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
