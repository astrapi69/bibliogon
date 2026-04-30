/**
 * Grid-view tile for an article. Mirrors ``BookCard``'s shape so the
 * dashboards feel related: featured image (or placeholder) up top,
 * title + status + language at the bottom. Click anywhere to open
 * the editor; the actions menu lives on the editor itself for now
 * (parity with BookCard's recent additions can come later).
 */
import { useState } from "react";
import { AlertTriangle, Clock, MoreVertical, Trash2 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Article } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import CoverPlaceholder from "../CoverPlaceholder";
import styles from "./ArticleCard.module.css";

interface Props {
    article: Article;
    onClick: () => void;
    /** Optional - when omitted, the actions menu is hidden so callers
     *  that have no delete authority (rare) keep a clean tile. */
    onDelete?: () => void;
    /** Optional - when supplied, the actions menu also exposes a
     *  red "Endgültig löschen" item that mirrors the BookCard
     *  permanent-delete shortcut. Calls ``permanentDelete`` directly
     *  on a still-live article (the parent flow soft-deletes first
     *  then permanent-deletes from trash, matching books). */
    onDeletePermanent?: () => void;
}

export default function ArticleCard({ article, onClick, onDelete, onDeletePermanent }: Props) {
    const { t } = useI18n();
    const [menuOpen, setMenuOpen] = useState(false);
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
            className={styles.card}
            onClick={() => {
                if (!menuOpen) onClick();
            }}
        >
            <div className={styles.coverImage}>
                {article.featured_image_url ? (
                    <img
                        src={article.featured_image_url}
                        alt={`${article.title} cover`}
                        className={styles.coverImg}
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
            <div className={styles.content}>
                <h3 className={styles.title}>{article.title}</h3>
                {article.subtitle ? (
                    <p className={styles.subtitle}>{article.subtitle}</p>
                ) : null}
                <p className={styles.author}>
                    {article.author?.trim()
                        ? article.author
                        : t("ui.articles.no_author", "—")}
                </p>
                {article.topic ? (
                    <span className={styles.topic}>{article.topic}</span>
                ) : null}
                <div className={styles.footer}>
                    <span data-testid={`article-card-status-${article.id}`} className={styles.status}>
                        {t(`ui.articles.status_${article.status}`, article.status)}
                    </span>
                    <span className={styles.lang}>{(article.language || "??").toUpperCase()}</span>
                    <span className={styles.date}>
                        <Clock size={12} aria-hidden style={{ verticalAlign: -2, marginRight: 4 }} />
                        {updated}
                    </span>
                    {onDelete ? (
                        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
                            <DropdownMenu.Trigger asChild>
                                <button
                                    className="btn-icon"
                                    data-testid={`article-card-menu-${article.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ marginLeft: "auto" }}
                                    aria-label={t("ui.articles.actions_menu", "Aktionen")}
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
                                        data-testid={`article-card-menu-delete-${article.id}`}
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
                                                data-testid={`article-card-menu-delete-permanent-${article.id}`}
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
            </div>
        </div>
    );
}

