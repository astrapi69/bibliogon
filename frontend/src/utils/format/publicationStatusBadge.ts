import type {BadgeVariant} from "../../lib/components/Badge";

/**
 * Maps a publication-lifecycle status to a Badge variant. The status
 * enum (draft / ready / published / archived) is shared by
 * Book.status and Article.status (PUBLICATION-STATUS-BOOK-PARITY-01),
 * so the badge coloring is identical across the Book + Article
 * dashboards (card + list views).
 *
 * 2026-05-30 component-consistency sweep (Session 2C): replaces the
 * per-surface ad-hoc status pills (ArticleList's badgeBg/badgeFg with
 * hardcoded hex; the cards' plain-text status) with one mapping.
 */
export function publicationStatusVariant(status: string): BadgeVariant {
    switch (status) {
        case "published":
            return "success";
        case "ready":
            return "info";
        case "archived":
            return "muted";
        default:
            return "default";
    }
}

/**
 * Localized labels for the four publication-lifecycle statuses, keyed by
 * status. Shared by Book + Article cards/rows via {@link StatusBadge} so the
 * label set stays identical across surfaces.
 */
export function publicationStatusLabels(
    t: (key: string, fallback?: string) => string,
): Record<string, string> {
    return {
        draft: t("ui.articles.status_draft", "draft"),
        ready: t("ui.articles.status_ready", "ready"),
        published: t("ui.articles.status_published", "published"),
        archived: t("ui.articles.status_archived", "archived"),
    };
}
