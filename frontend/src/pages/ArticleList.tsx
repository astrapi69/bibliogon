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
    FileText,
    HelpCircle,
    MoreVertical,
    Plus,
    Rocket,
    RotateCcw,
    Settings,
    Trash,
    Trash2,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { api, ApiError, Article, ArticleStatus } from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/notify";
import ViewToggle from "../components/ViewToggle";
import ArticleCard from "../components/articles/ArticleCard";
import ThemeToggle from "../components/ThemeToggle";
import { useViewMode } from "../hooks/useViewMode";
import { useDialog } from "../components/AppDialog";
import { useHelp } from "../contexts/HelpContext";

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
    const [filter, setFilter] = useState<ArticleStatus | "all">("all");
    const [creating, setCreating] = useState(false);
    const { mode: viewMode, setMode: setViewMode } = useViewMode("articles");
    const { confirm } = useDialog();
    const { openHelp } = useHelp();

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
            // immediately respecting the current filter.
            const fresh = await api.articles.list(
                filter === "all" ? undefined : filter,
            );
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

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        api.articles
            .list(filter === "all" ? undefined : filter)
            .then((rows) => {
                if (!cancelled) setArticles(rows);
            })
            .catch((err) => {
                if (err instanceof ApiError) {
                    notify.error(
                        "Konnte Artikelliste nicht laden.",
                        err,
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter]);

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
        <div data-testid="article-list-page" style={layout.page}>
            <header style={layout.appHeader}>
                <div style={layout.appHeaderInner}>
                    <div
                        style={layout.logo}
                        onClick={() => navigate("/")}
                        role="button"
                        title={t("ui.articles.back_to_dashboard_tooltip", "Zum Dashboard")}
                        data-testid="article-list-dashboard"
                    >
                        <BookOpen size={28} strokeWidth={1.5} />
                        <h1 style={layout.logoText}>Bibliogon</h1>
                    </div>
                    <div style={layout.headerActions}>
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
                        <div className="hide-mobile" style={layout.headerSeparator} />
                        <ViewToggle mode={viewMode} onChange={setViewMode} />
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
                            style={showTrash ? { color: "var(--accent)", position: "relative" } : { position: "relative" }}
                            title={t("ui.articles.trash_title", "Papierkorb")}
                            aria-pressed={showTrash}
                        >
                            <Trash size={18} />
                            {trash.length > 0 && (
                                <span
                                    style={layout.trashBadge}
                                    data-testid="article-trash-badge"
                                >
                                    {trash.length}
                                </span>
                            )}
                        </button>
                        <ThemeToggle />
                    </div>
                </div>
            </header>
            <main style={layout.main}>
            <h2 style={layout.heading}>
                <FileText size={18} style={{ verticalAlign: -3, marginRight: 8 }} />
                {t("ui.articles.list_heading", "Artikel")}
            </h2>

            {showTrash ? (
                <TrashPanel
                    trash={trash}
                    onRestore={(a) => void handleRestore(a)}
                    onPermanentDelete={(a) => void handlePermanentDelete(a)}
                    onEmptyTrash={() => void handleEmptyTrash()}
                />
            ) : null}

            {!showTrash ? <FilterBar value={filter} onChange={setFilter} /> : null}

            {showTrash ? null : loading ? (
                <p
                    data-testid="article-list-loading"
                    style={{ padding: 16, color: "var(--text-muted)" }}
                >
                    {t("ui.common.loading", "Laedt...")}
                </p>
            ) : articles.length === 0 ? (
                <EmptyState onCreate={() => void handleCreate()} />
            ) : viewMode === "grid" ? (
                <div style={layout.grid} data-testid="article-list">
                    {articles.map((a) => (
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
                <ul style={layout.list} data-testid="article-list">
                    {articles.map((a) => (
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
        </div>
    );
}

function TrashPanel({
    trash,
    onRestore,
    onPermanentDelete,
    onEmptyTrash,
}: {
    trash: Article[];
    onRestore: (a: Article) => void;
    onPermanentDelete: (a: Article) => void;
    onEmptyTrash: () => void;
}) {
    const { t } = useI18n();
    if (trash.length === 0) {
        return (
            <div
                data-testid="article-trash-empty"
                style={{ ...layout.empty, marginBottom: 16 }}
            >
                <Trash size={28} style={{ color: "var(--text-muted)" }} />
                <p style={{ color: "var(--text-muted)", margin: 0 }}>
                    {t("ui.articles.trash_empty", "Keine gelöschten Artikel.")}
                </p>
            </div>
        );
    }
    return (
        <div data-testid="article-trash-panel" style={{ marginBottom: 16 }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                }}
            >
                <h3 style={{ margin: 0, fontSize: "1rem" }}>
                    {t("ui.articles.trash_title", "Papierkorb")} ({trash.length})
                </h3>
                <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={onEmptyTrash}
                    data-testid="article-trash-empty-all"
                    style={{ color: "var(--danger)" }}
                >
                    <Trash2 size={14} />
                    {t("ui.articles.empty_trash", "Papierkorb leeren")}
                </button>
            </div>
            <ul style={layout.list}>
                {trash.map((a) => (
                    <li
                        key={a.id}
                        data-testid={`article-trash-row-${a.id}`}
                        style={{ ...layout.row, position: "relative" }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={layout.rowTitle}>{a.title}</div>
                            <div style={layout.rowMeta}>
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
        </div>
    );
}


function FilterBar({
    value,
    onChange,
}: {
    value: ArticleStatus | "all";
    onChange: (v: ArticleStatus | "all") => void;
}) {
    const { t } = useI18n();
    return (
        <div data-testid="article-list-filter" style={layout.filterBar}>
            {STATUS_FILTERS.map((s) => (
                <button
                    key={s}
                    type="button"
                    className={`btn btn-sm ${
                        s === value ? "btn-primary" : "btn-ghost"
                    }`}
                    onClick={() => onChange(s)}
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
        </div>
    );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
    const { t } = useI18n();
    return (
        <div data-testid="article-list-empty" style={layout.empty}>
            <FileText size={32} style={{ color: "var(--text-muted)" }} />
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
            <button
                type="button"
                className="btn btn-primary"
                onClick={onCreate}
                data-testid="article-list-empty-cta"
            >
                <Plus size={14} />
                {t("ui.articles.new", "Neuer Artikel")}
            </button>
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
    const subtitle = article.subtitle?.trim() || article.author?.trim() || "";
    const updated = useMemo(() => {
        try {
            return new Date(article.updated_at).toLocaleString();
        } catch {
            return article.updated_at;
        }
    }, [article.updated_at]);

    return (
        <li
            data-testid={`article-list-row-${article.id}`}
            style={layout.row}
            onClick={() => {
                if (!menuOpen) onOpen();
            }}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={layout.rowTitle}>{article.title}</div>
                {subtitle && (
                    <div style={layout.rowSubtitle}>{subtitle}</div>
                )}
                {onDelete ? (
                    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
                        <DropdownMenu.Trigger asChild>
                            <button
                                type="button"
                                className="btn-icon"
                                data-testid={`article-list-row-menu-${article.id}`}
                                aria-label={t("ui.articles.actions_menu", "Aktionen")}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    position: "absolute",
                                    top: 8,
                                    right: 8,
                                }}
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
                <div style={layout.rowMeta}>
                    <span
                        data-testid={`article-list-row-status-${article.id}`}
                        style={{
                            ...layout.statusBadge,
                            background: badgeBg(article.status),
                            color: badgeFg(article.status),
                        }}
                    >
                        {t(
                            `ui.articles.status_${article.status}`,
                            article.status,
                        )}
                    </span>
                    <span style={layout.rowLanguage}>
                        {(article.language || "??").toUpperCase()}
                    </span>
                    <span style={layout.rowUpdated}>{updated}</span>
                </div>
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

const layout: Record<string, React.CSSProperties> = {
    page: {
        padding: 0,
        margin: 0,
        minHeight: "100vh",
        background: "var(--bg-primary)",
    },
    appHeader: {
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
    },
    appHeaderInner: {
        maxWidth: 1100,
        margin: "0 auto",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
    },
    logo: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: "var(--accent)",
        flexShrink: 0,
        cursor: "pointer",
    },
    logoText: {
        fontFamily: "var(--font-display)",
        fontSize: "1.5rem",
        fontWeight: 600,
        color: "var(--text-primary)",
        letterSpacing: "-0.02em",
        margin: 0,
    },
    headerActions: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        justifyContent: "flex-end",
    },
    headerSeparator: {
        width: 1,
        height: 24,
        background: "var(--border)",
        margin: "0 4px",
    },
    trashBadge: {
        position: "absolute",
        top: -4,
        right: -4,
        background: "var(--danger)",
        color: "white",
        fontSize: "0.625rem",
        fontWeight: 700,
        width: 16,
        height: 16,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    main: {
        maxWidth: 1100,
        margin: "0 auto",
        padding: "32px 24px",
    },
    heading: {
        margin: "0 0 20px 0",
        fontSize: "1.5rem",
        fontWeight: 600,
    },
    filterBar: {
        display: "flex",
        gap: 8,
        marginBottom: 16,
        flexWrap: "wrap",
    },
    list: {
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
    },
    grid: {
        // ``gridAutoRows: 1fr`` keeps row heights uniform across the
        // whole grid (matches the books-dashboard fix in F-8). Cards
        // ``height: 100%`` stretch to the row height.
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gridAutoRows: "1fr",
        gap: 16,
    },
    row: {
        padding: "12px 16px",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        cursor: "pointer",
        display: "flex",
        gap: 12,
        position: "relative",
    },
    rowTitle: {
        fontSize: "1rem",
        fontWeight: 600,
        color: "var(--text-primary)",
    },
    rowSubtitle: {
        marginTop: 2,
        fontSize: "0.875rem",
        color: "var(--text-secondary)",
    },
    rowMeta: {
        marginTop: 6,
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: "0.75rem",
        color: "var(--text-muted)",
    },
    statusBadge: {
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: "0.6875rem",
        fontWeight: 500,
    },
    rowLanguage: {
        fontFamily: "monospace",
    },
    rowUpdated: {
        marginLeft: "auto",
    },
    empty: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "48px 16px",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
    },
};
