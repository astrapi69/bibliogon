import type {BadgeVariant} from "../components/Badge";

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
        case "archived":
            return "muted";
        default:
            return "default";
    }
}
