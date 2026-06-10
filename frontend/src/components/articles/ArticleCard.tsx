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
import { formatLocaleDate } from "../../utils/formatDate";
import CommentsCountBadge from "./CommentsCountBadge";
import ContentTypeBadge from "./ContentTypeBadge";
import {Badge} from "../Badge";
import {publicationStatusVariant} from "../../utils/publicationStatusBadge";
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
    const { t, lang } = useI18n();
    const [menuOpen, setMenuOpen] = useState(false);
    // Prefer the canonical "first published anywhere" date for
    // imported articles; fall back to ``updated_at`` for native
    // articles that have no publications yet. See lessons-learned:
    // a Medium article published in 2020 should NOT display
    // ``updated_at`` (the 2026 Bibliogon import timestamp) as its
    // public date.
    const displayDateRaw = article.original_published_at ?? article.updated_at;
    const updated = formatLocaleDate(displayDateRaw, lang);

    return (
        <div
            data-testid={`article-card-${article.id}`}
            // View-agnostic id attribute — paired with the
            // ``data-article-id`` on ArticleRow's wrapper so E2E
            // specs can target an article without knowing whether
            // grid or list view is active. See
            // VIEW-MODE-TESTID-PARITY-01.
            data-article-id={article.id}
            className={`card card-interactive ${styles.card}`}
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
                    {/* ARTICLE-TYPES-SSOT-01 C7 (2026-05-29):
                     *  per-type badge mirrors the status/lang/date
                     *  badges; user can tell article-type at a glance
                     *  without opening the editor. */}
                    <ContentTypeBadge
                        contentType={article.content_type}
                        testId={`article-card-type-${article.id}`}
                        className={styles.status}
                    />
                    <Badge
                        testId={`article-card-status-${article.id}`}
                        variant={publicationStatusVariant(article.status ?? "draft")}
                        size="sm"
                    >
                        {t(
                            `ui.articles.status_${article.status ?? "draft"}`,
                            article.status ?? "draft",
                        )}
                    </Badge>
                    <span className={styles.lang}>{(article.language || "??").toUpperCase()}</span>
                    <span className={styles.date}>
                        <Clock size={12} aria-hidden style={{ verticalAlign: -2, marginRight: 4 }} />
                        {updated}
                    </span>
                    {/* MEDIUM-COMMENTS-UI-01 commit 4 / 87ab959:
                        count badge. Visibility + tooltip + icon
                        are owned by the shared CommentsCountBadge
                        component since LIST-VIEW-COMMENTS-COUNT-
                        PARITY-01 extracted the inline version
                        here for re-use in the list view. */}
                    <CommentsCountBadge
                        count={article.comments_count}
                        testId={`article-card-comments-count-${article.id}`}
                        className={styles.commentsBadge}
                    />
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
                                        onSelect={() => onDelete()}
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
                                                onSelect={() => onDeletePermanent()}
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
