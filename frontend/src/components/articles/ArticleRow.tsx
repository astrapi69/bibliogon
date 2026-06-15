import { useMemo, useState } from "react";
import { AlertTriangle, MoreVertical, Trash2 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Article } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import { useArticleImageUrl } from "../../hooks/useArticleImageUrl";
import { publicationStatusVariant } from "../../utils/publicationStatusBadge";
import { formatLocaleDate } from "../../utils/formatDate";
import CoverPlaceholder from "../CoverPlaceholder";
import { Badge } from "../Badge";
import ContentTypeBadge from "./ContentTypeBadge";
import CommentsCountBadge from "./CommentsCountBadge";
import layout from "../../pages/ArticleList.module.css";

/** List-view row for a single article. View-agnostic ``data-article-id``
 *  pairs with ArticleCard's so E2E specs can target an article without
 *  knowing the active view (VIEW-MODE-TESTID-PARITY-01). */
export default function ArticleRow({
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
    const [coverFailed, setCoverFailed] = useState(false);
    // #157: resolve the featured image across storage modes (blob: URL
    // from Dexie offline when cached, served/CDN URL online).
    const imageUrl = useArticleImageUrl(
        article.id,
        article.featured_image_url,
        article.featured_image_asset_id,
    );
    // Prefer original_published_at (computed server-side as the
    // earliest Publication.published_at) over updated_at so imported
    // articles show their canonical Medium publish date instead of
    // the import timestamp. Native articles with no publications
    // fall back to updated_at unchanged.
    const displayDateRaw = article.original_published_at ?? article.updated_at;
    const updated = useMemo(() => formatLocaleDate(displayDateRaw, lang), [displayDateRaw, lang]);

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
                    {imageUrl && !coverFailed ? (
                        <img
                            src={imageUrl}
                            alt={`${article.title} cover`}
                            className={layout.coverThumbImg}
                            onError={() => setCoverFailed(true)}
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
                {article.author?.trim() ? article.author : t("ui.articles.no_author", "—")}
            </div>
            <div className={layout.gridCellTopic}>{article.topic ?? "—"}</div>
            <div className={layout.gridCellStatus}>
                {/* ARTICLE-TYPES-SSOT-01 C7 (2026-05-29): badge
                 *  surfaces the article's content_type alongside
                 *  the publication status. Same visual weight as
                 *  the status badge so users see "tutorial / draft"
                 *  rather than just "draft" in the list view. */}
                <ContentTypeBadge
                    contentType={article.content_type}
                    testId={`article-list-row-type-${article.id}`}
                    className={layout.statusBadge}
                    style={{ marginRight: 6 }}
                />
                <Badge
                    testId={`article-list-row-status-${article.id}`}
                    variant={publicationStatusVariant(article.status ?? "draft")}
                    size="sm"
                >
                    {t(
                        `ui.articles.status_${article.status ?? "draft"}`,
                        article.status ?? "draft",
                    )}
                </Badge>
            </div>
            <div className={layout.gridCellLang}>{(article.language || "??").toUpperCase()}</div>
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
                                            {t("ui.articles.delete_permanent", "Endgültig löschen")}
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
