/**
 * Grid-view tile for an article. Mirrors ``BookCard``'s shape so the
 * dashboards feel related: featured image (or placeholder) up top,
 * title + status + language at the bottom. Click anywhere to open
 * the editor; the actions menu lives on the editor itself for now
 * (parity with BookCard's recent additions can come later).
 */
import type { Article } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import CoverPlaceholder from "../CoverPlaceholder";

interface Props {
    article: Article;
    onClick: () => void;
}

export default function ArticleCard({ article, onClick }: Props) {
    const { t } = useI18n();
    const updated = (() => {
        try {
            return new Date(article.updated_at).toLocaleDateString("de-DE", {
                day: "numeric",
                month: "short",
                year: "numeric",
            });
        } catch {
            return article.updated_at;
        }
    })();

    return (
        <div
            data-testid={`article-card-${article.id}`}
            style={styles.card}
            onClick={onClick}
        >
            <div style={styles.coverImage}>
                {article.featured_image_url ? (
                    <img
                        src={article.featured_image_url}
                        alt={`${article.title} cover`}
                        style={styles.coverImg}
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                        }}
                    />
                ) : (
                    <CoverPlaceholder
                        title={article.title}
                        subtitle={article.subtitle}
                        data-testid={`article-card-placeholder-${article.id}`}
                    />
                )}
            </div>
            <div style={styles.content}>
                <h3 style={styles.title}>{article.title}</h3>
                {article.subtitle ? (
                    <p style={styles.subtitle}>{article.subtitle}</p>
                ) : null}
                {article.topic ? (
                    <span style={styles.topic}>{article.topic}</span>
                ) : null}
                <div style={styles.footer}>
                    <span data-testid={`article-card-status-${article.id}`} style={styles.status}>
                        {t(`ui.articles.status_${article.status}`, article.status)}
                    </span>
                    <span style={styles.lang}>{(article.language || "??").toUpperCase()}</span>
                    <span style={styles.date}>{updated}</span>
                </div>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    card: {
        background: "var(--bg-card)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)",
        border: "1px solid var(--border)",
        cursor: "pointer",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "all 180ms ease",
        // Stretch to the grid row height so all cards match.
        height: "100%",
    },
    coverImage: {
        width: "100%",
        height: 140,
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        overflow: "hidden",
    },
    coverImg: {
        width: "100%",
        height: "100%",
        objectFit: "cover" as const,
    },
    content: {
        padding: "16px 20px",
        flex: 1,
        display: "flex",
        flexDirection: "column",
    },
    title: {
        margin: 0,
        fontSize: "1.125rem",
        fontWeight: 600,
        lineHeight: 1.3,
    },
    subtitle: {
        margin: "4px 0 0 0",
        fontSize: "0.875rem",
        color: "var(--text-muted)",
    },
    topic: {
        display: "inline-block",
        alignSelf: "flex-start",
        marginTop: 8,
        fontSize: "0.6875rem",
        fontWeight: 600,
        background: "var(--accent-light)",
        color: "var(--accent)",
        padding: "2px 8px",
        borderRadius: 4,
    },
    footer: {
        marginTop: "auto",
        paddingTop: 12,
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: "0.75rem",
        color: "var(--text-muted)",
    },
    status: {
        padding: "2px 8px",
        borderRadius: 999,
        background: "var(--bg-secondary)",
        fontWeight: 500,
    },
    lang: {
        fontFamily: "monospace",
    },
    date: {
        marginLeft: "auto",
    },
};
