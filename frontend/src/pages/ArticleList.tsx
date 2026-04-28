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
import { FileText, Home, Plus } from "lucide-react";

import { api, ApiError, Article, ArticleStatus } from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/notify";
import ViewToggle from "../components/ViewToggle";
import ArticleCard from "../components/articles/ArticleCard";
import { useViewMode } from "../hooks/useViewMode";

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
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<ArticleStatus | "all">("all");
    const [creating, setCreating] = useState(false);
    const { mode: viewMode, setMode: setViewMode } = useViewMode("articles");

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
            <header style={layout.header}>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate("/")}
                    data-testid="article-list-dashboard"
                    title={t("ui.articles.back_to_dashboard_tooltip", "Zum Dashboard")}
                    style={{ marginRight: 8 }}
                >
                    <Home size={14} />
                    {t("ui.articles.back_to_dashboard", "Dashboard")}
                </button>
                <h2 style={layout.heading}>
                    <FileText size={18} style={{ verticalAlign: -3, marginRight: 8 }} />
                    {t("ui.articles.list_heading", "Artikel")}
                </h2>
                <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <ViewToggle mode={viewMode} onChange={setViewMode} />
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void handleCreate()}
                        disabled={creating}
                        data-testid="article-list-new"
                    >
                        <Plus size={14} />
                        {t("ui.articles.new", "Neuer Artikel")}
                    </button>
                </div>
            </header>

            <FilterBar value={filter} onChange={setFilter} />

            {loading ? (
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
                        />
                    ))}
                </ul>
            )}
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
}: {
    article: Article;
    onOpen: () => void;
}) {
    const { t } = useI18n();
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
            onClick={onOpen}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={layout.rowTitle}>{article.title}</div>
                {subtitle && (
                    <div style={layout.rowSubtitle}>{subtitle}</div>
                )}
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
        padding: "24px 32px",
        maxWidth: 960,
        margin: "0 auto",
    },
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
    },
    heading: {
        margin: 0,
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
